# Installation

[Български](installation.bg.md) | **English**

## Supported host and prerequisites

The reference deployment is an amd64 Ubuntu appliance. On the
hospital's Windows Server 2019, 2022, or 2025, IT enables Hyper-V and creates a
Generation 2 Ubuntu Server 24.04 LTS virtual machine. LOSPOR does not use
Windows containers. The appliance does not ship a prebuilt VHDX; IT installs
and patches the ordinary Ubuntu VM under the hospital's server policy.

Install on the Ubuntu VM:

- Docker Engine and the `docker compose` plugin 2.19.0 or newer. Both the
  classic (overlay2) and containerd image stores are supported — including a
  fresh Ubuntu Docker install, which now defaults to the containerd store;
- OpenSSL, curl, and Python 3 (used for exact IPv4/IPv6 CIDR and optional
  support-destination validation);
- gzip and tar for verified offline-release handling;
- standard Ubuntu text utilities including `awk`, `basename`, `cmp`, `flock`,
  `grep`, `sed`, `sha256sum`, `tail`, `tr`, and `wc`;
- OpenSSH Server for the loopback-only Status recovery tunnel; and
- the ordinary Ubuntu utilities checked by the readiness script (`getent`,
  `ss`, and `timedatectl`).

Hospital IT does **not** install Node.js, npm, Git, Prisma, PostgreSQL, Caddy,
nginx, or development tools. PostgreSQL, Caddy, nginx, the Node runtimes, and
all LOSPOR applications arrive in the checksum-verified container release. The
supplied tools container performs credential and database administration
without putting Node.js on the server.

The VM also requires:

- two DNS records for the server — one clinical, one research. Internal
  (split-horizon) records are fine, and usual, for a site that is not published
  to the internet;
- a certificate, by one of the three routes in *Certificates* below. Only the
  first needs inbound port 80 from the internet;
- the clinical HTTPS port reachable from the wards, with the loopback Status
  port free for the outage path. These default to 443 and 3443 and can be moved
  with `HOSPITAL_HTTPS_PORT` and `HOSPITAL_STATUS_PORT` in `.env`;
- separate exact Research/VPN and IT-management CIDR allowlists for the
  Research Browser and Status page;
- encrypted host storage, NTP, monitored free space, and UPS protection; and
- a separate encrypted destination for copied backups.

See [Network and TLS boundaries](network-boundaries.md) for the exact two-name,
CIDR, certificate-mode, validation, and safe-change contract.

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

The release comes from the public GitHub repository and carries a raw Ed25519
signature over its release lock. The maintainer downloads the reviewed
Immutable Release, verifies `release.lock.sig`, checks the versioned
`release.lock.sha256` sidecar and every payload against the release lock, copies
the complete final asset set to a clean encrypted USB,
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
deployment archive, security evidence, lock, sidecar, raw 64-byte
`release.lock.sig`, and every image part. Do
not extract over an existing release, pass a custom command, or set
`HOSPITAL_IMAGES_VERIFIED` manually. It is a short-lived assertion passed only
by those verifiers and is never written to `.env`.

The checksum chain detects changed bytes relative to the lock and sidecar. The
signature identifies the maintainer only after the hospital has confirmed and
pinned the public-key fingerprint by a separate route; a key merely carried by
the same download is not trusted on sight.

The guided installer starts with a bilingual language screen. Bulgarian is
preselected; English remains an obvious choice for a foreign operator. The
selection changes the rest of the installer immediately and is persisted as
`LOSPOR_DEFAULT_LOCALE=bg|en`. It controls only the first unauthenticated view:
an explicit login choice is saved to the account and then becomes authoritative
across applications.

On a fresh installation, two separate Yes-by-default questions ask whether to
enable the bundled pre-calculated guidance for faster adult and pediatric data
entry. They are bootstrap choices, not a statement of clinical suitability.
Pediatric charting itself is a fixed enabled Hospital capability; these prompts
control only calculated entry assistance and never whether a child can be
documented.
Status can later disable or re-enable each population independently with fresh
operator authentication and an audit reason. Disabling guidance removes only
prospective drug/infusion/fluid suggestions; manual charting, safety/allergy
functions, calculators, pediatric documentation, historical records, and
retrospective totals remain available. An update preserves the stored runtime
choices and never reapplies the installer defaults.

Those two answers are policy only; they do not decide whether release content
is clinically suitable. After migrations and Hospital bootstrap, the installer
runs the owner API's release provisioner exactly once with explicit `--apply`.
That provisioner atomically publishes and selects the separately reviewed adult
and pediatric bundled baselines under a release-owned technical principal. It
refuses collisions, partial state, conflicting selections, or changed content.
The installer then requires the same read-only exact-v2 assessment used by
runtime and Status to print **Ready** for both populations before service start,
doctor, or success. These content checks do not couple the two policy answers,
and manual charting remains available even when a policy is off. In Status,
preset identity, publication state, exact rule/profile counts, and SHA-256 must
continue to match the bundled v2 snapshot before calculated guidance is shown.
See
[calculation-guidance policy](clinical-guidance-policy.md).

A third Yes-by-default question controls optional external AI for the
pre-operative advisor, laboratory-image extraction, and monitor OCR. This is
separate from the local adult/pediatric guidance choices. When Yes is selected,
the installer accepts an optional Mistral credential through a hidden prompt;
blank is valid and leaves the feature visibly unavailable until Hospital IT
adds the credential in Status. The credential travels only over standard input,
is immediately sealed with an API-only appliance key, and is never written to
`.env`, argv, Compose metadata, logs, or a browser response. A password-
authenticated Status operator can later enable/disable external AI and replace
or remove the credential, with an audit reason. See
[External AI control](external-ai-control.md).

The installer also accepts an optional local support destination: either an
internal HTTPS help/ticket URL without embedded credentials or one bare
`mailto:` mailbox. Blank is valid and means clinicians are directed to their
local administrator without a clickable destination. Mobile/PWA includes
version-matched offline help and exposes this configured contact through the
public, non-secret capability response. Its problem-report screen shows the
clinician a privacy-safe diagnostic preview first and never includes patient,
case, clinical, account, institution, token, or free-text content. Nothing is
sent automatically; `mailto:` subject/body content is added only after the
clinician deliberately opens the reviewed mail draft.

The installer also accepts an optional absolute path to the hospital's own
encrypted off-host backup executable. A blank answer installs the truthful
deferred hook and leaves a critical Status warning until Hospital IT configures
and proves an external acknowledgement. See [Backup and restore](backup-restore.md).

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
8. seals the optional external-AI provider credential without persisting its
   plaintext;
9. provisions both exact reviewed adult and pediatric release baselines once,
   then requires their database-backed readiness report to pass;
10. starts the clinical, research, worker, backup, Status, and TLS services;
11. waits up to five minutes for health, creates a real authenticated recovery
   object, and runs the configured-domain appliance doctor before reporting
   success.

For a client release, the supported online/offline launcher verifies the lock
sidecar, manifest, payload hashes, and exact image identities first. The
installer then refuses to pull or rebuild those images. Omitting that
verification step fails closed. Building from the vendored source remains a
development workflow, not the hospital release-installation path.

The administrator password is passed only over standard input to the one-time
initializers; it is not written to `.env`, command-line arguments, Compose
metadata, or either container image. The same email/password works in the
clinical application and Status, but each stores its own independent hash.
The first Status login then requires enrollment of a TOTP authenticator and
shows ten one-use recovery codes. Hospital IT must save those codes offline
before continuing. The installer creates a separate Status MFA encryption key;
it never reuses the clinical administrator MFA key or the rate-limit key.

The optional external-AI credential uses a separate third input line and is
consumed only by its sealing initializer. It is not an environment setting and
is unset immediately after that one-shot operation.

Nothing else reads that stream. The site configuration -- domains, the sender
address for account email, and the optional non-secret support destination --
is taken from the environment only, and a value
missing from it stops the install by name rather than being filled from the
next line of standard input. That line is the administrator's password.

An installation with no Central credentials in `secrets/` is a supported state,
not a degraded one: the installer says so, and the site runs standalone.
Clinical data stays local and research export begins only once the site enrols.

## What each address serves

Clinicians are given one name. On a desktop it opens the web app; on a phone,
`/app` installs to the home screen.

Hospital serves the anaesthesia protocol as authorized printable HTML.
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

## Certificates

Every browser demands proof that this server is the name it claims. Three ways
to get it, and they differ mainly in **who does what**.

| | who does what | inbound internet | browser warnings |
|---|---|---|---|
| **Public authority** (`acme`) | The appliance obtains it automatically, but a public authority must connect **in** on port 80 to verify the name | **required** | none |
| **Hospital's own authority** (`operator`) | Hospital IT issues a certificate and hands over two files; the appliance serves them | not needed | none — managed devices already trust that authority |
| **Caddy's own** (`local`) | The appliance invents one, trusted by nothing | not needed | on every device, unless IT distributes the root |

Most hospitals with a Windows domain already run an authority every managed
device trusts, and `operator` is the usual choice for a system that is not
published to the internet.

### Using the hospital's own authority

Ask IT for a certificate covering both names — the clinical one and the
research one — then:

```sh
install -m 600 fullchain.pem secrets/tls/fullchain.pem
install -m 600 private.key   secrets/tls/private.key
```

and in `.env`:

```sh
HOSPITAL_TLS_MODE=operator
HOSPITAL_TLS_VERIFY_CA=/etc/ssl/certs/hospital-ca.crt
COMPOSE_PROFILES=
```

`scripts/readiness-check.sh` verifies the key mode and match, both clinical and
Research SANs, the configured CA and complete chain, validity dates, server EKU,
and at least 30 days of remaining validity. The installer then parses the exact
mode-expanded Caddyfile before any service binds a port. `HOSPITAL_TLS_MODE` is
the only normal selector; raw Caddy directives are not accepted.

`HOSPITAL_TLS_VERIFY_CA` is what the appliance trusts when it checks **itself**.
Setting it matters more than it looks: `scripts/doctor.sh` is the health gate
for applying a release *and* for verifying the rollback afterwards, so an
appliance that cannot verify its own certificate installs an update, fails the
check, rolls back, fails it again, and leaves an activation lock for an
operator to clear.


The same file is what the appliance trusts when it connects **outwards**, to
the hospital's EHR. Hospitals sign their internal servers with their own
authority, so without it a connection is refused for want of recognising a
certificate rather than for any failure of encryption — which reads from the
outside as "LOSPOR cannot do HTTPS" and ends with the integration document
specifying the plaintext address. Nothing extra is collected: the answer given
here serves both directions.

`HOSPITAL_EHR_TLS_CA` overrides it for the uncommon site whose EHR sits behind
a different authority. `scripts/readiness-check.sh` reports which is in use, so
a refused connection points at trust rather than at the network.

Plaintext EHR endpoints are refused. `HOSPITAL_EHR_ALLOW_INSECURE_ENDPOINT=true`
permits one, and only to a private address — the OAuth client secret is posted
to the token URL, so an unencrypted address puts the hospital's own integration
password on the wire on every token request. Try the same host on `https://`
first, then the certificate authority above; that is usually the whole problem.

### A note on `local`

Caddy's own authority issues **twelve-hour** certificates. That is fine for a
bench, where it renews continuously, and poor for an appliance switched off
overnight: it returns serving an expired certificate, and browsers refuse an
expired certificate outright rather than offering to continue.

Host port 80 is published only by `COMPOSE_PROFILES=tls-acme`, which the
installer derives from `HOSPITAL_TLS_MODE=acme`. Operator and local TLS do not
occupy it.

The guided installer asks separately for exact Research/VPN and IT-management
CIDRs and deliberately supplies no broad private-network default. It rejects
malformed, world-wide, and the old all-RFC1918 placeholder. Later changes use:

```sh
sh scripts/configure-network-boundaries.sh \
  --research "10.24.30.0/24" --status "10.24.40.0/24"
```

The command validates a candidate Caddy configuration before replacement and
retains the last-known-good boundary. The direct Status fallback remains bound
to loopback.

## Terminology data

Core provides a deterministic clinical fallback catalog. ICD, procedure,
drug, and other licensed reference databases must be imported from the
institution-approved package in `reference-data/` before clinical use. See
`reference-data/README.md` and [Terminology import](terminology-import.md). A
successful import is not inferred from table rows: `scripts/doctor.sh
--go-live` requires the active manifest/checksum evidence and repeats the
relationship/count gate.

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
