# OneState Hub API 2.0

Cloudflare Worker + D1 backend for the OneState Hub Android app.

## Required Cloudflare variables/secrets

Production variables:
- `DISCORD_CLIENT_ID` — Discord Application ID for the **OneState Hub** application.
- `DISCORD_REDIRECT_URI` — `https://newuw.atayah057.workers.dev/auth/discord/callback`
- `OWNER_DISCORD_USER_ID` — your personal Discord User ID.
- `ANDROID_APP_URL` — `onestatehub://auth/callback`

Secret:
- `DISCORD_CLIENT_SECRET` — secret of the OneState Hub Discord application.

Do not commit the secret to GitHub.

## D1 migration

Run `schema.sql` once in the D1 Console. It is safe to run again because it uses `CREATE TABLE IF NOT EXISTS`.

## Discord redirect

In Discord Developer Portal → OAuth2 → Redirects, add:
`https://newuw.atayah057.workers.dev/auth/discord/callback`

The OAuth callback creates a 30-day session and redirects to the Android deep link.
