# Hospital account provisioning

[Български](account-provisioning.bg.md) | **English**

Hospital self-registration remains disabled. A signed-in Status administrator
uses the unified **Status → Accounts, research grants and OMOP** control page.
Every Status administrator has the same combined authority on that page:
appliance operations, clinical/research identity supervision, research grants,
and OMOP approvals. There are no Status-admin tiers. This operational identity
still grants no clinical-record access and cannot become a clinical JWT.

New clinical/research identities start from exactly three profiles:

| Profile | Stored classification | Effective access |
|---|---|---|
| Clinical member | `AccountKind=CLINICAL`, `role=MEMBER` | Own clinical work; ordinary institutional rules apply |
| Clinical head of department | `AccountKind=CLINICAL`, `role=HEAD_OF_DEPT` | Departmental clinical authority; **Без институция** is refused |
| Research only | `AccountKind=RESEARCH_ONLY` | Research workspace only, and still no data until a separate live research grant exists |

## Login identity

Every Hospital clinical or research account has one explicit username.
Usernames are 3–64 ASCII characters, start with a Latin letter, and then use
only Latin letters, numbers, dot, underscore, or hyphen. Uppercase and
lowercase are both allowed and the entered spelling is preserved; uniqueness
and login comparison are case-insensitive. Spaces, `@`, forward/back slashes,
control characters, full-width characters, and non-Latin letters are refused.
There are no reserved names or prefixes.

A username remains reserved to its account during suspension, deletion, and
the retention grace period. Only the final anonymization transaction releases
the active reservation; its historical ownership row is retained. A later
account may reuse the spelling only after that release. A case-only rename
keeps the same canonical reservation.

The display name is separate and may use Cyrillic, numbers, punctuation, and
the clinician's normal title. Contact email is optional, unique when present,
and is never accepted as a Hospital login or recovery fallback. Status creates
Member, HOD, and research-only starting accounts. It never creates an inactive
Admin or assigns a permanent password: activate a Member/HOD through their
one-use link, then use the reasoned Status-only role change to promote them.
The guided installer requires an explicit username for the first clinical
administrator; it never derives one from email or an internal database ID.

Both browser/PWA sessions and native mobile bearer tokens apply this same
rule. Sending `email`, sending both fields, or adding an unknown fallback field
to a Hospital login is rejected. The username is compared through its
lowercase canonical key while the spelling shown to the user is preserved.
If Hospital mode is set without its private account-administration capability,
authentication returns unavailable instead of silently accepting email.

Only a Status administrator can rename a Hospital login. The old canonical
name remains reserved to that account until final anonymization. Rename revokes
existing sessions and unused links, records that a reason was supplied without
storing its free text, and returns a fresh one-use recovery link. The designated
initial clinical authority cannot be renamed through this route.

Installation language discovery defaults to Bulgarian. Choosing English on
login stores `bg`/`en` for that account without discarding other preferences;
later browser, PWA, and native sessions return the stored language.

The Status session and its account-control service bearer carry no clinical or
research authority. (The designated human appliance operator may separately
hold the synchronized clinical `ADMIN` account created by the installer.)
Status receives no clinical session/JWT and cannot call general clinical or
research routes. Its dedicated file-backed bearer reaches only the Hospital
account-control endpoints; the read-only snapshot bearer is separate. Creating
an account does not add access to that account's data to the Status session.

## Status-only supervision

Clinical role changes and login-name changes exist only on the unified Status
page. Both require a normal password-authenticated Status session, completed
Status MFA, password reauthentication, and a reason. The private role route can
change an activated clinical Member/HOD/Admin to `MEMBER`, `HEAD_OF_DEPT`, or
`ADMIN`. It refuses a HOD without an eligible institution, refuses demotion of
the designated initial chief, and refuses removal of the last active clinical
Admin. Demoting an HOD changes future authority only and never transfers or
deletes that clinician's own cases.

The username route applies the exact validation above, keeps every former
canonical name reserved, revokes sessions and unused links, and produces a
fresh recovery link. The clinical applications expose neither mutation.

## Giving someone their activation link

After creation, Status shows a one-time activation link once. Hospital IT can:

1. let the intended clinician, head of department, or researcher scan the
   locally generated QR code from the screen;
2. copy the complete link into an approved hospital communication channel; or
3. print the one-time page and hand it to the intended person.

No email provider is required. The recipient opens the link, chooses a password,
and the account becomes active. The link expires after **72 hours**, works once,
and is stored in PostgreSQL only as a SHA-256 digest. **Replace activation
link** invalidates every previous unused activation link before issuing the new
one.

The token is carried after `#` in the URL. Browsers do not transmit URL
fragments in HTTP requests, so Caddy, Web, and ordinary access logs never
receive it when the link is opened. The password-setting screen reads the
fragment in the browser and sends the token only in the protected POST body.
The QR is rendered locally by Status; no external QR service sees the link.

Account provisioning never fabricates acceptance of terms or privacy notices.
The account holder must accept the exact active documents in the application
when the staged shared 1.2.0 identity/legal import is applied.

## Local recovery

For an active account, **Issue recovery link** creates an **8-hour**, one-use
link presented in the same copy/print/QR form. Issuing another recovery link
immediately invalidates all earlier unused recovery links. First use changes
the password, revokes older sessions through `passwordChangedAt`, consumes the
link atomically, and invalidates ordinary password-reset links.

Current code refuses to issue or consume activation/recovery links for every
clinical `ADMIN`, including a promoted non-designated Admin. Whether promoted
Admins should receive Status-issued recovery is still pending explicit security
approval; until then the deny behavior remains fail-closed. The designated
initial chief/operator remains protected regardless and uses the coordinated
credential workflow. The operator account's password is
synchronized with Status and must be changed through
`scripts/appliance-operator.sh`; changing only its clinical verifier would
split the two credentials. Direct inactive-Admin creation remains impossible.

Hospital mode does not expose email password reset or email verification.
Recovery is the administrator-distributed one-use link above. Consuming it
still invalidates any legacy ordinary reset token that may exist in a
development database. Hospital IT can deliberately issue a fresh recovery link
later.

A Status **console-recovery session** is deliberately insufficient for account
management. Sign in with the normal appliance-administrator password to view
the directory or issue any account link.

## Transaction and audit contract

Creation, issuance/reissue, atomic consumption, password change, and their
audit evidence commit in the same clinical-database transaction. Audit actions
are:

- `HOSPITAL_ACCOUNT_CREATED`
- `HOSPITAL_ACCOUNT_ACTIVATION_ISSUED`
- `HOSPITAL_ACCOUNT_ACTIVATION_REISSUED`
- `HOSPITAL_ACCOUNT_ACTIVATED`
- `HOSPITAL_ACCOUNT_RECOVERY_ISSUED`
- `HOSPITAL_ACCOUNT_RECOVERY_CONSUMED`
- `ADMIN_ACCOUNT_AUTHORITY_CHANGE`
- `HOSPITAL_ACCOUNT_USERNAME_CHANGED`

Audit details contain classifications, institution, locale, expiry and the
number of prior links invalidated. They never contain a URL, plaintext token,
token digest, password, or operator email. Status history receives none of the
account lifecycle response. All account pages use `Cache-Control: no-store`.

The private API routes are:

```text
GET  /v1/internal/hospital/accounts
POST /v1/internal/hospital/accounts
POST /v1/internal/hospital/accounts/{id}/activation
POST /v1/internal/hospital/accounts/{id}/recovery
PATCH /v1/internal/hospital/accounts/{id}/role
PATCH /v1/internal/hospital/accounts/{id}/username
```

Caddy returns 404 for `/v1/internal/*`; only Status reaches these routes on the
backend network and must present the dedicated account-control bearer.

## Staged upstream dependency

The pinned Hospital API predates the shared 1.2.0 `AccountKind` and exact-legal-
evidence release. The Hospital migration therefore creates `AccountKind`
idempotently and writes `RESEARCH_ONLY` now. For compatibility with the pinned
research grant code, a new research-only account also carries the legacy
`RESEARCHER` role; a Hospital-only proxy boundary blocks that role from every
clinical route.

Before deliberately importing the shared 1.2.0 API migration, release
engineering must still reconcile and test migration history. The owner
migration is now ordering-safe: it reuses an existing exact `AccountKind` type
and user column when `20260822170000_hospital_account_control` ran first. A
clean appliance may therefore run the shared migration before the Hospital
overlay, while an already prepared development appliance may run it afterward.
In both orders, verify existing `RESEARCH_ONLY` rows, then normalize the legacy
compatibility role as the shared grant code permits. The shared migration also
drops legacy `User.approvedAt`; update the Hospital create overlay to stop
writing that field in the same deliberate import. Do not fake the upstream
version or edit `UPSTREAM_VERSIONS.json` before a real tagged import.

## Verification

Unit and route tests cover the exact username alphabet/length/case rules,
optional non-login contact email, profile validation, 72-hour and 8-hour expiry,
digest-only storage, reissue invalidation, administrator/operator guards,
fragment-only URLs, stable error mapping, CSRF and normal-password Status
sessions, last-Admin protection, HOD case preservation, role/rename session
revocation, bilingual screens, and absence from Status history. The opt-in
PostgreSQL suite races two consumers against one activation token and proves
that exactly one password change and one activation audit commit. It also
races two link issuers and proves that row-level serialization leaves exactly
one active replacement.

The complete Hospital Web Playwright suite also exercises the user-visible
story with the real private account-control and password-confirmation routes:
create a local account, replace its activation link, prove the earlier link is
invalid, choose a password through the fragment-only page, prove the replacement
is one-use, sign in, accept onboarding, and observe the account as active. The
fixture bearer is explicitly test-only and does not enable self-registration or
an email service.

Run that database gate only against a disposable database whose Hospital
migrations are already applied:

```sh
npm --prefix apps/api run test:pg:hospital-accounts
```
