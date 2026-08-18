# Operations

## Daily

- monitor `docker compose ps`;
- monitor disk, memory, TLS expiry, clock synchronization, and backup age;
- review Status incidents, safe operational events, failed Central deliveries,
  and clinical security audit events;
- copy the latest backup to a separate encrypted system.

Treat the off-host copy as part of the daily clinical safety check: confirm the
new `.dump` and matching `.sha256` arrived and verify the checksum at the
destination. A local green backup indicator cannot prove that the separate
copy succeeded. Perform and record a restore drill at least quarterly.

## Useful commands

```sh
docker compose ps
docker compose logs --since 1h api
docker compose logs --since 1h delivery-worker
docker compose logs --since 1h postgres
docker compose logs --since 1h status
./scripts/backup-now.sh
./scripts/doctor.sh
sh ./scripts/readiness-check.sh
./scripts/appliance-operator.sh state
```

Do not expose PostgreSQL, the worker route, or container-management sockets.
Do not edit database rows or Status SQLite manually during clinical use. The
Status page contains only allowlisted operational events; use the host-only,
rotated Compose logs for detailed diagnosis. There is no Sentry or external
log/telemetry service.

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
Status, backed by separate verifiers. Use only the coordinated host commands:

```sh
./scripts/appliance-operator.sh verify
./scripts/appliance-operator.sh state
./scripts/appliance-operator.sh rotate
./scripts/appliance-operator.sh transfer
./scripts/appliance-operator.sh recovery-token
```

Passwords are entered through hidden standard-input prompts. Never put one in
an environment variable, argument, shell history, or hand-written JSON file.
See [Status monitor](status-monitor.md) for initialization, interrupted-change,
recovery, and repair procedures.

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

## Printable clinical protocol

The appliance serves an authorized HTML print page; it does not generate PDF
files on the server. Clinicians use **Print / Save as PDF** in the browser.
The phone app requests a five-minute, case-scoped print link and opens that
page in the device browser; it does not download a hidden PDF file. A PDF may
be created only by the browser or operating system when it offers a **Save as
PDF** print destination.

Do not install Chrome, Chromium, Edge, Puppeteer, or a PDF-rendering service on
the appliance for this feature. No such third-party renderer is required by
Hospital 1.0.0. During acceptance, verify both same-institution access and a
different-institution denial before printing a real clinical case.

## Central outage

Clinical work continues against the local database. Approved deliveries remain
queued and retry after connectivity returns. Never bypass the receipt check or
manually mark a batch accepted.

## Reference updates

Import terminology updates through the provided idempotent import scripts.
Record source, version, licence, checksum, import time, and operator. Test
search in both supported languages before clinical rollout.
