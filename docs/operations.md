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
./scripts/readiness-check.sh
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

Then open `https://localhost:3443/status/`. A warning for the installation-local
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

## Central outage

Clinical work continues against the local database. Approved deliveries remain
queued and retry after connectivity returns. Never bypass the receipt check or
manually mark a batch accepted.

## Reference updates

Import terminology updates through the provided idempotent import scripts.
Record source, version, licence, checksum, import time, and operator. Test
search in both supported languages before clinical rollout.
