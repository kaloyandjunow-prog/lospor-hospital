# Installation

## Prerequisites

- supported 64-bit Linux server or VM;
- Docker Engine with Compose v2;
- OpenSSL and curl;
- two DNS records pointing to the server — one clinical, one research;
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

An installation with no Central credentials in `secrets/` is a supported state,
not a degraded one: the installer says so, and the site runs standalone.
Clinical data stays local and research export begins only once the site enrols.

## What each address serves

Clinicians are given one name. On a desktop it opens the web app; on a phone,
`/app` installs to the home screen.

| URL | Serves |
|---|---|
| `https://<clinical>/` | Web app |
| `https://<clinical>/app` | Installable phone app (PWA) |
| `https://<clinical>/v1/…` | API, for both clients |
| `https://<research>/` | Research Browser, restricted to `HOSPITAL_RESEARCH_ALLOWED_CIDRS` |

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
