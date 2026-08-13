# Hospital release validation

A Hospital release is acceptable only after the automated quality workflow and
this Linux appliance drill both pass. The serverless demonstration is not part
of the drill.

## What is shipped

Hospital `1.0.0` is built once for `linux/amd64`. The seven LOSPOR images are
API, Web, PWA, Browser, Status, migrator, and tools. PostgreSQL, Caddy, and the
curl delivery worker are the other three signed image identities. `Core` is
compiled into the applications; it is not another container.

Every release contains:

- `lospor-hospital-<version>-deployment.tar.gz`;
- one or more ordered `images.tar.gz.part-NNN` files, each no larger than
  1.9 GiB;
- the audit-oriented JSON manifest and image lock;
- a canonical line-oriented release lock and its detached Ed25519 signature;
- a signed-hash security-evidence archive containing SBOMs, vulnerability
  reports, approved build inputs, the image lock, and the exact risk-exception
  file used by policy.

The line-oriented lock exists so a hospital can authenticate an installer with
OpenSSL and ordinary Ubuntu tools. Node.js, npm, Git, Prisma, `jq`, and database
clients are not host prerequisites.

## Release trust and GitHub setup

The GitHub repository must have a protected `hospital-release` Environment
with required human reviewers. Publication intentionally fails closed unless
all of these are configured in that environment:

- secret `HOSPITAL_RELEASE_SIGNING_KEY_B64`: base64 of the PEM Ed25519 private
  key;
- secret `HOSPITAL_RELEASE_PUBLIC_KEY_B64`: base64 of the corresponding PEM
  public key;
- variable `HOSPITAL_RELEASE_NODE_BASE_IMAGE`, exactly
  `node:24-bookworm-slim@sha256:<digest>`;
- variable `HOSPITAL_RELEASE_NGINX_BASE_IMAGE`, exactly
  `nginx:1.29.1-alpine@sha256:<digest>`;
- variables `HOSPITAL_RELEASE_POSTGRES_IMAGE`,
  `HOSPITAL_RELEASE_CADDY_IMAGE`, and `HOSPITAL_RELEASE_CURL_IMAGE`, using the
  tags declared in `compose.yaml` plus an approved digest;
- variable `HOSPITAL_RELEASE_TRIVY_IMAGE`, exactly
  `aquasec/trivy:0.72.0@sha256:<digest>`.

Do not invent these digests. A release engineer must resolve, review, and enter
the approved `linux/amd64` digests. The workflow pulls every configured digest
and rejects the wrong platform before building anything.

The private key must never leave the protected release environment. Hospital
IT receives the public key and its SHA-256 fingerprint through a separately
authenticated onboarding route. A public key downloaded beside a release is
convenient data, not proof of who signed that release. The trusted public key
and a copy of `verify-release.sh` should therefore be installed on the server
before the first deployment archive is accepted.

Keep all seven GHCR packages private. Give each connected hospital a separate,
revocable, read-only registry credential. The offline route needs no registry
or internet access.

`release.yml` deliberately has no manual-dispatch entry point: it represents
the complete publishing transaction and only an exact
`hospital-MAJOR.MINOR.PATCH` tag can start it. Use the manual dispatch on
`quality.yml` for a non-publishing source rehearsal; its name and summary do not
claim to have exercised registry promotion, signing, or the offline archive.

## Automated gate

The repository workflow must pass:

- clean installs for API, web, PWA, Browser, Status, Core, and exchange
  contract;
- pinned-source and exchange-contract verification;
- typecheck, strict lint, unit tests, and production builds;
- PostgreSQL migrations and all PostgreSQL concurrency tests;
- Status producer/consumer contracts and the dependency-free fixture tests;
- safe-runtime-log and no-external-telemetry checks;
- dependency audit at high severity;
- all three resolved Docker Compose models, all application image builds, and
  the exact two-container Status resilience smoke test.

The release Compose contract is checked against `docker compose config
--format json`, not by reading YAML text. It proves that:

- `compose.yaml` gives all seven Hospital images a build definition;
- `compose.yaml` plus `compose.publish.yaml` retains those builds and adds the
  exact versioned GHCR names;
- `compose.yaml` plus `compose.release.yaml` has those image names and no local
  builds;
- no model uses `latest`, exposes PostgreSQL, or moves the Status fallback away
  from `127.0.0.1:3443`.

Run the real contract and its destructive negative controls with:

```sh
node scripts/verify-release-compose.mjs
node --test scripts/verify-release-compose.test.mjs
```

The release workflow calls the ordinary quality workflow, then runs the full
disposable installation test. It then builds seven commit-specific candidates
with digest-pinned base images and scans all ten images. Every Critical and
every fixable High vulnerability blocks publication. An unfixed High is allowed
only by an exact entry in `release-risk-exceptions.json` naming the `1.0.0`
release, logical image, vulnerability, package, meaningful justification, and
future expiry date. Stale, duplicate, inexact, and unused exceptions fail.
Every external GitHub Action in the quality and privileged publication
workflows is pinned to a reviewed full commit SHA, with its human-readable
release version beside it. A static negative gate rejects a mutable tag or an
undocumented pin before publication can begin.

Only after that policy passes are missing private, run-specific candidates
pushed. A retried workflow run pulls any candidate already stored under its
`candidate-<commit>-<run>-<build-input-hash>` name and does not rebuild it;
every pulled or newly built image is scanned again and bound to the new
evidence ledger. CI removes
its local candidates, pulls the registry digests back, and runs a complete
clean appliance from those identities. It then proves that the signed
deployment kit—not the checkout's old scripts—drives an online install. It
builds the offline parts from the same image IDs, removes candidate, final and
immutable references plus build cache, and runs another install from only the
signed offline parts. The final `1.0.0` tags are then pushed from those already
tested image IDs without a rebuild. Existing candidate or final tags are
accepted only when they match the recorded image ID and registry digest. A
final registry check and byte-for-byte draft-asset download must pass before a
draft GitHub Release becomes public.

Run the supply-chain negative controls with:

```sh
node --test scripts/release-artifacts.test.mjs
node --test scripts/release-activation.test.mjs
node --test scripts/verify-vulnerability-policy.test.mjs
```

They cover altered locks and artifacts, wrong keys, wrong repositories,
`latest`, missing and duplicate images, `linux/arm64`, Docker Hub digest-name
normalisation, oversized parts, path traversal, Critical/fixable High findings,
expired or unused exceptions, and restoring the prior services when a failed
candidate moved a shared third-party tag to a different digest.

## Client verification and installation

Before extracting a deployment archive, hospital IT verifies the signed lock
with the separately trusted public key and checks the deployment artifact:

```sh
./verify-release.sh release.lock release.lock.sig \
  /etc/lospor/trust/hospital-release-ed25519.pem . deployment
```

After extraction, an online installation authenticates to private GHCR and
runs:

```sh
docker login ghcr.io --username HOSPITAL_PACKAGE_USER --password-stdin
./scripts/run-online-release.sh release.lock release.lock.sig \
  /etc/lospor/trust/hospital-release-ed25519.pem /media/lospor-1.0.0
```

An offline installation places every signed part in one directory and runs:

```sh
./scripts/load-offline.sh release.lock release.lock.sig \
  /etc/lospor/trust/hospital-release-ed25519.pem /media/lospor-1.0.0 \
  -- ./scripts/install.sh
```

Both launchers verify the signature and signed deployment archive before they
touch the running installation, then verify the exact image IDs and
`linux/amd64` platform. They extract the candidate into a fresh, versioned
directory, link the hospital's site configuration, secrets, backups and runtime
data, and invoke that candidate's own installer/updater. Only a successful run
atomically changes the installed-release state. Downgrades and a different
signed identity for the same version are rejected. The one-time verification
authorization is never written to `.env`; only non-secret release version,
path, and lock digest state persists for fresh-shell operator commands. The
release Compose overlay uses `pull_policy: never`, so Docker cannot silently
replace a verified image while starting the appliance.

The fast Status test is:

```sh
./scripts/test-status-dev.sh
```

It runs the real Status image against a synthetic fixture in exactly two
persistent containers. It is a development contract/resilience check, not a
substitute for the actual appliance drill.

Before release, run the full disposable appliance test on a clean host:

```sh
./scripts/test-install.sh
```

It refuses an existing `.env` and occupied ports 80/443 because it destroys
the disposable Compose project and volumes that it creates. Never point it at
an installed hospital appliance.

## Disposable installation drill

1. Install on a disposable encrypted Linux host with production-like DNS.
2. Run `scripts/install.sh`, import approved reference data, and create two
   non-administrator users.
3. Create two cases for the same local patient number and one for a different
   patient. Confirm the raw number is visible only through authorized local
   identity views and never in logs, clinical JSON, audit details, or exports.
4. Disconnect Central and the internet. Complete a case from the PWA, reconnect,
   and verify one consistent local case without duplicate events or lost fields.
5. Approve only selected complete cases for Central export. Verify drafts,
   incomplete cases, and opted-out cases are excluded.
6. Interrupt an upload, restart the worker, and confirm the same batch resumes
   without a second publication.
7. Receive and verify Central's signed receipt. Confirm the local checkpoint
   advances only after receipt verification.
8. Replay the accepted batch and confirm Central returns the prior result
   without duplicate OMOP rows.
9. Submit a withdrawal and verify its signed receipt and local state.
10. Run `scripts/backup-now.sh`, restore to a disposable host, and compare case,
    audit, export-policy, delivery, and checkpoint records.
11. Sign in to clinical and Status with the same appliance credential, rotate
    it with `scripts/appliance-operator.sh rotate`, and prove the old password
    is rejected by both independent verifiers.
12. Stop API and PostgreSQL together. Confirm the Status login, saved history,
    and internal liveness still work through the loopback HTTPS fallback.
13. Stop Web, PWA, Browser, Caddy, backup, and delivery-worker one at a time.
    Confirm Status remains reachable through its loopback listener and reports
    each intended failure without exposing raw logs or identifiers.
14. Restore an older PostgreSQL dump while preserving the Status volume. Run
    the prompted credential reconciliation and prove both generations agree.

Record software versions, contract version, database migration, timestamps,
checksums, and the operators who performed the drill.

## Required failure tests

- two concurrent editors and finalization versus a clinical write;
- invalid or expired client certificate;
- altered manifest, ciphertext, signature, receipt, or chunk checksum;
- missing Central connectivity;
- full disk and unavailable backup destination;
- clinical API and PostgreSQL unavailable together;
- Caddy unavailable while the loopback Status fallback remains reachable;
- missing/stale backup and delivery-worker signals;
- Status restart with its SQLite volume preserved;
- unsupported exchange version and out-of-order sequence.

Do not tag a release when any required test is skipped.
