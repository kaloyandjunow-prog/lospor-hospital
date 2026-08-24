# LOSPOR Security Model

## Authentication

- Web app: API-owned `lospor_session` cookie (`HttpOnly`, same-site). Web code
  never reads or writes its value; `/api/auth/session` owns issuance and
  revocation.
- Mobile native: short-lived bearer JWT (8h) issued by `/api/auth/token`, stored in `expo-secure-store` using Keychain/Keystore.
- Mobile PWA: API-owned `lospor_session` cookie (`HttpOnly`, same-site) issued
  through its own same-origin `/v1` proxy. PWA JavaScript never receives,
  stores, or reads the bearer value.
- All protected API routes use `getAuthUser`, which accepts bearer token first and cookie session as fallback.
- Revoked JWTs are tracked in the `RevokedToken` table with an in-memory refresh cache.
- The Account page inventories server-tracked Web, mobile, and PWA sessions.
  A clinician can revoke one non-current session or every session except the
  current one; the API scopes both operations to the authenticated account.
- Self-service password change verifies the current password, invalidates
  unused recovery links, revokes every active session, clears the Web cookie,
  and requires sign-in again on every device.
- When configured by the API, administrator credential login returns a
  short-lived, single-use MFA continuation instead of a session. The Web client
  keeps that continuation only in React memory and completes it through
  `/api/auth/mfa/login`; the API remains responsible for verification, replay
  prevention, rate limiting, and session-cookie issuance. Deployments that do
  not return the continuation retain the ordinary one-step login screen.
- First administrator enrollment offers the API-issued standards-based
  `otpauth://totp` link and a visible manual setup key. No QR library or new
  third-party code is loaded. A six-digit authenticator code must complete
  enrollment. The resulting ten unique, one-time recovery codes are held only
  in memory and can be downloaded or printed; navigation remains disabled until
  the administrator confirms they saved or printed all ten.
- Later administrator sign-ins accept an authenticator code or one recovery
  code. Client-side expiry returns to fresh credential entry, raw API prose is
  never rendered, reused continuations fail closed, and malformed enrollment
  success without exactly ten recovery codes cannot continue.

## Account lifecycle and deployment boundary

- Clinicians may correct only first name, last name, and professional title.
  The account email remains read-only until a separately verified email-change
  design exists. Institutional membership continues through the existing
  request/approval workflow because it controls departmental case visibility.
- Hospital administrator lifecycle and authority controls render only for the
  exact capability `features.accountAdministration = {"enabled":true,
  "reason":"ENABLED"}`. Missing, malformed, unreachable, or explicitly
  disabled capability responses fail closed.
- The online Cloud Demo keeps its pre-existing registration approval and
  Member/Head-of-Department workflow. It does not expose the Hospital controls,
  and this client adds no administrator account-creation UI.
- Suspend, delete, and authority changes revoke the target's sessions.
  Administrator promotion/demotion and clinical/research account-type changes
  also require the acting administrator's current password and an audit reason.
  Server-side last-administrator and concurrency protections remain
  authoritative.
- HOD demotion removes department-wide access but does not delete, transfer, or
  orphan the clinician's own cases.

## Pediatric deployment boundary

- A new Pediatric selection is available only after `/api/capabilities`
  returns the complete `features.pediatricMode` contract with `enabled: true`,
  `productionReady: true`, a non-empty ruleset version, a compatible semantic
  minimum client version, and the reviewed-dose-profile requirement.
- Missing, malformed, contradictory, unreachable, non-production-ready, or
  client-incompatible responses fail closed. An explicit valid `enabled:
  false` response is presented as installation policy rather than a network
  failure.
- If policy is disabled after a Pediatric record already exists, Web preserves
  the displayed record and its exact Pediatric context, but disables the whole
  preoperative write boundary, autosave, and submit. The API remains the final
  authority for every mutation.

## CSRF

The API protects state-changing cookie-authenticated requests. Web
`src/proxy.ts` performs optimistic route gating; it is not an authorization,
provenance, or CSRF boundary. Clinical-event provenance comes from the client
type bound into the API-signed tracked session, never from request headers.

- `POST`, `PATCH`, `PUT`, and `DELETE` requests without bearer auth must have a same-origin `Origin` or `Referer` matching `NEXTAUTH_URL`, `NEXT_PUBLIC_APP_URL`, or `VERCEL_URL`.
- Requests with `Authorization: Bearer ...` are exempt because native Mobile
  does not rely on ambient browser cookies. The PWA does use a cookie and is
  subject to the same-origin check.
- Hostile-origin cookie API writes are rejected before the route handler runs.
- Web auth/account mutations use same-origin `fetch` with credentials, and
  locale cookie writes use Next.js Server Actions (which also validate the
  action origin). No state-changing auth action is initiated by a rendered GET.

Email verification is the remaining API-contract exception: the emailed,
single-use token is consumed by the API's GET verification endpoint. Web caps
and URL-encodes the token and never renders it. Moving consumption behind an
explicit POST confirmation would additionally protect against mail-link
scanner prefetching, but requires the coordinated API/email contract change.

## Redirect and account-boundary safety

- Post-login callbacks accept only `/dashboard`, `/cases`, `/admin`, and
  `/clinical-rules` route families. Absolute, protocol-relative, backslash,
  control-character, API, auth-loop, and unknown paths fall back to
  `/dashboard`.
- `CLINICAL_APP_FORBIDDEN` is handled explicitly. A `RESEARCH_ONLY` account is
  not allowed into the clinical Web app even if an older API incorrectly
  returns a successful session shape.
- Public-route matching is exact; paths such as `/login-malicious` are not
  treated as public.

## Locale cookies

- `lospor_device_locale` is a one-year HttpOnly, `SameSite=Lax` preference used
  before authentication. It defaults to Bulgarian when absent.
- `lospor_account_locale` is a session-scoped HttpOnly preference used only
  while `lospor_session` exists. It mirrors `User.preferences.ui.locale` and is
  removed on logout.
- Both are `Secure` in production. They contain only `bg` or `en`, never an
  identity, capability, session token, or callback URL.

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
| Mobile PWA | Offline case drafts and queued saves/events; the session remains in an HttpOnly server cookie | browser localStorage plus HttpOnly cookie |
| Web app | Device UI preferences plus queued offline saves (section patches + journaled intraop events awaiting sync) | browser localStorage and IndexedDB |

**PWA storage note:** browser `localStorage` is weaker than native
Keychain/Keystore storage for offline clinical queues, but it does not contain
the PWA session credential. Confirmed server logout expires the HttpOnly cookie
and then clears offline drafts, queued case patches, and queued intraoperative
events. If revocation cannot be confirmed, the PWA keeps the session and queued
work visible for retry.

**Web offline-queue note (v5):** the web app keeps failed section saves in IndexedDB until they sync; the payloads are the same pseudonymised clinical fields the app already handles. The queue count is visible in Settings → Privacy, with a discard control that removes the queued saves permanently.

Web logout first requires a successful server-side session revocation. It then
clears case/event queues, clinical-rule caches, and account-derived clinical
preferences before navigating with `location.replace`. If revocation fails,
the app remains on the signed-in page, reports that the session is still
active, and does not discard queued work.

## CORS

All `/api/*` routes include CORS headers.

- Development: `Access-Control-Allow-Origin: *` is allowed for legacy/local
  direct API callers; the exported PWA normally uses its same-origin `/v1`
  proxy even in the integration harness.
- Production PWA traffic is same-origin through `/v1`. Configure
  `CORS_ALLOW_ORIGIN=https://pwa.lospor.org` only when a supported client must
  call the API origin directly.
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
- [ ] Native token expiry and PWA/Web HttpOnly-cookie expiry match
  institutional requirements; browser clinical-queue retention is documented.
