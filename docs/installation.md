# Installation

## Supported host and prerequisites

The version 1.0.0 reference deployment is an amd64 Ubuntu appliance. On the
hospital's Windows Server 2019, 2022, or 2025, IT enables Hyper-V and creates a
Generation 2 Ubuntu Server 24.04 LTS virtual machine. LOSPOR does not use
Windows containers. Version 1.0.0 does not ship a prebuilt VHDX; IT installs
and patches the ordinary Ubuntu VM under the hospital's server policy.

Install on the Ubuntu VM:

- Docker Engine and the `docker compose` plugin 2.19.0 or newer;
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
- port 80 and the clinical HTTPS port reachable for TLS issuance, with the
  loopback Status port free for the outage path. HTTPS and Status default to
  443 and 3443, and a server that already uses those can change them with
  `HOSPITAL_HTTPS_PORT` and `HOSPITAL_STATUS_PORT` in `.env`. **Port 80 is
  fixed**: certificates are issued over the ACME HTTP-01 challenge, which
  Let's Encrypt always validates on port 80 of the public name. A host that
  cannot free port 80 needs the appliance behind a reverse proxy the hospital
  already operates — a different deployment shape, not a different port;
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
sh ./scripts/readiness-check.sh --strict
```

It checks Ubuntu/architecture, Docker/Compose, CPU, RAM, disk, synchronized
time, DNS, the configured HTTP/HTTPS/Status ports, and backup settings. It does
not install packages, change firewall rules, reserve ports, alter Docker, or
write configuration.

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

Hospital 1.0.0 serves the anaesthesia protocol as authorized printable HTML.
It does not run Chromium or another server-side PDF renderer and does not
offer a PDF-download API. On web, select **Print / Save as PDF** to open the
browser's print dialog. On the phone app, **Open printable protocol** obtains a
five-minute, case-scoped link and opens that same page in the device browser.
"Save as PDF" is available only when the browser/operating system provides it.
Patient identity fields remain blank and are filled by hand after printing.
The print link does not weaken institution access: it is issued only after the
normal case authorization check and expires after five minutes.

| URL | Serves |
|---|---|
| `https://<clinical>/` | Web app |
| `https://<clinical>/app` | Installable phone app (PWA) |
| `https://<clinical>/v1/…` | API, for both clients |
| `https://<clinical>/status/` | Appliance Status, restricted to `HOSPITAL_STATUS_ALLOWED_CIDRS` and an independent login |
| `https://<research>/` | Research Browser, restricted to `HOSPITAL_RESEARCH_ALLOWED_CIDRS` |

If Caddy is unavailable, Hospital IT can reach the same Status container at
`https://localhost:3443/status/` through an SSH tunnel — or whatever
`HOSPITAL_STATUS_PORT` is set to. The port is bound only
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
verify that the local Browser can inspect it. Open the printable protocol from
both web and PWA, confirm that the browser print dialog opens, and confirm that
there is no LOSPOR "Download PDF" action or server-generated PDF response.
