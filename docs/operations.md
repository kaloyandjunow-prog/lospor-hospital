# Operations

## Daily

- monitor `docker compose ps`;
- monitor disk, memory, TLS expiry, clock synchronization, and backup age;
- review failed Central deliveries and security audit events;
- copy the latest backup to a separate encrypted system.

## Useful commands

```sh
docker compose ps
docker compose logs --since 1h api
docker compose logs --since 1h delivery-worker
docker compose logs --since 1h postgres
./scripts/backup-now.sh
./scripts/doctor.sh
```

Do not expose PostgreSQL, the worker route, or container-management sockets.
Do not edit database rows manually during clinical use.

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
