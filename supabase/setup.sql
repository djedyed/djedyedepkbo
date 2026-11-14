-- =====================================================================
--  DJ Eddie Ed — EPK back office · Supabase setup
--  Paste this whole file into Supabase → SQL Editor → Run.
--  Safe to run more than once: it never drops or overwrites your data.
--  Every table is prefixed epk_ so it can live beside other projects.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- 1. Who is allowed into the back office
-- ---------------------------------------------------------------------
create table if not exists public.epk_admins (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.epk_admins enable row level security;

create or replace function public.epk_is_admin()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (select 1 from public.epk_admins where user_id = auth.uid());
$$;
revoke all on function public.epk_is_admin() from public;
grant execute on function public.epk_is_admin() to anon, authenticated;

-- The FIRST signed-in user to call this becomes the only admin.
-- After that it just answers "am I an admin?".
create or replace function public.epk_claim_admin()
returns boolean
language plpgsql security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return false;
  end if;
  if exists (select 1 from public.epk_admins) then
    return exists (select 1 from public.epk_admins where user_id = auth.uid());
  end if;
  insert into public.epk_admins (user_id) values (auth.uid());
  return true;
end;
$$;
revoke all on function public.epk_claim_admin() from public, anon;
grant execute on function public.epk_claim_admin() to authenticated;

drop policy if exists "epk admins read" on public.epk_admins;
create policy "epk admins read" on public.epk_admins
  for select to authenticated using (public.epk_is_admin());

-- ---------------------------------------------------------------------
-- 2. Helper: keep updated_at fresh
-- ---------------------------------------------------------------------
create or replace function public.epk_touch_updated_at()
returns trigger language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- 3. Public content (readable by the public site when published)
-- ---------------------------------------------------------------------
create table if not exists public.epk_profile (
  id             int primary key default 1 check (id = 1),
  stage_name     text not null default 'DJ Eddie Ed',
  aka            text default 'djedyed',
  tagline        text,
  short_bio      text,
  full_bio       text,
  base_location  text,
  genres         text[] not null default '{}',
  booking_url    text,
  booking_email  text,
  hero_image_url text,
  rider_bring    text[] not null default '{}',
  rider_venue    text[] not null default '{}',
  updated_at     timestamptz not null default now()
);

create table if not exists public.epk_highlights (
  id            uuid primary key default gen_random_uuid(),
  sort_year     int  not null,
  year_label    text not null,
  title         text not null,
  detail        text,
  venue         text,
  city          text,
  proof_level   text not null default 'artist_stated'
                check (proof_level in ('third_party', 'artist_published', 'artist_stated')),
  source_label  text,
  source_url    text,
  source2_label text,
  source2_url   text,
  featured      boolean not null default false,
  is_published  boolean not null default false,
  sort_order    int not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table if not exists public.epk_links (
  id           uuid primary key default gen_random_uuid(),
  kind         text not null check (kind in ('mix', 'social', 'booking', 'press')),
  label        text not null,
  url          text not null,
  note         text,
  is_published boolean not null default true,
  sort_order   int not null default 0,
  created_at   timestamptz not null default now()
);

create table if not exists public.epk_reviews (
  id           uuid primary key default gen_random_uuid(),
  quote        text not null,
  author       text not null,
  source_label text,
  source_url   text,
  is_published boolean not null default true,
  sort_order   int not null default 0,
  created_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 4. Private back-office data (admin only)
-- ---------------------------------------------------------------------
create table if not exists public.epk_inquiries (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  name        text not null check (char_length(name) between 1 and 120),
  email       text not null check (char_length(email) <= 200 and email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  phone       text check (char_length(phone) <= 40),
  event_date  date,
  event_type  text check (char_length(event_type) <= 80),
  venue       text check (char_length(venue) <= 160),
  city        text check (char_length(city) <= 120),
  guests      int  check (guests between 0 and 100000),
  budget      text check (char_length(budget) <= 80),
  message     text check (char_length(message) <= 4000),
  source      text default 'epk-site' check (char_length(source) <= 60),
  status      text not null default 'new'
              check (status in ('new', 'replied', 'quoted', 'booked', 'declined', 'archived')),
  admin_notes text,
  updated_at  timestamptz not null default now()
);

create table if not exists public.epk_rates (
  id         uuid primary key default gen_random_uuid(),
  label      text not null,
  amount     numeric(10, 2),
  currency   text not null default 'USD',
  unit       text default 'per event',
  notes      text,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.epk_proofs (
  id           uuid primary key default gen_random_uuid(),
  highlight_id uuid references public.epk_highlights(id) on delete cascade,
  storage_path text,
  external_url text,
  note         text,
  created_at   timestamptz not null default now()
);

-- updated_at triggers
drop trigger if exists epk_profile_touch on public.epk_profile;
create trigger epk_profile_touch before update on public.epk_profile
  for each row execute function public.epk_touch_updated_at();
drop trigger if exists epk_highlights_touch on public.epk_highlights;
create trigger epk_highlights_touch before update on public.epk_highlights
  for each row execute function public.epk_touch_updated_at();
drop trigger if exists epk_inquiries_touch on public.epk_inquiries;
create trigger epk_inquiries_touch before update on public.epk_inquiries
  for each row execute function public.epk_touch_updated_at();

-- ---------------------------------------------------------------------
-- 5. Row Level Security — the bouncer at the door
-- ---------------------------------------------------------------------
alter table public.epk_profile    enable row level security;
alter table public.epk_highlights enable row level security;
alter table public.epk_links      enable row level security;
alter table public.epk_reviews    enable row level security;
alter table public.epk_inquiries  enable row level security;
alter table public.epk_rates      enable row level security;
alter table public.epk_proofs     enable row level security;

-- Profile: everyone may read; only the admin may change it.
drop policy if exists "epk profile public read" on public.epk_profile;
create policy "epk profile public read" on public.epk_profile
  for select to anon, authenticated using (true);
drop policy if exists "epk profile admin write" on public.epk_profile;
create policy "epk profile admin write" on public.epk_profile
  for all to authenticated using (public.epk_is_admin()) with check (public.epk_is_admin());

-- Highlights, links, reviews: public sees published rows; admin sees and edits all.
drop policy if exists "epk highlights public read" on public.epk_highlights;
create policy "epk highlights public read" on public.epk_highlights
  for select to anon, authenticated using (is_published or public.epk_is_admin());
drop policy if exists "epk highlights admin write" on public.epk_highlights;
create policy "epk highlights admin write" on public.epk_highlights
  for all to authenticated using (public.epk_is_admin()) with check (public.epk_is_admin());

drop policy if exists "epk links public read" on public.epk_links;
create policy "epk links public read" on public.epk_links
  for select to anon, authenticated using (is_published or public.epk_is_admin());
drop policy if exists "epk links admin write" on public.epk_links;
create policy "epk links admin write" on public.epk_links
  for all to authenticated using (public.epk_is_admin()) with check (public.epk_is_admin());

drop policy if exists "epk reviews public read" on public.epk_reviews;
create policy "epk reviews public read" on public.epk_reviews
  for select to anon, authenticated using (is_published or public.epk_is_admin());
drop policy if exists "epk reviews admin write" on public.epk_reviews;
create policy "epk reviews admin write" on public.epk_reviews
  for all to authenticated using (public.epk_is_admin()) with check (public.epk_is_admin());

-- Inquiries: the public can only DROP OFF a new inquiry; nobody but the admin can read them.
drop policy if exists "epk inquiries public insert" on public.epk_inquiries;
create policy "epk inquiries public insert" on public.epk_inquiries
  for insert to anon, authenticated
  with check (status = 'new' and admin_notes is null);
drop policy if exists "epk inquiries admin read" on public.epk_inquiries;
create policy "epk inquiries admin read" on public.epk_inquiries
  for select to authenticated using (public.epk_is_admin());
drop policy if exists "epk inquiries admin update" on public.epk_inquiries;
create policy "epk inquiries admin update" on public.epk_inquiries
  for update to authenticated using (public.epk_is_admin()) with check (public.epk_is_admin());
drop policy if exists "epk inquiries admin delete" on public.epk_inquiries;
create policy "epk inquiries admin delete" on public.epk_inquiries
  for delete to authenticated using (public.epk_is_admin());

-- Rates and proofs: admin only, full stop.
drop policy if exists "epk rates admin all" on public.epk_rates;
create policy "epk rates admin all" on public.epk_rates
  for all to authenticated using (public.epk_is_admin()) with check (public.epk_is_admin());
drop policy if exists "epk proofs admin all" on public.epk_proofs;
create policy "epk proofs admin all" on public.epk_proofs
  for all to authenticated using (public.epk_is_admin()) with check (public.epk_is_admin());

-- ---------------------------------------------------------------------
-- 6. File storage: private proof vault + public press photos
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('epk-proofs', 'epk-proofs', false)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('epk-press', 'epk-press', true)
on conflict (id) do nothing;

drop policy if exists "epk proofs files admin read" on storage.objects;
create policy "epk proofs files admin read" on storage.objects
  for select to authenticated using (bucket_id = 'epk-proofs' and public.epk_is_admin());
drop policy if exists "epk proofs files admin insert" on storage.objects;
create policy "epk proofs files admin insert" on storage.objects
  for insert to authenticated with check (bucket_id = 'epk-proofs' and public.epk_is_admin());
drop policy if exists "epk proofs files admin delete" on storage.objects;
create policy "epk proofs files admin delete" on storage.objects
  for delete to authenticated using (bucket_id = 'epk-proofs' and public.epk_is_admin());

drop policy if exists "epk press files admin insert" on storage.objects;
create policy "epk press files admin insert" on storage.objects
  for insert to authenticated with check (bucket_id = 'epk-press' and public.epk_is_admin());
drop policy if exists "epk press files admin delete" on storage.objects;
create policy "epk press files admin delete" on storage.objects
  for delete to authenticated using (bucket_id = 'epk-press' and public.epk_is_admin());

-- ---------------------------------------------------------------------
-- 7. Starting content — sourced and tagged. Only inserted into empty tables.
-- ---------------------------------------------------------------------
insert into public.epk_profile (
  id, stage_name, aka, tagline, short_bio, full_bio, base_location, genres, booking_url,
  rider_bring, rider_venue
) values (
  1,
  'DJ Eddie Ed',
  'djedyed',
  'The musical bridge between Southern Africa & the US.',
  'DJ Eddie Ed (djedyed) is a New York–based DJ and music curator who has spent more than two decades connecting Southern African dance music with American crowds. A Botswana National DJ ''98 mix show champion and an early champion of kwaito in the US, he has played Central Park SummerStage, NJPAC and, in 2023, the Apollo Theater in Harlem.',
  E'Eddie Ed grew up between Zimbabwe, Botswana and South Africa, and he brought those dancefloors with him to New York.\n\nHe won the Botswana National DJ ''98 mix show championship, then held down the famous after-work party Naked Lunch “Share Libations” from 2000 to 2004. In 2001 he became the first kwaito-exclusive DJ to play Central Park SummerStage, and in 2002–03 he played NJPAC and the African Film Festival.\n\nHis sets run from kwaito, Afro house and amapiano through zimdancehall, ndombolo and Afrobeat, across deep and soulful house, soul and R&B, hip-hop, reggae and old-school classics.\n\nOn February 23, 2023 he DJ''d the South African cocktail reception at the Apollo Theater for ImageNation''s Cocktails & Sol Cinema screening of Mbongeni Ngema''s Asinamali, then played the official after party at Shrine World Music Venue in Harlem.',
  'New York / New Jersey',
  array['Kwaito','Afro House','Amapiano','Zimdancehall','Ndombolo','Afrobeat','Soukous','Deep & Soulful House','Soul & R&B','Hip-Hop','Reggae & Dancehall','Old School'],
  'https://calendly.com/africangigs',
  array['Laptop running Serato DJ Pro','Rane Four controller','Headphones and all cabling','On request: own Bose professional PA for rooms with no sound system'],
  array['2 line outputs (XLR or 1/4") to the house mixer','Booth monitor','Sturdy table at waist height, about 6 ft','2 grounded power outlets at the booth','1 wireless mic for MC duties','45 minutes'' access before doors to set up']
)
on conflict (id) do nothing;

do $$
begin
  if not exists (select 1 from public.epk_highlights) then
    insert into public.epk_highlights
      (sort_year, year_label, title, detail, venue, city, proof_level, source_label, source_url, source2_label, source2_url, featured, is_published, sort_order)
    values
      (2023, 'Feb 23, 2023', 'Apollo Theater, Harlem',
       'DJ for the South African cocktail reception at ImageNation’s Cocktails & Sol Cinema: Asinamali, Mbongeni Ngema’s film.',
       'Apollo Theater', 'Harlem, New York', 'third_party',
       'Apollo event listing', 'https://apollotheater.org/event/imagenations-cocktails-and-sol-cinema-asinamali',
       'Event flyer naming DJ Eddie Ed', 'https://www.instagram.com/p/CoLqXIMsp_Q/',
       true, true, 1),
      (2023, 'Feb 23, 2023', 'Official after party, Shrine World Music Venue',
       'DJ for the Asinamali after party, with a special performance by Afro-Latino band Sauce Y.',
       'Shrine World Music Venue', 'Harlem, New York', 'artist_published',
       'Event flyer', 'https://www.instagram.com/p/CoLqXIMsp_Q/', null, null,
       false, true, 2),
      (2011, '2011–2023', '33 sets logged publicly on Serato',
       'Tracklists from 33 sets published to Serato between September 2011 and February 2023.',
       null, null, 'third_party',
       'Serato playlists', 'https://serato.com/playlists/djedyed', null, null,
       false, true, 3),
      (2002, '2002–2003', 'NJPAC and the African Film Festival',
       'Played the New Jersey Performing Arts Center and the African Film Festival.',
       'NJPAC', 'New Jersey / New York', 'artist_published',
       'Mixcloud artist bio', 'https://www.mixcloud.com/djedyed/', null, null,
       false, true, 4),
      (2001, '2001', 'First kwaito-exclusive DJ at Central Park SummerStage',
       'Brought an all-kwaito set to one of New York’s biggest free outdoor stages.',
       'SummerStage, Central Park', 'New York', 'artist_published',
       'Mixcloud artist bio', 'https://www.mixcloud.com/djedyed/', null, null,
       true, true, 5),
      (2000, '2000–2004', 'Naked Lunch “Share Libations”',
       'DJ of the famous after-work party for four years.',
       'Naked Lunch', 'New York', 'artist_published',
       'Mixcloud artist bio', 'https://www.mixcloud.com/djedyed/', null, null,
       false, true, 6),
      (1998, '1998', 'Botswana National DJ mix show champion',
       'Won the Botswana National DJ ''98 mix show championship.',
       null, 'Botswana', 'artist_published',
       'Mixcloud artist bio', 'https://www.mixcloud.com/djedyed/', null, null,
       true, true, 7);
  end if;

  if not exists (select 1 from public.epk_links) then
    insert into public.epk_links (kind, label, url, note, sort_order) values
      ('booking', 'Book a call', 'https://calendly.com/africangigs', 'Calendly', 1),
      ('social',  'Mixcloud', 'https://www.mixcloud.com/djedyed/', '19 shows', 1),
      ('social',  'Instagram', 'https://www.instagram.com/djedyed/', '@djedyed', 2),
      ('social',  'Serato playlists', 'https://serato.com/playlists/djedyed', '33 sets', 3),
      ('mix', 'Africa Stand UP 17', 'https://www.mixcloud.com/djedyed/africa-stand-up-17/', 'Kwaito · Zimdancehall · Afrobeat · Ndombolo · Afro house', 1),
      ('mix', 'DJ Eddie Ed KwaitoHouse Sampler 2004', 'https://www.mixcloud.com/djedyed/dj-eddie-ed-kwaitohouse-sampler-2004/', 'Kwaito-house · South African house', 2),
      ('mix', 'Deep Underground House II', 'https://www.mixcloud.com/djedyed/deep-underground-house-ii/', 'Deep house · Jazz house', 3),
      ('mix', 'SoulDeep', 'https://www.mixcloud.com/djedyed/souldeep/', 'Soul · R&B', 4),
      ('mix', '90s Related Relatives Anthems Pt I', 'https://www.mixcloud.com/djedyed/90s-anthems-pt-i/', 'Hip-hop · R&B · New jack swing', 5),
      ('mix', 'Africaunited', 'https://www.mixcloud.com/djedyed/africa-united/', 'Soukous · Afrobeat · Kwaito-house · ZimHouse', 6);
  end if;

  if not exists (select 1 from public.epk_reviews) then
    insert into public.epk_reviews (quote, author, source_label, source_url, sort_order) values
      ('Best music selection that kept the dancefloor packed.', 'Jojo M., client', 'Thumbtack (5.0 from 5 reviews)', 'https://www.thumbtack.com/nj/plainfield/photo-booth-rentals/edm-pro/service/184781775662154872', 1),
      ('Top notch professional. You won’t be disappointed.', 'Dan G., client', 'Thumbtack (5.0 from 5 reviews)', 'https://www.thumbtack.com/nj/plainfield/photo-booth-rentals/edm-pro/service/184781775662154872', 2);
  end if;
end;
$$;

-- Done. Next: Authentication → Users → Add user (tick "Auto Confirm User"),
-- then sign in to the back office once. That first sign-in makes you the admin.
