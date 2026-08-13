# LOSPOR Hospital Status Monitor

The Status Monitor is a read-only operational view that runs independently of
the clinical API and PostgreSQL. It has no patient-data access, Docker socket,
external telemetry, or general-purpose log viewer. Its SQLite database contains
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
| `STATUS_DATABASE_PATH` | `/data/status.sqlite` |
| `STATUS_BASE_PATH` | Must be `/status` |
| `STATUS_HTTP_PORT` / `STATUS_HTTPS_PORT` | `3004` / `3443` |
| `STATUS_TLS_CERT_FILE`, `STATUS_TLS_KEY_FILE` | Both or neither; fallback listener certificate and key |
| `STATUS_RATE_LIMIT_KEY_FILE` | Required, at least 32 characters |
| `STATUS_EVENT_TOKENS_FILE` | Optional producer-token JSON object |
| `STATUS_SNAPSHOT_TOKEN_FILE` | Bearer token for the API aggregate snapshot |
| `STATUS_SIGNALS_DIR` | `/signals` |
| `STATUS_API_LIVE_URL`, `STATUS_API_READY_URL` | API health endpoints |
| `STATUS_APPLIANCE_SNAPSHOT_URL` | API `/internal/appliance-status` |
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
special character, matching the clinical policy. Runtime sessions are random server-side
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
