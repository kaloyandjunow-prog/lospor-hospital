# Operations

[Български](operations.bg.md) | **English**

## Daily

- monitor `docker compose ps`;
- monitor disk, memory, TLS expiry, clock synchronization, and backup age;
- review Status incidents, safe operational events, failed Central deliveries,
  and clinical security audit events;
- review the external-AI policy/provider state in Status and investigate any
  unexpected disablement or unreadable credential;
- copy the latest backup to a separate encrypted system.

Treat the off-host copy as part of the daily clinical safety check: confirm a
new `lospor-....backup` object arrived, authenticate its closed `manifest.json`,
and verify its `database.dump` hash at the destination. A local green backup
indicator cannot prove that the separate copy succeeded; Status reports the
last acknowledged off-host object separately. Perform and record a restore
drill from the real off-host medium at least quarterly. The complete English
and Bulgarian procedures are in [Backup and restore](backup-restore.md) and
[Архивиране и възстановяване](backup-restore.bg.md).

## The losporctl command

`losporctl` is the one console command for hospital IT. Installation puts it
at `/usr/local/bin/losporctl`, and it always runs from the active verified
release. It runs the appliance's own scripts, so everything below them still
applies. Every command except `help` and `version` needs `sudo`.

```sh
sudo losporctl status
sudo losporctl check
sudo losporctl backup run
sudo losporctl support-bundle create
sudo losporctl update check
sudo losporctl config plan
```

`status` says in plain words how the appliance is doing, and gives the next
step for anything that needs attention. `status --json` gives the same as one
object for monitoring. `support-bundle create` writes a file for LOSPOR
support that holds only versions, states, times and check results: no
patients, cases, accounts, names, addresses or secrets. The command prints
the file so it can be read before it is sent. A command that restarts
services (`config apply`, `update apply`, `update offline`, `secrets commit`,
`secrets rollback`) first says what will happen and asks for `yes`; `--yes`
confirms in advance. Exit status 0 is success, 1 failure, 2 wrong usage,
3 blocked by a lock or state, 4 needs `sudo`.

## Useful commands

```sh
docker compose ps
docker compose logs --since 1h api
docker compose logs --since 1h delivery-worker
docker compose logs --since 1h postgres
docker compose logs --since 1h status
sudo sh /opt/lospor-hospital/current/scripts/backup-now.sh
sudo sh /opt/lospor-hospital/current/scripts/doctor.sh
sudo sh /opt/lospor-hospital/current/scripts/readiness-check.sh
sudo sh /opt/lospor-hospital/current/scripts/appliance-operator.sh state
sudo sh /opt/lospor-hospital/current/scripts/rotate-operational-secrets.sh state
```

Use [Network and TLS boundaries](network-boundaries.md) for CIDR or certificate
changes, and [Terminology import](terminology-import.md) for the governed staged
import, go-live, rollback, and finalization commands. Both procedures are
fail-closed and have Bulgarian operator output and Bulgarian companion docs.

Do not expose PostgreSQL, the worker route, or container-management sockets.
Do not edit database rows or Status SQLite manually during clinical use. The
Status page contains only allowlisted operational events; use the host-only,
rotated Compose logs for detailed diagnosis. There is no Sentry or external
log/telemetry service.

## Changing site settings

Hospital IT owns one file: `/opt/lospor-hospital/site.env`. It holds the
names, certificate mode, network allowlists, ports, e-mail sender, support
contact and update window. The file `site.env.example` in the release lists
every setting. Secrets and generated values live in
`/opt/lospor-hospital/secrets/appliance.env`. `.env` is compiled from both.
Never edit either of those two, and never put a secret in `site.env`: the
compiler refuses both.

Edit `site.env`, preview the change, then apply it:

```sh
sudo sh /opt/lospor-hospital/current/scripts/apply-site-config.sh --plan
sudo sh /opt/lospor-hospital/current/scripts/apply-site-config.sh --yes
```

The plan validates every value (names, certificate mode, exact network lists,
ports, addresses, support contact, update window and time zone), checks the
result with Compose, and lists only the settings that change. Applying takes
the shared maintenance lock, keeps the last known good configuration, lets
Compose recreate only the services whose configuration changed, and runs
doctor. If the appliance does not come back healthy, the previous configuration
is restored and started again. The rejected edit is kept at
`.data/config/site.env.rejected`. Exit status 3 means even the restored
configuration is unhealthy, and the console must be reviewed.

## External AI

External AI is optional and separate from the bundled adult/pediatric guidance.
Use only the Status control to enable or disable it and to replace or remove the
Mistral credential. The operation requires a normal password-authenticated
operator session, reauthentication, and an audit reason; a console recovery
session cannot change it. Status shows only provider/configuration state and
timestamps. It never receives the credential or its ciphertext.

Do not add `MISTRAL_API_KEY` to `.env` or Compose. The only supported credential
path is the API sealing service backed by `secrets/api/external-ai-seal-key`.
Escrow that file with the full appliance secret set: losing or replacing it
makes stored credentials unreadable and causes restore to fail closed before
database mutation. See [External AI control](external-ai-control.md).

`readiness-check.sh` is read-only. Run it after host, Docker, DNS, storage, or
time-service changes. Without `--strict` it reports every issue but returns
control for diagnosis; installation uses strict mode and stops on a failed
requirement.

## Status during an outage

Use `https://<clinical>/status/` from an address permitted by
`HOSPITAL_STATUS_ALLOWED_CIDRS`. If Caddy is unavailable, tunnel the
loopback-only fallback from an administrator workstation:

```sh
ssh -L 3443:127.0.0.1:3443 appliance-admin@hospital-host
```

Then open `https://localhost:3443/status/`. Both numbers follow
`HOSPITAL_STATUS_PORT`, so a site that moved it tunnels that port instead. A
warning for the installation-local
self-signed certificate is expected. Status survives clinical API/database
outages, but not failure of the host, Docker daemon, Status container or
volume, power, or hospital network.

## Appliance administrator

The appliance operator uses one email/password in the clinical application and
Status, backed by separate verifiers. Status additionally requires the
operator's TOTP or one unused Status recovery code after the password. Keep the
ten one-use codes issued at enrollment offline in the Hospital IT password
vault. Use only the coordinated host commands:

```sh
sudo sh /opt/lospor-hospital/current/scripts/appliance-operator.sh verify
sudo sh /opt/lospor-hospital/current/scripts/appliance-operator.sh state
sudo sh /opt/lospor-hospital/current/scripts/appliance-operator.sh rotate
sudo sh /opt/lospor-hospital/current/scripts/appliance-operator.sh transfer
sudo sh /opt/lospor-hospital/current/scripts/appliance-operator.sh recovery-token
```

Passwords are entered through hidden standard-input prompts. Never put one in
an environment variable, argument, shell history, or hand-written JSON file.
See [Status monitor](status-monitor.md) for initialization, interrupted-change,
recovery, and repair procedures.

## Ordinary credential rotation

Do not change `.env`, a PostgreSQL role, or a Status token independently. The
supported host workflow prepares a protected transaction, overlaps credentials
where required, commits and verifies the new generation, proves old credentials
rejected, and rolls back automatically on failure:

```sh
sudo sh /opt/lospor-hospital/current/scripts/rotate-operational-secrets.sh prepare ordinary
sudo sh /opt/lospor-hospital/current/scripts/rotate-operational-secrets.sh state
sudo sh /opt/lospor-hospital/current/scripts/rotate-operational-secrets.sh commit
```

Use `rollback` to discard or reverse a pending transaction. Session rotation
intentionally signs everyone out; the coordinated appliance-operator password
workflow above is separate. If `state` reports protected residue after a
verified commit, repair its filesystem ownership/permissions and run
`sh scripts/rotate-operational-secrets.sh cleanup`; cleanup never changes the
active generation. See
[Operational credential rotation](secret-rotation.md) for individual scopes,
audit evidence, limitations, and the Linux acceptance drill.

## Accounts

Self-registration is disabled. The initial administrator creates verified,
approved local users. Each account belongs to an institution and receives the
minimum required role. Remove departed users promptly and review administrators
regularly.

## Data retention

A deleted account is not erased immediately. It is marked deleted, and 30 days
later the appliance anonymises it and prunes the rate-limit rows tied to it. The
delay exists so an accidental deletion can be reversed; after it, the erasure is
permanent and deliberately not recoverable from the running system.

The purge runs daily inside the delivery worker, on its own clock
(`HOSPITAL_RETENTION_INTERVAL_SECONDS`, default 86400). There is no separate
service and no host cron to configure.

The Status page reports it under **Data retention purge**:

| Reading | Meaning |
| --- | --- |
| `RETENTION_COMPLETED` | A purge finished within the last 36 hours. |
| `RETENTION_AGING` | Nothing has succeeded for 36 hours. Investigate. |
| `RETENTION_OVERDUE` | Nothing has succeeded for 48 hours. The obligation is slipping. |
| `RETENTION_API_UNAVAILABLE` | The worker could not reach the API. |
| `RETENTION_REJECTED` | The API refused the request; check `CRON_SECRET`. |
| `RETENTION_SIGNAL_MISSING` | No purge has ever been recorded on this appliance. |

`RETENTION_SIGNAL_MISSING` reads as unknown, never as healthy. An erasure
obligation nobody can produce evidence for must not show green.

To run one immediately rather than waiting for the daily pass:

```sh
docker compose exec delivery-worker sh -c \
  'curl -s -H "Authorization: Bearer $CRON_SECRET" \
     http://api:3002/v1/internal/purge-deleted'
```

The route is reachable only from inside the appliance network; it is not served
through the clinical hostname.

## Automatic case closure

A case submitted for review is finalised automatically once its thirty-minute
review window elapses, so that a finished case does not stay open because
nobody came back to sign it. Until 1.3.0 the appliance had no clock for this:
the sweep ran only in the serverless deployment, and on a hospital box a case
closed only if a clinician happened to have it open when the countdown ran out.

The sweep runs every five minutes inside the delivery worker, on its own clock
(`HOSPITAL_CASE_CLOSE_INTERVAL_SECONDS`, default 300). There is no separate
service and no host cron to configure.

A case that cannot be closed — incomplete documentation — is not closed. It is
deferred with a growing backoff so that the cases behind it are still reached,
and it is finalised on a later pass once the missing record is entered.

The Status page reports it under **Automatic case closure**:

| Reading | Meaning |
| --- | --- |
| `CASE_CLOSE_COMPLETED` | A sweep finished within the last 20 minutes. |
| `CASE_CLOSE_AGING` | Nothing has succeeded for 20 minutes. Investigate. |
| `CASE_CLOSE_OVERDUE` | Nothing has succeeded for an hour. Cases are staying open. |
| `CASE_CLOSE_API_UNAVAILABLE` | The worker could not reach the API. |
| `CASE_CLOSE_REJECTED` | The API refused the request; check `CRON_SECRET`. |
| `CASE_CLOSE_SIGNAL_MISSING` | No sweep has ever been recorded on this appliance. |

To run one immediately:

```sh
docker compose exec delivery-worker sh -c \
  'curl -s -H "Authorization: Bearer $CRON_SECRET" \
     http://api:3002/v1/internal/close-expired-cases'
```

## Printable clinical protocol

The appliance serves an authorized HTML print page; it does not generate PDF
files on the server. Clinicians use **Print / Save as PDF** in the browser.
The phone app requests a five-minute, case-scoped print link and opens that
page in the device browser; it does not download a hidden PDF file. A PDF may
be created only by the browser or operating system when it offers a **Save as
PDF** print destination.

Do not install Chrome, Chromium, Edge, Puppeteer, or a PDF-rendering service on
the appliance for this feature. No such third-party renderer is required by
Hospital. During acceptance, verify both same-institution access and a
different-institution denial before printing a real clinical case.

## Central outage

Clinical work continues against the local database. Approved deliveries remain
queued and retry after connectivity returns. Never bypass the receipt check or
manually mark a batch accepted.

## Reference updates

Import terminology updates only through the staged
`scripts/import-terminology.sh` wrapper. Its strict manifest records source,
version, licence approval, checksums, minimums, import time, and operator. Run
the go-live gate and test search in both supported languages before clinical
rollout; use the documented rollback command rather than a raw seed script.
