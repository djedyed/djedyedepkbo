# DJ Eddie Ed — EPK Back Office

The private control room behind the public press kit ([djedyedepk](https://github.com/djedyed/djedyedepk)).

If the public site is the dancefloor, this is the booth: you choose what plays, read the requests and keep the receipts.

## What it does

| Tab | What you manage | Who can see it |
|---|---|---|
| **Inbox** | Booking inquiries from the public form, with status (new → replied → quoted → booked) and private notes | Only you |
| **Highlights** | Lifetime highlights, each with a proof level and source links, plus a **private proof vault** for flyers, photos and contracts | Highlights are public when published; proof files are only you |
| **Profile** | Bio, tagline, genres, booking link, press photo, tech rider | Public |
| **Links & mixes** | Mixcloud mixes (shown as players), socials and booking links | Public when published |
| **Reviews** | Client quotes, word for word, with where they were published | Public when published |
| **Rates** | Your price list | Only you, never public |
| **Publish** | Link to the live EPK, download a `content.json` backup, and lock down sign-ups | — |

Built with free, open-source pieces: plain HTML, CSS and JavaScript, plus [supabase-js](https://github.com/supabase/supabase-js). There is no build step.

## One-time setup (about 10 minutes)

1. **Create the database.** Open the Supabase SQL Editor for the project, paste the whole of [`supabase/setup.sql`](supabase/setup.sql) and press **Run**.
   - It is safe to run more than once. It never deletes anything.
   - Every table starts with `epk_`, so it sits alongside anything else in the project.
   - It also loads the starting content: seven source-tagged highlights, six mixes, socials and two reviews.
2. **Create your login.** Go to Supabase → Authentication → Users → **Add user**. Enter your email and a strong password, and tick **Auto Confirm User**.
3. **Open the back office** (locally or on GitHub Pages) and sign in. The first account that signs in becomes the **only** admin.
4. **Lock the door.** In Supabase → Authentication → Sign In / Providers, turn off **Allow new users to sign up**.
5. **Publish it.** In this repo go to Settings → Pages → Deploy from branch `main`. The back office will live at `https://djedyed.github.io/djedyedepkbo/`. The page is marked `noindex`, and nothing in it works without your login.

## Security, in plain words

- The key in `config.js` is a *publishable* key. It is meant to be public, like a club's street address.
- The **bouncer** is Row Level Security, written in `setup.sql`:
  - Visitors can read published content and drop off a booking inquiry. That's all.
  - Only the admin account can read inquiries, rates and proof files, or change anything.
  - A second account, even a signed-in one, sees nothing private.
- Proof files sit in a **private** storage bucket. Opening one creates a link that expires after 2 minutes.
- Text from visitors is always shown as plain text, never as code.

## Run it locally

```bash
python3 -m http.server 8001
# open http://localhost:8001
```

## Moving to a different Supabase project

Change the URL, key and project ref in `config.js` here and in the public site's `config.js`. Then run `supabase/setup.sql` in the new project.
