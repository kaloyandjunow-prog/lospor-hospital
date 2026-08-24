# LOSPOR Security Model

## Authentication

- Web app: NextAuth.js session cookie (`httpOnly`, same-site).
- Mobile native: short-lived bearer JWT (8h) issued by `/api/auth/token`, stored in `expo-secure-store` using Keychain/Keystore.
- Mobile PWA: short-lived bearer JWT (8h) stored by the web secure-store shim in browser `localStorage`.
- All protected API routes use `getAuthUser`, which accepts bearer token first and cookie session as fallback.
- Revoked JWTs are tracked in the `RevokedToken` table with an in-memory refresh cache.

## CSRF

`src/proxy.ts` protects state-changing cookie-authenticated requests.

- `POST`, `PATCH`, `PUT`, and `DELETE` requests without bearer auth must have a same-origin `Origin` or `Referer` matching `NEXTAUTH_URL`, `NEXT_PUBLIC_APP_URL`, or `VERCEL_URL`.
- Requests with `Authorization: Bearer ...` are exempt because mobile/PWA clients do not rely on ambient browser cookies.
- Hostile-origin cookie API writes are rejected before the route handler runs.

## Patient Identifiers

By design, no patient names or national IDs are collected or stored.

- Patient identity fields are absent from the clinical forms and database schema.
- Printed protocols leave patient-identity lines blank for handwritten completion.
- Free-text fields are scanned server-side by `checkPII` before persistence.
- Controlled clinical vocabulary labels are not checked with the same name heuristic because labels such as `Face Mask`, `To PACU`, or `General Anaesthesia` are valid clinical terms.
- Free-text event notes are still checked for EGN, long numeric identifiers, email addresses, dates, and likely names.

## Data Storage

| Surface | What is stored | Technology |
| --- | --- | --- |
| Server DB | Clinical case data without direct patient identifiers | PostgreSQL via Prisma |
| Mobile native | Bearer token, offline case drafts, queued saves/events | expo-secure-store |
| Mobile PWA | Bearer token, offline case drafts, queued saves/events | browser localStorage |
| Web app | Queued offline saves (section patches + journaled intraop events awaiting sync) | browser IndexedDB |

**PWA storage note:** browser `localStorage` is weaker than native Keychain/Keystore storage. Logout clears the token, offline drafts, queued case patches, and queued intraoperative events. Shared or hospital-managed browser devices should prefer the web app or require strict logout/device-cleanup policy.

**Web offline-queue note (v5):** the web app keeps failed section saves in IndexedDB until they sync; the payloads are the same pseudonymised clinical fields the app already handles. The queue count is visible in Settings → Privacy, with a discard control that removes the queued saves permanently.

## CORS

All `/api/*` routes include CORS headers.

- Development: `Access-Control-Allow-Origin: *` is allowed for local PWA development.
- Production: set `CORS_ALLOW_ORIGIN=https://pwa.lospor.org` in Vercel.
- `CORS_ALLOW_ORIGINS` accepts a comma-list; the header helper reflects the request's `Origin` when it matches any allowlisted entry (with `Vary: Origin`), and falls back to the first entry otherwise. The singular `CORS_ALLOW_ORIGIN` is merged into the same allowlist.
- CORS is not treated as CSRF protection. Cookie-authenticated writes are separately same-origin checked by the proxy.

## AI Provider

Mistral AI is the permitted AI provider for opt-in lab, vitals, and advisor features. Image endpoints enforce request-size limits before sending data to the provider. If a configured regional endpoint rejects inference, the app retries against the global Mistral API base. Users must crop or obscure identifiers before upload.

## Recommended Production Checklist

- [ ] `NEXTAUTH_SECRET` is a random 32+ byte secret.
- [ ] `NEXTAUTH_URL=https://app.lospor.org`.
- [ ] `MOBILE_PWA_URL=https://pwa.lospor.org`.
- [ ] `CORS_ALLOW_ORIGIN` or `CORS_ALLOW_ORIGINS` is set to the production PWA origin.
- [ ] Database connection strings require SSL.
- [ ] Database backups are enabled.
- [ ] Error monitoring is configured in an EU-compatible setup if used.
- [ ] Audit logs are reviewed periodically.
- [ ] Token expiry and local-storage policy match institutional requirements.
