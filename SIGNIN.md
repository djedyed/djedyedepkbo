# Sign-in methods: setup

The back office uses the **standard back-office sign-in**:

- Google, Apple, Microsoft, Yahoo and passkey buttons;
- then email + password, with Create account and Forgot password;
- Light / Dark / Auto and Warm buttons on every screen.

Email + password works out of the box. Every other button stays harmless until you switch that method on in Supabase: pressing it just shows a short "isn't switched on yet" note.

Think of it like a club with several doors. The email door is always open. The others are fitted, but stay locked until you hand Supabase the key for each one.

**Order matters:**

1. Sign in once with email + password. That account becomes the admin.
2. Go to **Settings → Sign-in methods** and link Google, Apple, Microsoft, Yahoo or a passkey to that same account.
3. From then on, any linked method opens the same admin account.

A provider account that was never linked would be a brand-new user, and new users can't see anything here.

## 0. Tell Supabase where the back office lives (do this first)

Supabase → **Authentication → URL Configuration**:

- **Site URL:** `https://djedyed.github.io/djedyedepkbo/`
- **Redirect URLs:** add `https://djedyed.github.io/djedyedepkbo/` and, for testing on your Mac, `http://localhost:8001/`

Without these, reset-password links and provider sign-ins send you to the wrong page.

Supabase → **Authentication → Sign In / Providers**: turn on **Allow manual linking**. Settings → Sign-in methods needs it to link providers to the admin account.

Every provider asks for a **Callback URL**. For this project it is always:

```
https://pupqbdnaelylefsiebqc.supabase.co/auth/v1/callback
```

## 1. Google (free)

1. Google Cloud Console → APIs & Services → **Credentials** → Create credentials → **OAuth client ID** → Web application.
2. Authorized redirect URI: the callback URL above.
3. Copy the Client ID and Client Secret into Supabase → Sign In / Providers → **Google**, and switch it on.

## 2. Microsoft (free)

1. Microsoft Entra admin center (portal.azure.com) → App registrations → **New registration**.
2. Supported accounts: "Accounts in any organizational directory and personal Microsoft accounts".
3. Redirect URI (Web): the callback URL above.
4. Under Certificates & secrets, create a client secret. Copy its **Value**, not its ID.
5. Supabase → Sign In / Providers → **Azure**: paste the Application (client) ID and the secret, and switch it on.
6. Leave the tenant URL empty unless you want to allow only one organisation.

## 3. Yahoo (free; a custom provider)

1. Yahoo developer site (developer.yahoo.com/apps) → **Create an app**. Redirect URI: the callback URL above. Permissions: OpenID Connect, email.
2. Supabase → Sign In / Providers → **Custom OAuth Providers** → New Provider → **Auto-discovery (OIDC)**. Fill in:
   - Identifier: `custom:yahoo`. It must be exactly this; the Yahoo button calls it.
   - Issuer: `https://api.login.yahoo.com`
   - Client ID and Client Secret from Yahoo.
3. Create and enable it.

Free Supabase projects can have up to three custom providers.

## 4. Apple (costs money)

Sign in with Apple needs the **Apple Developer Program, US$99 a year**.

1. In Certificates, Identifiers & Profiles, create:
   - an App ID with Sign in with Apple;
   - a **Services ID**. Its "Return URL" is the callback URL above, and its domain is `pupqbdnaelylefsiebqc.supabase.co`;
   - a Sign in with Apple **key**.
2. Supabase → Sign In / Providers → **Apple**: enter the Services ID, Team ID, Key ID and the key file. Supabase generates the secret.
3. Apple secrets expire after at most six months. Put a calendar reminder to renew it.

If the US$99 isn't worth it, leave Apple off. The button stays and explains that it isn't switched on. iPhone and Mac users can use a **passkey** instead, for free.

## 5. Passkeys (free; Supabase beta)

1. Supabase → **Authentication → Passkeys** → turn on **Enable Passkey authentication**.
2. Fill in:
   - **Relying Party Display Name:** `DJ Eddie Ed back office`
   - **Relying Party ID:** `djedyed.github.io` (bare domain: no https, no path)
   - **Relying Party Origins:** `https://djedyed.github.io`
3. Sign in to the back office, open **Settings → Passkeys** and press **Add a passkey on this device**. Do it once per device (Mac, iPhone).

Pick the Relying Party ID once. Changing it later makes every passkey stop working, and they all have to be added again. If the back office ever moves to its own domain, expect to re-add passkeys.

A passkey made on the live site doesn't work on `localhost`, and the other way round. That is by design.

## 6. Lock the door again

Once your admin account works, turn **Allow new users to sign up** back off (Sign In / Providers). Linking still works for the signed-in admin.

## Quick check

| What you press | What should happen |
|---|---|
| A provider that isn't set up | A short "isn't switched on in Supabase yet" note. You stay on the page. |
| A provider that is set up and linked | The provider's page, then straight back into the office |
| A provider account that was never linked | A new account that sees "Not authorized". Sign out, sign in with email, and link it under Settings. |
| Forgot password? | An email with a link. It opens "Choose a new password". |

## Costs at a glance

| Method | Cost |
|---|---|
| Email + password | Free |
| Google | Free |
| Microsoft | Free |
| Yahoo | Free (uses 1 of 3 free custom-provider slots) |
| Passkeys | Free (Supabase beta) |
| Apple | US$99 a year (Apple Developer Program) |
