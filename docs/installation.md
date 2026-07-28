# Installation

## Prerequisites

- supported 64-bit Linux server or VM;
- Docker Engine with Compose v2;
- OpenSSL and curl;
- four DNS records pointing to the server;
- ports 80 and 443 reachable for TLS issuance;
- encrypted host storage, NTP, monitored free space, and UPS protection;
- a separate encrypted destination for copied backups.

For a small department, start with 8 CPU cores, 16 GB RAM, and 200 GB of
expandable encrypted storage. Size from measured case volume before wider
rollout.

## Install

```sh
chmod +x scripts/*.sh infra/postgres/*.sh
./scripts/install.sh
```

The installer:

1. creates unique local secrets and certificate material;
2. validates and builds the pinned images;
3. migrates the local PostgreSQL database;
4. creates one institution and initial administrator;
5. seeds the bundled Core option catalog;
6. starts the clinical, research, worker, backup, and TLS services.

The administrator password is passed only to the one-time bootstrap container;
it is not written to `.env`.

## Terminology data

Core provides a deterministic clinical fallback catalog. ICD, procedure,
drug, and other licensed reference databases must be imported from the
institution-approved package in `reference-data/` before clinical use. See
`reference-data/README.md`.

## First acceptance checks

```sh
./scripts/backup-now.sh
./scripts/doctor.sh
```

Then perform one manual case using web and PWA, interrupt the network during
an intraoperative edit, reconnect, verify recovery, finalize the case, and
verify that the local Browser can inspect it.
