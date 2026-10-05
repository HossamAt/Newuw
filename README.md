# OneState Hub Worker — Features v3

Cloudflare Worker + D1 backend for OneState Hub.

## Deploy
Required Worker variables:
- DISCORD_CLIENT_ID
- DISCORD_CLIENT_SECRET (secret)
- DISCORD_REDIRECT_URI = https://newuw.atayah057.workers.dev/auth/discord/callback
- OWNER_DISCORD_USER_ID
- ANDROID_APP_URL = onestatehub://auth/callback

## Database
The existing database needs `migration_v3.sql` run once in D1 Console before deploying the new Worker.

The migration is additive for the current OneState Hub schema. It adds profile bio, post moderation fields, bookmarks, blocks, notifications, messages, reports, orders, admin permissions and audit log.
