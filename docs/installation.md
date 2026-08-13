# Installation

## Supported host and prerequisites

The version 1.0.0 reference deployment is an amd64 Ubuntu appliance. On the
hospital's Windows Server 2019, 2022, or 2025, IT enables Hyper-V and creates a
Generation 2 Ubuntu Server 24.04 LTS virtual machine. LOSPOR does not use
Windows containers. Version 1.0.0 does not ship a prebuilt VHDX; IT installs
and patches the ordinary Ubuntu VM under the hospital's server policy.

Install on the Ubuntu VM:

- Docker Engine and Docker Compose v2;
- OpenSSL and curl;
- gzip and tar for verified offline-release handling;
- standard Ubuntu text utilities including `awk`, `basename`, `cmp`, `grep`,
  `sed`, `sha256sum`, `tail`, `tr`, and `wc`;
- OpenSSH Server for the loopback-only Status recovery tunnel; and
- the ordinary Ubuntu utilities checked by the readiness script (`getent`,
  `ss`, and `timedatectl`).

Hospital IT does **not** install Node.js, npm, Git, Prisma, PostgreSQL, Caddy,
nginx, or development tools. PostgreSQL, Caddy, nginx, the Node runtimes, and
all LOSPOR applications arrive in the checksum-verified container release. The
supplied tools container performs credential and database administration
without putting Node.js on the server.

The VM also requires:

- two DNS records pointing to the server — one clinical, one research;
- ports 80 and 443 reachable for TLS issuance, with loopback port 3443 free for
  the Status outage path;
- an exact management/VPN CIDR allowlist for the Status page;
- encrypted host storage, NTP, monitored free space, and UPS protection; and
- a separate encrypted destination for copied backups.

Start with at least 8 virtual CPU cores, 16 GiB RAM, and 200 GiB free on
expandable encrypted storage. The Docker storage location needs the same free-
space capacity if it is on a separate filesystem. Size from measured case,
image, and backup volume before wider rollout.

Run the non-mutating readiness report after configuring `.env` and before the
first install:

```sh
./scripts/readiness-check.sh --strict
```

It checks Ubuntu/architecture, Docker/Compose, CPU, RAM, disk, synchronized
time, DNS, ports 80/443/3443, and backup settings. It does not install packages,
change firewall rules, reserve ports, alter Docker, or write configuration.

## Install a client release

The release comes from the private GitHub repository and has no
software-release key. The maintainer downloads the reviewed Immutable Release,
checks the versioned `release.lock.sha256` sidecar and every payload against the
release lock, copies the complete final asset set to a clean encrypted USB,
retains physical custody, and performs the installation on site. Exact online
and offline commands are documented in [Hospital release
validation](release-validation.md#client-verification-and-installation).

The final assets contain the launcher inside the deployment archive, not as a
separate unarchived file. For the first installation, compare the release lock
with the SHA-256 retained separately from the reviewed publication, verify the
deployment payload from that lock, and only then extract the verified archive
into a new persistent bootstrap directory. Bind that bootstrap directory to
`/opt/lospor-hospital` as shown in the linked procedure. For later updates, run
`run-online-release.sh` or `load-offline.sh` from
`/opt/lospor-hospital/current/scripts`; the active trusted launcher verifies
and stages the new deployment archive itself.

Both launchers take the release lock, its canonical `.sha256` sidecar, and the
directory containing the release assets, and automatically choose install
versus update. Offline installation requires the complete final set: manifest,
deployment archive, security evidence, lock, sidecar, and every image part. Do
not extract over an existing release, pass a custom command, or set
`HOSPITAL_IMAGES_VERIFIED` manually. It is a short-lived assertion passed only
by those verifiers and is never written to `.env`.

The checksum chain detects changed bytes relative to the lock and sidecar. It
does not independently prove who published them: compromise of the GitHub
repository/account or physical USB chain can defeat this model if all compared
records are replaced consistently.

## Source installation for development

```sh
chmod +x scripts/*.sh infra/postgres/*.sh
./scripts/install.sh
```

The installer:

1. creates unique local secrets and certificate material;
2. uses integrity-verified release images, or builds vendored images only in
   explicitly detected source/development mode;
3. migrates the local PostgreSQL database;
4. creates the restricted database probe used only for `SELECT 1`;
5. creates one institution and initial appliance administrator;
6. initializes separate clinical and Status password verifiers from the same
   one-time password prompt;
7. seeds the bundled Core option catalog;
8. starts the clinical, research, worker, backup, Status, and TLS services.

For a client release, the supported online/offline launcher verifies the lock
sidecar, manifest, payload hashes, and exact image identities first. The
installer then refuses to pull or rebuild those images. Omitting that
verification step fails closed. Building from the vendored source remains a
development workflow, not the hospital release-installation path.

The administrator password is passed only over standard input to the one-time
initializers; it is not written to `.env`, command-line arguments, Compose
metadata, or either container image. The same email/password works in the
clinical application and Status, but each stores its own independent hash.

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
| `https://<clinical>/status/` | Appliance Status, restricted to `HOSPITAL_STATUS_ALLOWED_CIDRS` and an independent login |
| `https://<research>/` | Research Browser, restricted to `HOSPITAL_RESEARCH_ALLOWED_CIDRS` |

If Caddy is unavailable, Hospital IT can reach the same Status container at
`https://localhost:3443/status/` through an SSH tunnel. The port is bound only
to loopback and uses a self-signed `localhost` certificate. See
[Status monitor](status-monitor.md) for the tunnel command and limitations.

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

`doctor.sh` checks both Status paths, Status internal liveness, credential
generation synchronization, and the safe backup/worker markers in addition to
the clinical routes.

Then perform one manual case using web and PWA, interrupt the network during
an intraoperative edit, reconnect, verify recovery, finalize the case, and
verify that the local Browser can inspect it.
