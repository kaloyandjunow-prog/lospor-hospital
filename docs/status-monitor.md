# Appliance Status monitor

[Български](status-monitor.bg.md) | **English**

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

Bulgarian is the default interface language. English remains available from the
visible БГ/EN control on login and on authenticated screens. The choice is kept
in a Status-only cookie; Status has an independent operator identity and does
not overwrite a clinician's language preference in the clinical applications.

## What Status reports

Seventeen checks, grouped as Status groups them. This table is the index: it
says what each check answers and where the detailed readings and thresholds
are documented. A check whose signal has never been recorded reads as
**unknown**, never as healthy — an obligation nobody can produce evidence for
must not show green.

| Check | Answers | Detail |
| --- | --- | --- |
| Verified backup | Did a backup complete and verify recently? | [Backup and restore](backup-restore.md) |
| Off-host backup acknowledgement | Did the separate encrypted copy arrive? | [Backup and restore](backup-restore.md) |
| Installation secrets escrow | Are the installation secrets escrowed? | [Backup and restore](backup-restore.md) |
| Data retention purge | Has the erasure obligation been met? | [Operations](operations.md#data-retention) |
| Automatic case closure | Are expired cases being finalised? | [Operations](operations.md#automatic-case-closure) |
| Central delivery worker | Is the outbound worker running? | [Central enrollment](central-enrollment.md) |
| Appliance release | Is a newer release published? | [Updates and compatibility](updates-compatibility.md) |
| Update agent | Is anything acting on that release? | [Updates and compatibility](updates-compatibility.md) |
| Update supply credentials | Can the appliance fetch an update? | [Updates and compatibility](updates-compatibility.md) |
| Release activation lock | Is an activation in progress or stuck? | [Updates and compatibility](updates-compatibility.md) |
| Restore operation lock | Is a restore in progress or stuck? | [Backup and restore](backup-restore.md) |
| Host storage capacity | Is the host running out of disk? | [Host observability](host-observability.md) |
| Host clock synchronization | Is host time synchronised? | [Host observability](host-observability.md) |
| Host backup freshness | Does the host agree a backup is recent? | [Host observability](host-observability.md) |
| HTTPS certificate expiry | Is the certificate about to expire? | [Host observability](host-observability.md) |
| Host service health | Are the long-running services up? | [Host observability](host-observability.md) |
| Host update-agent service | Is the host agent alive? | [Host observability](host-observability.md) |

Two of these publish a full table of result codes and their meanings, because
their readings are the ones an operator most often has to interpret without
context: [Data retention purge](operations.md#data-retention) and
[Automatic case closure](operations.md#automatic-case-closure).

## Accounts and activation links

Open **Accounts and activation links** from the Status dashboard while signed
in with the normal appliance-administrator password. Hospital self-registration
remains disabled. The page can create clinical members, clinical heads of
department, and research-only accounts. It cannot create an `ADMIN`, delete an
account, or demote anyone.

The activation link is shown once and can be copied, printed, or scanned from a
QR code generated locally on the appliance. It is valid for 72 hours. Active
accounts can receive an 8-hour local recovery link in the same way. Issuing a
replacement invalidates earlier unused links; first use is atomic. No mail
provider is needed, and neither the secret nor its digest enters Status SQLite,
Status history, operational events, or request URLs seen by the server.

Status does not become a clinical or research identity. It calls only a narrow,
private account-lifecycle API using a dedicated file-backed service bearer. A
console-recovery Status session cannot view or issue account links. The
designated appliance operator is also excluded from local account recovery;
use the synchronized host credential workflow for that account. Full behavior,
distribution guidance, audit actions, and the staged upstream dependency are
documented in [Hospital account provisioning](account-provisioning.md).

## Terminology generations

Open **Terminology generations** to see the active approved package identity,
version, activation time, manifest SHA-256, retained-rollback availability,
and any bounded pending/host-agent state. The page never receives licensed
source files, source paths, database names, logs, credentials, or patient data.

A normal password+MFA session can request import, exact-package resume,
rollback, and destructive finalization after fresh password reauthentication
and an action-specific confirmation. A console-recovery session is read-only.
The browser supplies only a fixed action and one direct package-directory label;
the root host agent maps that intent to the packaged scripts and shares the
backup/update maintenance lock. Console-only or stale-agent state disables the
buttons. An interrupted mutation is never retried automatically. See
[Terminology import](terminology-import.md) for the package, manifest, go-live,
rollback, privacy, and host-recovery contracts.

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
Install and update retain a sound fallback certificate while it has at least
30 days left, and replace an expiring, malformed, or mismatched pair only after
validating a complete replacement. A persistent twice-daily host timer repeats
the check, restarts only Status after replacement, and clears its durable reload
marker only after the loopback listener serves the replacement fingerprint.
It shares the backup/update maintenance lock and therefore defers during a
backup, database migration, or release activation.
Host monitoring includes that certificate alongside both public TLS identities.
A deliberately trusted self-signed certificate may need to be trusted again
after replacement.

The host projection also carries only fixed `clear`, `present`, or `invalid`
states for restore-journal and release-activation recovery locks. Status shows
them as separate bilingual safety components; it never receives the journal,
path, database name, backup identity, process, or timestamp. Hospital-owned
Nagios/Icinga-style monitoring can use the fixed-output command documented in
[Privacy-safe host observability](host-observability.md).

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

The password is only the first sign-in step. On the first Status sign-in for a
credential generation, scan the locally generated QR code with the hospital
IT authenticator app (or type the manual key), then enter its six-digit TOTP.
Status shows ten one-use recovery codes exactly once. Store them offline in the
hospital IT password vault before continuing; possession of one code is enough
for one normal operator sign-in. Status stores only bound SHA-256 hashes of the
codes and rejects reuse of both a recovery code and an already accepted TOTP
time step.

Changing or transferring the appliance credential removes MFA material for the
old generation. The newly designated operator therefore enrolls their own
authenticator at first sign-in and receives a new set of ten codes. If the
dedicated Status MFA key is lost while the Status volume remains, use the
console recovery route and a supported credential rotation; do not edit SQLite
or copy the clinical administrator MFA key into Status.

Run credential operations only from the appliance host. Passwords are read
from a hidden standard-input prompt and are never accepted in command-line
arguments or environment variables.

Check synchronization without printing an email or hash:

```sh
sudo sh /opt/lospor-hospital/current/scripts/appliance-operator.sh state
sudo sh /opt/lospor-hospital/current/scripts/appliance-operator.sh verify
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
sudo sh /opt/lospor-hospital/current/scripts/appliance-operator.sh abort-pending
```

### Console recovery

If the normal Status credential cannot be used, a host administrator can issue
a single-use token:

```sh
sudo sh /opt/lospor-hospital/current/scripts/appliance-operator.sh recovery-token
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
sh scripts/test-install.sh
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
