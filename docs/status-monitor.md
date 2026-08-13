# Appliance Status monitor

## What it is

Status is an authenticated operational page for Hospital IT. It is designed to
keep answering when the clinical API or PostgreSQL is unavailable. It monitors
the clinical API, database, Web, PWA, research Browser, gateway, backup and
delivery worker, database migrations, research export storage, email, Central
delivery configuration, research exports, and appliance-administrator
credential synchronization.

Status is a separate container with its own SQLite volume and login verifier.
It is not a public status service, a patient-facing page, a raw log viewer, or a
replacement for host monitoring.

## Access

The normal address is:

```text
https://<clinical-domain>/status/
```

Caddy permits this path only from `HOSPITAL_STATUS_ALLOWED_CIDRS`; the Status
login is still required after that network check. Set the allowlist in `.env`
to the exact hospital management, VPN, or trusted LAN ranges that should have
access. Do not make it an unrestricted public range.

Status also listens on HTTPS port `3443`, published only on `127.0.0.1` of the
appliance host. If Caddy or the clinical stack is unavailable, create a tunnel
from an administrator workstation:

```sh
ssh -L 3443:127.0.0.1:3443 appliance-admin@hospital-host
```

Then open:

```text
https://localhost:3443/status/
```

The fallback uses an installation-local, self-signed certificate for
`localhost`, so a browser trust warning is expected unless Hospital IT has
explicitly trusted that certificate. Keep the SSH session open while using the
tunnel. Port `3443` must never be published on a non-loopback host address.

## What remains available during an outage

With the clinical API or database down, Status continues to provide its login,
the direct results it can still measure, and saved history. Information that
can only come from the API aggregate snapshot becomes explicitly unknown or
stale; it is not shown as healthy. Status keeps live state in memory if a
history write fails and reports its history storage as degraded.

The normal `/status/` address requires Caddy. The loopback listener is the
fallback when Caddy is unavailable. Neither route survives loss of the server,
Docker daemon, Status container or volume, power, or hospital network. Host
health, RAID/storage, UPS, Docker and network monitoring therefore remain
Hospital IT responsibilities.

## Safe operational events, not logs

The page receives only versioned, allowlisted event codes with small,
allowlisted facts such as a failure category or HTTP status. It rejects free
text, unknown fields, nested objects, oversized bodies, unknown producers, and
stale or future events. The aggregate snapshot similarly contains counts,
states, versions, dates, and limited storage measurements rather than clinical
records.

Its operational feeds never ingest Docker logs, stack traces, request bodies,
patient identifiers, email addresses, case IDs, database rows, or arbitrary
application messages. Status separately stores the appliance operator email as
part of its login credential. Raw service logs remain a host-only diagnostic
surface:

```sh
docker compose logs --since 1h api
docker compose logs --since 1h status
```

Compose rotates those local logs. There is no Sentry SDK, external log drain,
or external telemetry service in this appliance. The release gates enforce
both the external-telemetry ban and the safe-runtime-log policy.

## Appliance administrator credential

The installer asks once for the initial clinical administrator password. That
same email and password can sign in to the clinical application and Status,
but the two products store separate password hashes in separate databases.
They do not share a hash, session, cookie, or live database lookup. A monotonic
credential generation lets the monitor report if the two verifiers disagree.

Run credential operations only from the appliance host. Passwords are read
from a hidden standard-input prompt and are never accepted in command-line
arguments or environment variables.

Check synchronization without printing an email or hash:

```sh
./scripts/appliance-operator.sh state
./scripts/appliance-operator.sh verify
```

The supported operations are:

| Need | Command | What the operator supplies |
|---|---|---|
| First upgrade to a Status-enabled release | `./scripts/appliance-operator.sh initialize` | An existing active clinical `ADMIN`, then the shared appliance password twice |
| Change the current appliance password | `./scripts/appliance-operator.sh rotate` | Current operator email, then the new password twice |
| Assign another administrator | `./scripts/appliance-operator.sh transfer` | A different existing active clinical `ADMIN`, then that administrator's new appliance password twice |
| Rebuild a lost or empty Status credential store | `./scripts/appliance-operator.sh repair-status` | The current clinical appliance operator and matching password |
| Reconcile after an older database restore | `./scripts/appliance-operator.sh reconcile-restore` | An active `ADMIN` present in the restored database and the selected password |
| Inspect generations | `./scripts/appliance-operator.sh state` | Nothing; no identity or verifier is printed |
| Prove the stores agree | `./scripts/appliance-operator.sh verify` | Nothing; success is silent |

`scripts/update.sh` automatically detects the first Status-enabled upgrade and
asks for the explicit `initialize` selection. It never guesses which existing
administrator should become the appliance operator.

Credential changes are coordinated as a prepare, clinical database update,
and Status commit. If a command is interrupted, re-run the same action with the
same proposed credential. Do not delete Status data or manually edit either
database. `abort-pending` is safe only when the clinical database did not reach
the pending generation; the command checks that condition and refuses an
unsafe abort:

```sh
./scripts/appliance-operator.sh abort-pending
```

### Console recovery

If the normal Status credential cannot be used, a host administrator can issue
a single-use token:

```sh
./scripts/appliance-operator.sh recovery-token
```

The token expires after 15 minutes by default. Paste it into **Single-use
recovery token** on the Status login page. Issuance and use are recorded as
security events. The token gives temporary Status access; it does not change
the clinical or Status password. Use `rotate`, `transfer`, `repair-status`, or
the restore workflow to correct the underlying credential state.

## Local two-container development harness

The fast harness runs exactly two persistent containers:

1. the real production Status image; and
2. one synthetic appliance fixture that implements only the safe probe,
   snapshot, event, and signal contracts.

Start it with:

```sh
./scripts/dev-status.sh up
```

The command prints the local URLs and development-only credential. Exercise
deterministic conditions without starting the clinical appliance:

```sh
./scripts/dev-status.sh scenario api-down
./scripts/dev-status.sh scenario database-down
./scripts/dev-status.sh scenario backup-failure
./scripts/dev-status.sh scenario healthy
./scripts/dev-status.sh logs
./scripts/dev-status.sh down
```

`reset` removes the harness volumes and recreates them:

```sh
./scripts/dev-status.sh reset
```

Run the automated resilience smoke test with:

```sh
./scripts/test-status-dev.sh
```

It proves that exactly the expected two containers are running, checks Status
login over both listeners, simulates API and database outages, restarts Status,
and verifies that authentication/history stay in the Status-owned volume. It
does not start PostgreSQL, the real API, Caddy, backup, worker, Web, PWA, or
Browser, so it cannot validate their real integration.

## Full appliance acceptance

The full disposable drill is:

```sh
./scripts/test-install.sh
```

It installs the actual appliance from nothing, validates both logins with the
same credential, checks that the plaintext password was not persisted, rotates
the coordinated credential, creates the real backup/worker signals, stops the
API and PostgreSQL together, and then stops each other monitored service to
prove the loopback Status fallback remains available.

This test is intentionally destructive to the disposable Compose project it
creates. It refuses to run if `.env` already exists or if host ports 80/443 are
already occupied. Never run it against an installed hospital appliance. The
two-container harness is the fast development test; the full drill is the
release acceptance test. Neither replaces the manual clinical and disaster-
recovery checks in [release validation](release-validation.md).
