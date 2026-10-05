# OneState Hub Cloudflare Backend

Backend أولي لـ OneState Hub باستخدام Cloudflare Workers + D1 + Discord OAuth بدون R2.

## مهم قبل النشر
1. أنشئ D1 باسم `onestate-hub-db`.
2. ضع Database ID الحقيقي في `wrangler.toml`.
4. ضع Discord Application/Client ID في `DISCORD_CLIENT_ID`.
5. ضع **Discord User ID الشخصي للمالك** في `OWNER_DISCORD_USER_ID`.
6. ضع Discord Client Secret كـ Cloudflare Secret باسم `DISCORD_CLIENT_SECRET`، ولا تضعه في GitHub.
7. عدّل `DISCORD_REDIRECT_URI` إلى رابط Worker النهائي.
8. في Discord Developer Portal أضف نفس Redirect URI.

## Cloudflare
Build command: اتركه فارغًا.
Deploy command: `npx wrangler deploy`
Preview command: `npx wrangler preview`

بعد إنشاء D1، نفّذ schema.sql على قاعدة البيانات.

## API
GET `/`
GET `/health`
GET `/auth/discord`
GET `/auth/discord/callback`
GET `/me`
POST `/me/setup`
GET/POST `/posts`
POST `/posts/{id}/like`
GET/POST `/market`
GET `/admin/users`
POST `/admin/users/role`

ملاحظة: session_token في هذا الإصدار مبسط جدًا لتسهيل النسخة الأولى. قبل الإطلاق العام يجب ترقيته إلى جلسات آمنة قابلة للانتهاء/التجديد.
