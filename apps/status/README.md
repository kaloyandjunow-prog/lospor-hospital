# LOSPOR Hospital Status Monitor

[Български](README.bg.md) | **English**

The Status Monitor is an operational view that runs independently of the
clinical API and PostgreSQL. It also exposes narrowly scoped Hospital account
provisioning, terminology-generation, and update-request controls. It has no
patient-data access, clinical/research session, Docker socket, external
telemetry, or general-purpose log viewer. Its SQLite database contains
only appliance authentication verifiers, availability observations, fixed-code
events, incidents, and validated aggregate snapshots.

## Runtime contract

- HTTP: `3004`; browser UI and authentication are rooted at `/status/`.
- Optional fallback HTTPS: `3443`, enabled only when both TLS file variables are
  present. Compose publishes this listener on host loopback for an SSH tunnel.
- Persistence: `/data/status.sqlite` plus its SQLite WAL files.
- Signals: read-only `/signals/backup-status.v1.json` and
  `/signals/delivery-worker-status.v1.json`.
- Private endpoints are deliberately not under `/status` and must not be routed
  by Caddy:
  - `GET /internal/health/live`
  - `POST /internal/events`

The normal `/status/` route still depends on the appliance's Caddy container.
The fallback TLS listener remains available when Caddy fails. Neither listener
can survive loss of the host, Docker daemon, power, or hospital network.

## Environment

| Variable | Default / purpose |
| --- | --- |
| `LOSPOR_DEFAULT_LOCALE` | `bg`; initial Status language (`bg` or `en`) |
| `STATUS_DATABASE_PATH` | `/data/status.sqlite` |
| `STATUS_BASE_PATH` | Must be `/status` |
| `STATUS_HTTP_PORT` / `STATUS_HTTPS_PORT` | `3004` / `3443` |
| `STATUS_TLS_CERT_FILE`, `STATUS_TLS_KEY_FILE` | Both or neither; fallback listener certificate and key |
| `STATUS_RATE_LIMIT_KEY_FILE` | Required, at least 32 characters |
| `STATUS_MFA_ENCRYPTION_KEY_FILE` | Required, a separate 32-byte hexadecimal key used only to encrypt the Status TOTP seed |
| `STATUS_EVENT_TOKENS_FILE` | Optional producer-token JSON object |
| `STATUS_SNAPSHOT_TOKEN_FILE` | Bearer token for the API aggregate snapshot |
| `STATUS_ACCOUNT_CONTROL_TOKEN_FILE` | Separate bearer for account lifecycle mutations |
| `STATUS_SIGNALS_DIR` | `/signals` |
| `STATUS_UPDATE_REQUESTS_DIR` | `/update/requests`; the only writable host channel, accepting fixed update and terminology intent |
| `STATUS_UPDATE_STATE_DIR` | `/update/state`; read-only, strict host-agent projections |
| `STATUS_API_LIVE_URL`, `STATUS_API_READY_URL` | API health endpoints |
| `STATUS_APPLIANCE_SNAPSHOT_URL` | API `/internal/appliance-status` |
| `STATUS_ACCOUNT_CONTROL_URL` | Private API `/v1/internal/hospital/accounts`; uses the dedicated account-control bearer |
| `STATUS_CONTROL_PLANE_URL` | Private API `/v1/internal/hospital/control-plane`; reuses the narrow Status-control bearer and safely derives from the account URL when omitted |
| `STATUS_WEB_URL`, `STATUS_PWA_URL`, `STATUS_BROWSER_URL` | User-interface probes |
| `STATUS_CADDY_HOST`, `STATUS_CADDY_PORT` | Gateway TCP probe; default port `80` |
| `STATUS_CADDY_HEALTH_URL` | Two-container fixture HTTP override only; production leaves unset |
| `STATUS_POSTGRES_HOST`, `STATUS_POSTGRES_PORT` | PostgreSQL probe; default port `5432` |
| `STATUS_POSTGRES_DATABASE`, `STATUS_POSTGRES_USER` | `lospor`, `lospor_status_probe` |
| `STATUS_POSTGRES_PASSWORD_FILE` | Restricted probe-user password |
| `STATUS_DATABASE_HEALTH_URL` | Two-container fixture override only; production leaves unset |
| `STATUS_CHECK_INTERVAL_MS`, `STATUS_PROBE_TIMEOUT_MS` | `15000`, `3000` |

Secrets are file based. The service deliberately does not accept secret values
through equivalent environment variables.

## Interface language

Every current login, MFA enrollment/verification, one-time recovery-code,
dashboard, incident, account provisioning, one-time-link, terminology,
release, download, and update-confirmation screen is available in Bulgarian
and English. The appliance
default is used until the operator makes an explicit choice. The prominent
БГ/EN control stores only an HttpOnly, same-site locale cookie scoped to
`/status`; it neither changes the clinical account preference nor weakens the
independent Status session. Invalid locales and redirect targets are refused or
replaced with a fixed local Status path.

## Hospital accounts

Normal password sessions can create a clinical member, clinical head of
department, or research-only account and can issue mail-independent activation
and local recovery links. A console-recovery Status session cannot view or use
these controls. Status shows each secret once as a copyable URL, printable page,
and locally rendered QR code; it stores none of them in SQLite or operational
history. Activation is valid for 72 hours and recovery for 8 hours. Reissue
invalidates all prior unused links of the same kind.

Creation requires a case-preserving Hospital username: 3–64 characters,
starting with an ASCII Latin letter and continuing with ASCII Latin letters,
numbers, dot, underscore, or hyphen. Login and uniqueness are case-insensitive.
Contact email is optional and never a Hospital login fallback. Display names
remain Unicode/Cyrillic-capable. Status cannot create an administrator or
rename any account.

The API mutation and clinical audit evidence are one PostgreSQL transaction.
Administrative authority and the designated appliance operator are excluded
from Status activation/recovery actions. The operator password must remain
synchronized through the host credential workflow. See
[Hospital account provisioning](../../docs/account-provisioning.md).

## Operator two-step verification

A password never creates a Status session. It creates a five-minute, one-use
challenge. On the first successful password check for a credential generation,
Status locally renders an `otpauth://` QR code and manual setup key; the
operator must enter a valid six-digit TOTP before a session is issued. Status
then shows exactly ten recovery codes once. Each recovery code is accepted for
one sign-in and is stored only as a user- and credential-generation-bound
SHA-256 hash. Accepted TOTP time steps cannot be replayed.

The TOTP seed is encrypted with AES-256-GCM using the dedicated
`secrets/status/mfa-encryption-key`. That key is separate from the clinical
administrator MFA key and the Status rate-limit key. Credential commit removes
MFA material from older generations, so a new designated operator enrolls a
new authenticator at first sign-in. The host-console recovery token remains a
separate break-glass route and produces a restricted recovery session; it does
not reveal, replace, or bypass MFA for a normal password session.

## Research, Central, guidance, and external AI controls

Normal password sessions may open `/status/control`. Every mutation on that
page asks for the current appliance-operator password again; recovery sessions
are refused, and five failed confirmations produce a 15-minute lockout. The
private API returns research policy/identity metadata, exact OMOP hashes and
counts, Central operational state, certificate fingerprints/validity, and
guidance policy plus a sanitized exact-baseline assessment. The assessment
contains only preset identity/version/status, rule and profile counts, SHA-256,
and a fixed reason code; it contains no rule payload, source reference, preset
name, free text, publisher, or selector identity. Status has no route to a query result, case row, export
artifact, enrollment secret, certificate contents, or private key.

Research grants are immutable, default to 90 days, expire by 365 days, and can
be replaced or revoked. Central transport setup and clinical-export approval
are separately reauthenticated and audited. Adult and pediatric prospective
calculation guidance can be changed independently without rewriting recorded
cases. Status shows policy, baseline readiness, and current guidance
availability separately for adult and pediatric content. **Ready** requires the
selected published platform preset to match the exact bundled v2 identity,
version, rule/profile counts, and content SHA-256. Missing or changed content is
**Not ready** in both languages and cannot be repaired by a policy checkbox.
The external-AI policy and Mistral credential are separate controls:
Status shows only safe provider/configuration state and timestamps, and its
credential field is always empty. Replacement/removal is reauthenticated and
audited; neither Status SQLite nor any response retains the key. See
[research access](../../docs/research-control.md),
[Central control](../../docs/central-status-control.md), and
[guidance policy](../../docs/clinical-guidance-policy.md), plus
[external AI control](../../docs/external-ai-control.md).

Account roles and Central queue/batch states are mapped to explicit Bulgarian
and English operator labels. Status renders only bounded queue totals and the
current batch state; it never prints the control-plane JSON object or exposes
an internal enum as user-facing fallback text. Unknown future states fail
closed in the private control-plane validator.

## Terminology generations

`/status/terminology` reads one exact host projection containing only active
package ID/version, activation time, manifest SHA-256, rollback availability,
and fixed pending/action state. It never receives licensed files, paths,
database names, logs, credentials, or patient data. A normal password+MFA
session can request import, exact-package resume, rollback, or finalization only
after fresh password reauthentication and explicit confirmation; recovery
sessions are read-only.

The request contains a fixed action and one direct package label, never a path,
URL, command, manifest, database, image, or source identity. The root host agent
derives the packaged operation, validates age/inode/replay safety, and takes the
persistent backup/update maintenance lock. A stale/console-only agent or an
ambiguous interrupted mutation disables browser controls. See
[Terminology import](../../docs/terminology-import.md).

`STATUS_EVENT_TOKENS_FILE` is a JSON object whose keys are producer identities:

```json
{"api":"at-least-24-random-characters"}
```

Producer identity is derived from the matching bearer token, never from the
request body. The event endpoint accepts at most 4 KiB and rejects unknown
codes, fields, nested objects, and free text. Its exact allowed codes and facts
are documented by `src/event-contract.ts`; they mirror the API's versioned safe
event producer. Duplicate UUIDs are idempotent.

The API snapshot is validated against schema version 1. Unknown fields and
unknown enum/map keys are rejected rather than stored. When it becomes
unavailable, cached facts are explicitly shown as stale and their component
states become unknown.

## Host-only appliance credential CLI

The compiled image command is:

```text
node dist/cli.js <subcommand>
```

It accepts exactly one JSON object on standard input and writes exactly one JSON
object to standard output. Passwords are never accepted through arguments or
environment variables. Examples below describe shapes, not shell commands, so
the caller can pipe without exposing a password in process listings.

| Command | Standard-input JSON | Result |
| --- | --- | --- |
| `init-auth` | `{email,password,generation?}` | Creates authentication; default generation 1. On retry, succeeds only if all three values match. A non-1 generation supports verified recovery after loss of the status volume. |
| `auth-prepare` | `{email,password,expectedGeneration?}` | Stores a pending bcrypt verifier for 24 hours and returns `transactionId` and `pendingGeneration`. Identical retries return the same transaction. A different pending change is rejected. Both old and pending credentials can sign in until commit. |
| `auth-commit` | `{transactionId}` | Atomically promotes the pending credential and revokes every session. |
| `auth-abort` | `{transactionId}` | Removes the matching pending credential. |
| `auth-state` | `{}` | Returns generation and email hashes, never email addresses or verifiers. |
| `recovery-token` | `{ttlMinutes?}` | Prints a random single-use token valid for 1–60 minutes (default 15). |

Passwords must be 8–256 characters and contain an uppercase letter, number, and
special character, matching the clinical policy. Password authentication must
be followed by TOTP or one unused MFA recovery code. Runtime sessions are random server-side
tokens stored only as SHA-256 hashes, with 30-minute idle and eight-hour absolute
expiry. Cookies are Secure, HttpOnly, SameSite=Strict, and scoped to `/status`.
Five failed attempts per client address, per identity, or per
address-and-identity pair produce a 15-minute lockout. Authentication security
events contain only fixed codes and are retained for 90 days; they never
contain an email, address, password, token, or free text. State-changing
browser requests require the same HTTPS origin.

## Monitoring behavior

Checks run every 15 seconds. An operational component becomes degraded or down
after three consecutive failed checks and recovers after two successful checks.
Unknown and not-configured are explicit states, not green. Delivery-worker
heartbeats degrade after 150 seconds and are unavailable after 300 seconds.
Verified backups warn after 36 hours and are unavailable after 48 hours or an
explicit failed attempt.

`backup-status.v1.json` accepts only `BACKUP_VERIFIED` or the finalized,
enumerated terminal failure codes emitted by the hardened backup workflow.
Every accepted result has matched Bulgarian and English operator text.
`BACKUP_BUSY` is deliberately not a terminal Status result: a contending
caller must leave the active backup's last result marker untouched.

Detailed samples and service operational events are retained 30 days. Daily
worst-state summaries and resolved incidents are retained 365 days. Status
authentication security events are retained 90 days. Maintenance runs after
each check. Events are also capped at 10,000 records, detailed samples at
250,000, resolved incidents at 10,000, and SQLite at approximately 128 MiB.
SQLite uses WAL, full synchronous writes, and a five-second busy timeout.

## Development and verification

`npm ci`, `npm test`, `npm run typecheck`, `npm run lint`, and `npm run build`
exercise the package. The two-container fixture sets
`STATUS_DATABASE_HEALTH_URL`; every other production protocol and event/signal
contract remains unchanged. Final appliance tests must additionally stop API,
PostgreSQL, Web, PWA, Browser, Caddy, backup, and worker independently and prove
that only the intended status changes.
