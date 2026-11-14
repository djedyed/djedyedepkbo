// DJ Eddie Ed — EPK back office
// Think of it as the DJ booth behind the dancefloor: the public site is what the
// crowd sees; this is where you choose what plays, check the requests and keep
// the receipts. Everything is stored in Supabase and guarded by Row Level Security.
import { SUPABASE_URL, SUPABASE_KEY, SUPABASE_PROJECT_REF, PUBLIC_SITE_URL } from './config.js';
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

// ---------------------------------------------------------------- helpers
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else if (k === 'value') node.value = v;
    else if (k === 'checked') node.checked = !!v;
    else node.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) if (c != null && c !== false) node.append(c);
  return node;
}

function safeUrl(url) {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : null;
  } catch {
    return null;
  }
}

function extLink(label, url) {
  const href = safeUrl(url);
  return href ? el('a', { href, target: '_blank', rel: 'noopener', text: label }) : document.createTextNode(label);
}

let toastTimer;
function toast(msg, isErr = false) {
  const t = $('#toast');
  t.textContent = msg;
  t.className = isErr ? 'toast err' : 'toast';
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, isErr ? 6000 : 2600);
}

function isMissingSchema(error) {
  if (!error) return false;
  return ['42P01', 'PGRST202', 'PGRST205', '42883'].includes(error.code) ||
    /could not find|does not exist|schema cache/i.test(error.message || '');
}

function fmtDate(d) {
  if (!d) return '';
  // A bare date (2026-12-31) is a calendar day, not a UTC instant: read it in local time.
  const date = /^\d{4}-\d{2}-\d{2}$/.test(d) ? new Date(`${d}T00:00:00`) : new Date(d);
  return isNaN(date) ? String(d) : date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function show(view) {
  for (const v of ['login', 'setup', 'denied', 'app']) $(`#view-${v}`).hidden = v !== view;
}

function showSetup(error) {
  $('#setup-detail').textContent = error?.message ? `Supabase said: ${error.message}` : '';
  show('setup');
}

// ---------------------------------------------------------------- auth
async function start() {
  const { data } = await sb.auth.getSession();
  if (!data.session) return show('login');
  await afterLogin(data.session);
}

async function afterLogin(session) {
  $('#who').hidden = false;
  $('#who-email').textContent = session.user.email || '';
  const { data: isAdmin, error } = await sb.rpc('epk_claim_admin');
  if (error) return isMissingSchema(error) ? showSetup(error) : toast(error.message, true);
  if (!isAdmin) return show('denied');
  show('app');
  openTab('inbox');
}

$('#login-form').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const fd = new FormData(ev.target);
  const status = $('#login-status');
  status.className = 'status';
  status.textContent = 'Signing in…';
  const { data, error } = await sb.auth.signInWithPassword({ email: fd.get('email'), password: fd.get('password') });
  if (error) {
    status.textContent = error.message;
    status.classList.add('err');
    return;
  }
  status.textContent = '';
  await afterLogin(data.session);
});

$('#signup').addEventListener('click', async () => {
  const form = $('#login-form');
  if (!form.reportValidity()) return;
  const fd = new FormData(form);
  const status = $('#login-status');
  status.className = 'status';
  const { data, error } = await sb.auth.signUp({ email: fd.get('email'), password: fd.get('password') });
  if (error) {
    status.textContent = error.message;
    status.classList.add('err');
    return;
  }
  if (data.session) return afterLogin(data.session);
  status.textContent = 'Account created. Confirm it from the email Supabase sent, then sign in here.';
  status.classList.add('ok');
});

$('#signout').addEventListener('click', async () => {
  await sb.auth.signOut();
  $('#who').hidden = true;
  show('login');
});

// ---------------------------------------------------------------- tabs
const TABS = {};
async function openTab(name) {
  for (const b of $$('.tabs button')) {
    if (b.dataset.tab === name) b.setAttribute('aria-current', 'page');
    else b.removeAttribute('aria-current');
  }
  const panel = $('#panel');
  panel.replaceChildren(el('p', { class: 'muted', text: 'Loading…' }));
  try {
    await TABS[name](panel);
  } catch (e) {
    if (isMissingSchema(e)) return showSetup(e);
    panel.replaceChildren(el('p', { class: 'status err', text: e.message || String(e) }));
  }
  refreshNewCount();
}
for (const b of $$('.tabs button')) b.addEventListener('click', () => openTab(b.dataset.tab));

async function refreshNewCount() {
  const { count } = await sb.from('epk_inquiries').select('id', { count: 'exact', head: true }).eq('status', 'new');
  const badge = $('#new-count');
  badge.hidden = !count;
  badge.textContent = count || '';
}

async function must(promise) {
  const { data, error } = await promise;
  if (error) throw error;
  return data;
}

// ---------------------------------------------------------------- inbox
const STATUSES = ['new', 'replied', 'quoted', 'booked', 'declined', 'archived'];
let inboxFilter = 'new';

TABS.inbox = async (panel) => {
  const rows = await must(sb.from('epk_inquiries').select('*').order('created_at', { ascending: false }));
  const shown = inboxFilter === 'all' ? rows : rows.filter((r) => r.status === inboxFilter);

  const filters = el('div', { class: 'filters', role: 'group', 'aria-label': 'Filter by status' },
    ...['new', 'all', ...STATUSES.slice(1)].map((s) =>
      el('button', {
        type: 'button', 'aria-pressed': String(s === inboxFilter),
        text: `${s} (${s === 'all' ? rows.length : rows.filter((r) => r.status === s).length})`,
        onclick: () => { inboxFilter = s; openTab('inbox'); },
      })));

  panel.replaceChildren(
    el('div', { class: 'panel-head' }, el('h2', { text: 'Booking inbox' })),
    filters,
    shown.length ? el('div', { class: 'list' }, ...shown.map(inquiryCard)) : el('p', { class: 'empty', text: 'Nothing here yet.' }),
  );
};

function inquiryCard(r) {
  const status = el('select', { 'aria-label': 'Status' }, ...STATUSES.map((s) => el('option', { value: s, text: s })));
  status.value = r.status;
  const notes = el('textarea', { rows: 3, 'aria-label': 'Private notes', placeholder: 'Private notes (only you see these)' });
  notes.value = r.admin_notes || '';
  const cleanEmail = String(r.email || '').replace(/[^\w.+@-]/g, '');
  const subject = encodeURIComponent('Your booking inquiry — DJ Eddie Ed');

  const meta = [
    r.event_date && `Date: ${fmtDate(r.event_date)}`,
    r.event_type && `Type: ${r.event_type}`,
    r.venue && `Venue: ${r.venue}`,
    r.city && `City: ${r.city}`,
    r.guests != null && `Guests: ${r.guests}`,
    r.budget && `Budget: ${r.budget}`,
    r.phone && `Phone: ${r.phone}`,
  ].filter(Boolean).join('  ·  ');

  return el('article', { class: 'item' },
    el('div', { class: 'item-head' },
      el('div', {},
        el('h3', { text: r.name }),
        el('div', { class: 'item-meta' }, el('a', { href: `mailto:${cleanEmail}?subject=${subject}`, text: cleanEmail }), `  ·  received ${fmtDate(r.created_at)}`)),
      el('span', { class: `pill ${r.status}`, text: r.status })),
    meta ? el('div', { class: 'item-meta', text: meta }) : null,
    r.message ? el('p', { text: r.message }) : null,
    el('div', { class: 'form-grid' }, el('label', {}, 'Status', status), el('label', { class: 'wide' }, 'Private notes', notes)),
    el('div', { class: 'row' },
      el('button', {
        class: 'btn btn-primary btn-sm', type: 'button', text: 'Save',
        onclick: async () => {
          const { error } = await sb.from('epk_inquiries').update({ status: status.value, admin_notes: notes.value || null }).eq('id', r.id);
          if (error) return toast(error.message, true);
          toast('Saved');
          openTab('inbox');
        },
      }),
      el('a', { class: 'btn btn-ghost btn-sm', href: `mailto:${cleanEmail}?subject=${subject}`, text: 'Reply by email' }),
      el('button', {
        class: 'btn btn-danger btn-sm', type: 'button', text: 'Delete',
        onclick: async () => {
          if (!confirm(`Delete the inquiry from ${r.name}? This cannot be undone.`)) return;
          const { error } = await sb.from('epk_inquiries').delete().eq('id', r.id);
          if (error) return toast(error.message, true);
          toast('Deleted');
          openTab('inbox');
        },
      })),
  );
}

// ---------------------------------------------------------------- generic form fields
function fieldInput(f, value) {
  const id = `f-${f.k}`;
  let input;
  if (f.type === 'textarea' || f.type === 'list') {
    input = el('textarea', { id, name: f.k, rows: f.rows || (f.type === 'list' ? 5 : 4) });
    input.value = f.type === 'list' ? (value || []).join('\n') : (value ?? '');
  } else if (f.type === 'select') {
    input = el('select', { id, name: f.k }, ...f.options.map(([v, label]) => el('option', { value: v, text: label })));
    input.value = value ?? f.options[0][0];
  } else if (f.type === 'checkbox') {
    input = el('input', { id, name: f.k, type: 'checkbox', checked: value ?? f.default ?? false });
    return el('label', { class: 'check', for: id }, input, f.label);
  } else {
    const type = f.type === 'number' ? 'number' : f.type === 'url' ? 'url' : f.type === 'email' ? 'email' : 'text';
    input = el('input', { id, name: f.k, type, step: f.step });
    input.value = f.type === 'csv' ? (value || []).join(', ') : (value ?? '');
  }
  if (f.req) input.required = true;
  return el('label', { for: id, class: f.wide || f.type === 'textarea' || f.type === 'list' ? 'wide' : null },
    el('span', {}, f.label, f.hint ? el('span', { class: 'muted hint', text: ` — ${f.hint}` }) : null), input);
}

function readFields(form, fields) {
  const out = {};
  for (const f of fields) {
    const input = form.elements[f.k];
    if (!input) continue;
    if (f.type === 'checkbox') out[f.k] = input.checked;
    else if (f.type === 'number') out[f.k] = input.value === '' ? null : Number(input.value);
    else if (f.type === 'list') out[f.k] = input.value.split('\n').map((s) => s.trim()).filter(Boolean);
    else if (f.type === 'csv') out[f.k] = input.value.split(',').map((s) => s.trim()).filter(Boolean);
    else out[f.k] = input.value.trim() === '' ? null : input.value.trim();
  }
  return out;
}

// ---------------------------------------------------------------- generic list editor
const PROOF_OPTIONS = [
  ['third_party', 'Third-party record (venue listing, press, platform)'],
  ['artist_published', 'Artist-published (your own profile or flyer)'],
  ['artist_stated', 'Artist-stated (no public source yet)'],
];

const CRUD = {
  highlights: {
    title: 'Lifetime highlights',
    table: 'epk_highlights',
    order: 'sort_order',
    defaults: { is_published: false, proof_level: 'artist_stated', sort_order: 99 },
    fields: [
      { k: 'year_label', label: 'Year label', req: true, hint: 'e.g. 2001 or Feb 23, 2023' },
      { k: 'sort_year', label: 'Year (for sorting)', type: 'number', req: true },
      { k: 'title', label: 'Title', req: true, wide: true },
      { k: 'detail', label: 'Detail', type: 'textarea', rows: 3 },
      { k: 'venue', label: 'Venue' },
      { k: 'city', label: 'City' },
      { k: 'proof_level', label: 'Proof level', type: 'select', options: PROOF_OPTIONS, wide: true },
      { k: 'source_label', label: 'Source label' },
      { k: 'source_url', label: 'Source link', type: 'url' },
      { k: 'source2_label', label: 'Second source label' },
      { k: 'source2_url', label: 'Second source link', type: 'url' },
      { k: 'sort_order', label: 'Position on page', type: 'number' },
      { k: 'featured', label: 'Feature at the top of the site', type: 'checkbox' },
      { k: 'is_published', label: 'Show on the public site', type: 'checkbox' },
    ],
    rowTitle: (r) => `${r.year_label} — ${r.title}`,
    rowPills: (r) => [el('span', { class: `pill ${r.proof_level}`, text: r.proof_level.replace('_', '-') }), r.is_published ? null : el('span', { class: 'pill draft', text: 'hidden' }), r.featured ? el('span', { class: 'pill booked', text: 'featured' }) : null],
    rowMeta: (r) => [r.venue, r.city, r.source_label].filter(Boolean).join(' · '),
    proofs: true,
  },
  links: {
    title: 'Links & mixes',
    table: 'epk_links',
    order: 'sort_order',
    defaults: { kind: 'mix', is_published: true, sort_order: 99 },
    fields: [
      { k: 'kind', label: 'Kind', type: 'select', options: [['mix', 'Mix (shows a Mixcloud player)'], ['social', 'Social / profile'], ['booking', 'Booking'], ['press', 'Press']] },
      { k: 'label', label: 'Label', req: true },
      { k: 'url', label: 'Link', type: 'url', req: true, wide: true },
      { k: 'note', label: 'Note', hint: 'genres for a mix, handle for a social', wide: true },
      { k: 'sort_order', label: 'Position', type: 'number' },
      { k: 'is_published', label: 'Show on the public site', type: 'checkbox' },
    ],
    rowTitle: (r) => r.label,
    rowPills: (r) => [el('span', { class: 'pill', text: r.kind }), r.is_published ? null : el('span', { class: 'pill draft', text: 'hidden' })],
    rowMeta: (r) => r.url,
  },
  reviews: {
    title: 'Client reviews',
    table: 'epk_reviews',
    order: 'sort_order',
    defaults: { is_published: true, sort_order: 99 },
    fields: [
      { k: 'quote', label: 'Quote (word for word)', type: 'textarea', req: true, rows: 3 },
      { k: 'author', label: 'Who said it', req: true },
      { k: 'source_label', label: 'Where it was published' },
      { k: 'source_url', label: 'Link to the review', type: 'url' },
      { k: 'sort_order', label: 'Position', type: 'number' },
      { k: 'is_published', label: 'Show on the public site', type: 'checkbox' },
    ],
    rowTitle: (r) => `“${r.quote}”`,
    rowPills: (r) => [r.is_published ? null : el('span', { class: 'pill draft', text: 'hidden' })],
    rowMeta: (r) => [r.author, r.source_label].filter(Boolean).join(' · '),
  },
  rates: {
    title: 'Rates (private — never shown publicly)',
    table: 'epk_rates',
    order: 'sort_order',
    defaults: { currency: 'USD', unit: 'per event', sort_order: 99 },
    fields: [
      { k: 'label', label: 'Package', req: true, hint: 'e.g. Club night, 4 hrs' },
      { k: 'amount', label: 'Amount', type: 'number', step: '0.01' },
      { k: 'currency', label: 'Currency' },
      { k: 'unit', label: 'Unit' },
      { k: 'notes', label: 'Notes', type: 'textarea', rows: 3 },
      { k: 'sort_order', label: 'Position', type: 'number' },
    ],
    rowTitle: (r) => r.label,
    rowPills: () => [],
    rowMeta: (r) => [r.amount != null ? `${r.currency} ${Number(r.amount).toFixed(2)}` : null, r.unit, r.notes].filter(Boolean).join(' · '),
  },
};

for (const [name, cfg] of Object.entries(CRUD)) TABS[name] = (panel) => renderCrud(panel, name, cfg);

async function renderCrud(panel, name, cfg, editing = undefined) {
  const rows = await must(sb.from(cfg.table).select('*').order(cfg.order));
  const editorSlot = el('div');
  const head = el('div', { class: 'panel-head' },
    el('h2', { text: cfg.title }),
    el('button', { class: 'btn btn-primary btn-sm', type: 'button', text: 'Add new', onclick: () => openEditor(editorSlot, name, cfg, null) }));

  const list = rows.length
    ? el('div', { class: 'list' }, ...rows.map((r) => el('article', { class: 'item' },
      el('div', { class: 'item-head' },
        el('h3', { text: cfg.rowTitle(r) }),
        el('div', { class: 'row' }, ...cfg.rowPills(r))),
      cfg.rowMeta(r) ? el('div', { class: 'item-meta', text: cfg.rowMeta(r) }) : null,
      el('div', { class: 'row' },
        el('button', { class: 'btn btn-ghost btn-sm', type: 'button', text: 'Edit', onclick: () => openEditor(editorSlot, name, cfg, r) }),
        el('button', {
          class: 'btn btn-danger btn-sm', type: 'button', text: 'Delete',
          onclick: async () => {
            if (!confirm('Delete this entry? This cannot be undone.')) return;
            const { error } = await sb.from(cfg.table).delete().eq('id', r.id);
            if (error) return toast(error.message, true);
            toast('Deleted');
            openTab(name);
          },
        })))))
    : el('p', { class: 'empty', text: 'Nothing here yet.' });

  panel.replaceChildren(head, editorSlot, list);
  if (editing) openEditor(editorSlot, name, cfg, editing);
}

async function openEditor(slot, name, cfg, row) {
  const data = row || cfg.defaults;
  const form = el('form', { class: 'editor', novalidate: true },
    el('h2', { text: row ? 'Edit' : 'Add new' }),
    el('div', { class: 'form-grid' }, ...cfg.fields.map((f) => fieldInput(f, data[f.k]))),
    el('div', { class: 'row' },
      el('button', { class: 'btn btn-primary', type: 'submit', text: 'Save' }),
      el('button', { class: 'btn btn-ghost', type: 'button', text: 'Cancel', onclick: () => slot.replaceChildren() })));

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    if (!form.reportValidity()) return;
    const values = readFields(form, cfg.fields);
    const q = row ? sb.from(cfg.table).update(values).eq('id', row.id) : sb.from(cfg.table).insert(values);
    const { error } = await q;
    if (error) return toast(error.message, true);
    toast('Saved');
    openTab(name);
  });

  slot.replaceChildren(form);
  if (cfg.proofs && row) form.append(await proofSection(row));
  form.scrollIntoView({ behavior: 'smooth', block: 'start' });
  form.querySelector('input, textarea, select')?.focus();
}

// ---------------------------------------------------------------- proof vault (private storage)
async function proofSection(highlight) {
  const box = el('section', { class: 'proofs', 'aria-label': 'Proof files' });
  const refresh = async () => {
    const proofs = await must(sb.from('epk_proofs').select('*').eq('highlight_id', highlight.id).order('created_at'));
    const file = el('input', { type: 'file', 'aria-label': 'Proof file', accept: 'image/*,application/pdf,video/*' });
    const note = el('input', { type: 'text', placeholder: 'What is this? e.g. flyer, contract, photo', 'aria-label': 'Proof note' });
    const ext = el('input', { type: 'url', placeholder: 'https://… (link instead of a file)', 'aria-label': 'Proof link' });

    box.replaceChildren(
      el('h3', { text: 'Proof vault — private, only you can open these' }),
      ...(proofs.length ? proofs.map((p) => el('div', { class: 'proof' },
        el('span', { text: `${p.note || 'Proof'} · ${fmtDate(p.created_at)}` }),
        el('div', { class: 'row' },
          p.storage_path ? el('button', {
            class: 'btn btn-ghost btn-sm', type: 'button', text: 'Open',
            onclick: async () => {
              const { data, error } = await sb.storage.from('epk-proofs').createSignedUrl(p.storage_path, 120);
              if (error) return toast(error.message, true);
              window.open(data.signedUrl, '_blank', 'noopener');
            },
          }) : extLink('Open link', p.external_url),
          el('button', {
            class: 'btn btn-danger btn-sm', type: 'button', text: 'Remove',
            onclick: async () => {
              if (!confirm('Remove this proof? The file is deleted for good.')) return;
              if (p.storage_path) await sb.storage.from('epk-proofs').remove([p.storage_path]);
              const { error } = await sb.from('epk_proofs').delete().eq('id', p.id);
              if (error) return toast(error.message, true);
              refresh();
            },
          })))) : [el('p', { class: 'muted', text: 'No proof stored yet. Add the flyer, a photo, a contract or a link.' })]),
      el('div', { class: 'form-grid' }, el('label', {}, 'File', file), el('label', {}, 'Or a link', ext), el('label', { class: 'wide' }, 'Note', note)),
      el('div', { class: 'row' }, el('button', {
        class: 'btn btn-ghost btn-sm', type: 'button', text: 'Add proof',
        onclick: async (ev) => {
          const btn = ev.currentTarget;
          const f = file.files[0];
          const link = ext.value.trim();
          if (!f && !safeUrl(link)) return toast('Choose a file or paste a link first.', true);
          btn.disabled = true;
          try {
            let storage_path = null;
            if (f) {
              storage_path = `${highlight.id}/${Date.now()}-${f.name.replace(/[^\w.-]+/g, '_').slice(-80)}`;
              const up = await sb.storage.from('epk-proofs').upload(storage_path, f, { upsert: false });
              if (up.error) throw up.error;
            }
            const { error } = await sb.from('epk_proofs').insert({
              highlight_id: highlight.id, storage_path, external_url: f ? null : safeUrl(link), note: note.value.trim() || null,
            });
            if (error) throw error;
            toast('Proof saved');
            refresh();
          } catch (e) {
            toast(e.message || String(e), true);
          } finally {
            btn.disabled = false;
          }
        },
      })),
    );
  };
  await refresh();
  return box;
}

// ---------------------------------------------------------------- profile
const PROFILE_FIELDS = [
  { k: 'stage_name', label: 'Stage name', req: true },
  { k: 'aka', label: 'Also known as' },
  { k: 'tagline', label: 'Tagline', wide: true },
  { k: 'short_bio', label: 'Short bio (roster-ready)', type: 'textarea', rows: 4 },
  { k: 'full_bio', label: 'Full bio', type: 'textarea', rows: 10, hint: 'leave a blank line between paragraphs' },
  { k: 'base_location', label: 'Based in' },
  { k: 'genres', label: 'Genres', type: 'csv', wide: true, hint: 'separate with commas' },
  { k: 'booking_url', label: 'Booking link', type: 'url' },
  { k: 'booking_email', label: 'Public booking email (optional)', type: 'email' },
  { k: 'booking_phone', label: 'Public booking phone (optional)', hint: 'with country code' },
  { k: 'hero_image_url', label: 'Press photo link', type: 'url', wide: true },
  { k: 'rider_bring', label: 'Rider — I bring', type: 'list', hint: 'one item per line' },
  { k: 'rider_venue', label: 'Rider — venue provides', type: 'list', hint: 'one item per line' },
];

TABS.profile = async (panel) => {
  const row = (await must(sb.from('epk_profile').select('*').eq('id', 1).maybeSingle())) || { id: 1 };
  const photo = el('input', { type: 'file', accept: 'image/*', 'aria-label': 'Upload press photo' });
  const form = el('form', { class: 'editor', novalidate: true },
    el('div', { class: 'form-grid' }, ...PROFILE_FIELDS.map((f) => fieldInput(f, row[f.k]))),
    el('div', { class: 'row' },
      el('label', {}, 'Upload a press photo (public)', photo),
      el('button', {
        class: 'btn btn-ghost btn-sm', type: 'button', text: 'Upload photo',
        onclick: async () => {
          const f = photo.files[0];
          if (!f) return toast('Choose a photo first.', true);
          const path = `press/${Date.now()}-${f.name.replace(/[^\w.-]+/g, '_').slice(-80)}`;
          const { error } = await sb.storage.from('epk-press').upload(path, f, { upsert: false });
          if (error) return toast(error.message, true);
          const { data } = sb.storage.from('epk-press').getPublicUrl(path);
          form.elements.hero_image_url.value = data.publicUrl;
          toast('Uploaded — press Save profile to use it');
        },
      })),
    el('div', { class: 'row' }, el('button', { class: 'btn btn-primary', type: 'submit', text: 'Save profile' })));

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    if (!form.reportValidity()) return;
    const values = { id: 1, ...readFields(form, PROFILE_FIELDS) };
    const { error } = await sb.from('epk_profile').upsert(values);
    if (error) return toast(error.message, true);
    toast('Profile saved — the public site updates on refresh');
  });

  panel.replaceChildren(el('div', { class: 'panel-head' }, el('h2', { text: 'Profile' })), form);
};

// ---------------------------------------------------------------- publish
TABS.publish = async (panel) => {
  const status = el('p', { class: 'status', role: 'status' });
  panel.replaceChildren(
    el('div', { class: 'panel-head' }, el('h2', { text: 'Publish' })),
    el('div', { class: 'list' },
      el('article', { class: 'item' },
        el('h3', { text: 'Your public site reads live from here' }),
        el('p', { text: 'Anything marked “Show on the public site” appears on the EPK as soon as a visitor loads the page.' }),
        el('div', { class: 'row' }, extLink('Open the public EPK →', PUBLIC_SITE_URL))),
      el('article', { class: 'item' },
        el('h3', { text: 'Backup snapshot (content.json)' }),
        el('p', { text: 'The public site also keeps a static copy so it still works if Supabase is ever unreachable. Download a fresh snapshot after big edits and commit it to the djedyedepk repository, replacing content.json.' }),
        el('div', { class: 'row' }, el('button', { class: 'btn btn-primary btn-sm', type: 'button', text: 'Download content.json', onclick: () => downloadSnapshot(status) })),
        status),
      el('article', { class: 'item' },
        el('h3', { text: 'Lock the door' }),
        el('p', { text: 'Once your admin account works, switch off new sign-ups in Supabase so nobody else can create an account: Authentication → Sign In / Providers → turn off “Allow new users to sign up”.' }),
        el('div', { class: 'row' }, extLink('Open Supabase auth settings →', `https://supabase.com/dashboard/project/${SUPABASE_PROJECT_REF}/auth/providers`)))));
};

async function downloadSnapshot(status) {
  try {
    const [profile, highlights, links, reviews] = await Promise.all([
      must(sb.from('epk_profile').select('stage_name, aka, tagline, short_bio, full_bio, base_location, genres, booking_url, booking_email, booking_phone, hero_image_url, rider_bring, rider_venue').eq('id', 1).single()),
      must(sb.from('epk_highlights').select('year_label, sort_year, title, detail, venue, city, proof_level, source_label, source_url, source2_label, source2_url, featured, sort_order').eq('is_published', true).order('sort_order')),
      must(sb.from('epk_links').select('kind, label, url, note, sort_order').eq('is_published', true).order('sort_order')),
      must(sb.from('epk_reviews').select('quote, author, source_label, source_url, sort_order').eq('is_published', true).order('sort_order')),
    ]);
    const snapshot = { generated_at: new Date().toISOString(), profile, highlights, links, reviews };
    const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' });
    const a = el('a', { href: URL.createObjectURL(blob), download: 'content.json' });
    document.body.append(a);
    a.click();
    a.remove();
    status.textContent = 'Snapshot downloaded.';
    status.className = 'status ok';
  } catch (e) {
    status.textContent = e.message || String(e);
    status.className = 'status err';
  }
}

start();
