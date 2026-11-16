# Changelog

## 1.1.0 — 2026-11-15

### Sign-in
- New standard back-office sign-in: Google, Apple, Microsoft, Yahoo (`custom:yahoo`) and passkey buttons, then email + password.
- New on that screen: Create account, Forgot password, and a "First time?" note.
- Provider buttons check with Supabase first. A provider that isn't switched on shows a plain note instead of an error page.
- Reset-password links now open a "Choose a new password" screen.
- Errors that come back from a provider are shown on the sign-in screen.

### Settings tab
- New tab for linking and unlinking providers, managing passkeys (add, rename, remove) and changing your password.

### Appearance
- Light / Dark / Auto and Warm buttons, remembered per browser. They are applied before the page draws, so it never flashes.
- All colours now come from named tokens.

### Under the hood
- supabase-js is pinned to 2.118.0 instead of a floating `@2`.
- The session is stored under its own key (`djedyedepkbo_auth`), so it never mixes with the public site's.
- After this update you sign in once more.

### Highlights
- New fields on each highlight: a short line under the title, plus an optional photo, caption and photo description.
- These let the public site lay Highlights out like page 3 of the EPK: one featured card with a photo, then compact rows.
- A source label written as "Event: apollotheater.org listing" shows "Event:" as plain text and links the rest.
- Run `supabase/setup.sql` again to add the new columns. It fills in the EPK wording only where a field is still empty, or still reads exactly as first seeded.

### Docs
- New SIGNIN.md: provider setup steps and costs.

## 1.0.0 — 2026-11-13
- First release: Inbox, Highlights with a private proof vault, Profile, Links & mixes, Reviews, Rates, Publish.
