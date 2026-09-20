# Hospital release validation

[Български](release-validation.bg.md) | **English**

A Hospital release is acceptable only after the automated quality workflow and
this Linux appliance drill both pass. The serverless demonstration is not part
of the drill.

The quality workflow must invoke the complete `npm run test:update-pipeline`
gate. That gate covers update compatibility, the shared backup/update lock,
capacity and retention limits, activation recovery, the root agent and systemd
contract, update credentials, terminology coordination, host observability,
and signed release-metadata parsing. A release workflow that omits this command
is rejected by its own contract tests.

CI must also run the named `npm run test:central-full-story` gate against the
same freshly migrated disposable PostgreSQL service. It uses the real Hospital
worker and crypto path with a contract-only synthetic Central fixture. The gate
covers configured-but-unapproved refusal, automatic UPSERT of every eligible
finalized case, signed receipt and checkpoint, withdrawal, resend, invalid receipt and
checkpoint refusal, the current and previous supported exchange versions, and
PII-free wire/UI/log/artifact evidence. A skipped PostgreSQL test is not a pass:
the package command explicitly enables both integration flags and fails when
the disposable database is unavailable.

The synthetic fixture does not prove mTLS negotiation, a deployed Central
database, replay behavior across two independently deployed products, or
network recovery. Those remain required in the Linux appliance acceptance
drill below.

CI also runs `npm run test:operator-localization`. It checks paired Bulgarian
and English operator guides, the complete installation-guide structure and
technical tokens, network and terminology contracts, Bulgarian-by-default
operator commands, explicit English selection, and direct English-only prompt
regressions. The release-workflow contract rejects omission of this gate too.

The clinical job installs Chromium for all three clients and runs the complete
Hospital Web, PWA, and Research Browser Playwright suites. Selected smoke
journeys are not a substitute for the full suites; the release-workflow
contract requires all three aggregate commands. Each suite recreates or reseeds
its disposable E2E state before use.

### Client localization import gate

This import is **complete**. All four owner pins — API, Web, PWA and Browser —
have advanced past their pre-localization baselines, and
`npm run verify:client-localization-release` reports:

```
Client localization owner import and Hospital E2E evidence are complete.
```

The gate is not satisfied by the pins alone. Having detected that a pin
advanced, it also requires the source capabilities and the executable Playwright
evidence below, so this `ready` state is an assertion about working behaviour
rather than about version numbers.

The required owner-source capabilities are:

- Web: `src/i18n/locales.ts`, `src/lib/account-locale.ts`, and
  `src/components/AccountLocaleSync.tsx`.
- PWA: `src/lib/appliance-locale.ts` and `src/lib/account-locale.ts`, with a
  language choice at `app/(auth)/login.tsx`.
- Research Browser: `src/lib/locale.ts` and `src/lib/server-locale.ts`.
- API: `src/app/v1/locale/route.ts`, `src/app/v1/user/route.ts`,
  `src/app/v1/auth/session/route.ts`, and `src/app/v1/auth/token/route.ts`,
  carrying the installation-default and `preferences.ui.locale` read/write
  contract all three clients depend on.

The required Hospital E2E evidence lives in Web `e2e/smoke.spec.ts` and
`e2e/smoke-authed.spec.ts`, PWA `e2e/sign-in.pwa.spec.ts`, and Browser
`e2e/login.spec.ts` plus `e2e/authenticated.spec.ts`. Each applicable suite
proves Bulgarian is the unselected-device default, that both `Български` and
`English` are visible at login, and that the authenticated account locale takes
over. The suites identify that evidence with `HOSPITAL_LOCALE_E2E_DEFAULT_BG`,
`HOSPITAL_LOCALE_E2E_VISIBLE_CHOICES`, and
`HOSPITAL_LOCALE_E2E_ACCOUNT_TAKEOVER`; the gate checks both those markers and
the concrete localized assertions.

**What a future pin change must re-prove.** The tag-triggered candidate workflow
runs the strict form, `node scripts/client-localization-import-gate.mjs
--require-ready`, in its metadata job before any candidate work. Advancing any
API, Web, PWA or Browser pin therefore re-enters the same gate: the four must
move as one atomic, provenance-preserving import, and the capabilities and E2E
markers above must still be present in the newly imported sources. Reverting all
four to their pre-localization baselines would return the gate to `pending`,
which ordinary development quality tolerates but no candidate may publish.

Status has no Playwright browser harness, so this gate does not invent one.
Its existing unit/integration evidence covers Bulgarian-default complete and
MFA login, obvious English selection, locale cookies/redirects, control-plane
copy, account surfaces, and terminology in `apps/status/src/app.test.ts`,
`app.control-plane.test.ts`, `app.accounts.test.ts`, `app.terminology.test.ts`,
and `ui.locale.test.ts`.

## What is shipped

A Hospital release is built once for `linux/amd64`. Its ten Hospital images are
API, Web, PWA, Browser, Status, migrator, tools, PostgreSQL, Caddy, and the curl
delivery worker. Each is built as a run-specific candidate from the approved
digest-pinned bases; PostgreSQL, Caddy, and curl are hardened Hospital images,
not unmodified third-party release payloads. `Core` is compiled into the
applications; it is not another container.

Every GitHub Release contains:

- `lospor-hospital-<version>-deployment.tar.gz`;
- one or more ordered `images.tar.gz.part-NNN` files, each no larger than
  1.9 GiB;
- the audit-oriented JSON manifest;
- the canonical line-oriented `lospor-hospital-<version>-release.lock`, its
  `.sha256` sidecar, and the raw 64-byte Ed25519 `release.lock.sig`; and
- a checksum-covered security-evidence archive containing SBOMs, vulnerability
  reports, approved build inputs, the image lock, and the exact risk-exception
  file used by policy.

PostgreSQL 17.11, zlib 1.3.2, and ACL 2.4.0 are compiled from exact
SHA-256-pinned release tarballs against timestamped Debian Bookworm snapshots.
The evidence archive supplements Trivy's package-manager SBOM with a candidate-
image-bound CycloneDX component list and the embedded source URLs/hashes,
PostgreSQL configure flags, compiler identity, and complete sorted builder
package manifest. Trivy does not vulnerability-map these three custom `/opt`
components, so that supplement records provenance only and must not be read as
Trivy vulnerability coverage. The committed release inputs currently block
publication until a reviewer supplies a narrow, release-specific decision with
dated evidence URLs (or supported automated vulnerability coverage is added);
the workflow never invents that acceptance from a clean OS-package scan.

The release lock records the size and SHA-256 of every published payload and,
for all ten images, the top-level registry digest, selected `linux/amd64`
manifest digest, configuration digest, and ordered root-filesystem diff IDs.
These portable identities are intentionally independent of Docker's local
`.Id`, which can differ between classic and containerd-backed image stores.
The canonical
sidecar contains exactly the lowercase SHA-256 of that lock, two spaces, its
exact basename, and a newline. This chain detects accidental damage and any
change relative to the sidecar. It does not independently identify the
publisher: anyone able to replace both the lock and the sidecar can create a
new internally consistent pair.

The Actions candidate also contains the standalone
`lospor-hospital-<version>-images.json` and the run-bound
`lospor-hospital-<version>-publication-request.tsv`. They are internal
provenance inputs and are absent from the final GitHub Release.

The line-oriented format lets a hospital verify a release with `sha256sum`,
OpenSSL, and ordinary Ubuntu tools. Node.js, npm, Git, Prisma, `jq`, and database clients are
not host prerequisites.

## Distribution trust and GitHub setup

The trust chain is:

1. a public GitHub repository whose release and GHCR images anyone can read;
2. the maintainer's GitHub account protected by MFA;
3. an exact tag-triggered candidate build and automated gates;
4. a separate manual publication run bound to the reviewed candidate run,
   attempt, version, release-lock SHA-256, and raw-signature SHA-256;
5. repository-level Immutable Releases;
6. the maintainer's physical custody of the USB and on-site installation; and
7. an Ed25519 signature over `release.lock`, made off GitHub, checked against a
   key the site pinned once.

The first six provide strong provenance within the GitHub account and strong
integrity checks within the delivered bundle. Only the seventh is independent of
GitHub, and its independence rests entirely on where the key is kept. Public
visibility adds no trust and removes none: anyone may download a release, and
only the signature decides whether a site accepts it.

Require MFA for the maintainer account, protect its recovery methods, review
active sessions and access tokens, and keep write access limited to the
maintainer. All ten LOSPOR GHCR packages are public, so a connected hospital
holds no registry credential. The offline route needs no registry or internet
access.

### The release signing key

The key is Ed25519, generated and held by the maintainer, and **it is never
given to GitHub Actions**. That is the whole point of it. A key a workflow can
use lives in the same trust domain as the registry that workflow pushes to:
whoever can publish images can then sign for them, and the signature proves
nothing that the registry did not already assert. `release-workflow-contract-lib.mjs`
enforces this by keeping the candidate workflow completely unsigned and by
rejecting private signing material, signing commands, or signing secrets in the
publication workflow.

So signing is a local step:

    printf '%s' "$(cat /path/to/maintainer.key)" | sh scripts/sign-release-lock.sh release.lock

The key is read from standard input and never from a path argument, so it does
not appear in the process table or the shell history. The script verifies its own
output before exiting; a signature it cannot itself check is not written.

The resulting `release.lock.sig` is public authentication data, not a secret.
The reviewed raw bytes are encoded as canonical base64 and supplied to the
manual publication dispatch together with a separately recorded SHA-256. Both
publication jobs independently decode exactly 64 bytes, verify that SHA-256,
verify the signature over the exact candidate lock with the reviewed public
key, and require that the candidate and publication commits contain the same
public key. The write job then adds those exact raw bytes to the final asset
allowlist before any image or Release mutation. Candidates remain unsigned;
abandoned candidates therefore never look like published releases.

### What a site receives, and when

Once, at installation, through a channel that is **not** the download: a
short fingerprint, the same for every site and every release.

    SHA256:<43 base64 characters>

The installer asks for it, compares it against the key carried in the release,
and pins the key to the appliance on a match. That single confirmation is what
replaces the per-release 64-character `release.lock` SHA-256 the operator
otherwise has to be given, by hand, before every update — and it is what makes
an unattended download safe, because the appliance can then authenticate a
release without a human in the loop.

The copy of the public key inside a release is **never** trusted on sight. An
attacker who can replace the release supplies their own key alongside it, and
every update afterwards verifies perfectly against it; the appliance would be
cryptographically certain it was being updated by whoever compromised it. So:

- with nothing pinned and no fingerprint given, the key is ignored and the site
  keeps using a per-release digest — this is not an error;
- with a fingerprint given, it is compared, and a mismatch stops the install
  before anything is pulled;
- with a key already pinned, a release offering a different one is **refused**,
  by both `install.sh` and `update.sh`, ahead of the backup and the migration.

Once a key is pinned, a signature is **mandatory** — not a setting. A missing
`.sig` is refused exactly like a bad one. If a stripped signature merely skipped
the check, anyone able to serve a modified release could delete the signature
and the appliance would drop back to digest-only verification: the weaker
arrangement pinning exists to replace, re-entered silently and at the attacker's
choosing. `HOSPITAL_REQUIRE_RELEASE_SIGNATURE=1` remains, and means something
different — it refuses to install at all until a key is pinned.

Pinning is optional and reversible only by hand: the pinned key lives at
`<appliance-home>/secrets/release-signing-public.pem`.

### What signing does not buy

It does not make this a two-person release. The maintainer builds the release,
approves it, and holds the signing key, so a compromise of the maintainer's
machine produces a genuine signature over a malicious release. What the
signature adds is that a compromise of *GitHub alone* — the repository, the
account, the packages, or the release assets — no longer suffices, because the
attacker cannot produce a signature that the pinned key accepts.

There is no revocation and no expiry. Rotating the key means telling every site
the new fingerprint through the same out-of-band channel used at installation,
and each site re-pinning deliberately; an appliance will not adopt a new key on
its own, and should not be asked to. Keep the private key offline, and keep a
copy somewhere its loss does not strand every installed appliance on
per-release digests forever.

### The two privileged workflows

They have deliberately different authority:

- `.github/workflows/release.yml` starts only from an exact
  `hospital-MAJOR.MINOR.PATCH` tag. It builds, scans, installs, and packages a
  candidate. It cannot publish a GitHub Release.
- `.github/workflows/publish-release.yml` starts only by manual dispatch. It
  accepts three inputs: the candidate run ID, the maintainer's signature over
  that run's release lock, and the literal publication confirmation. It derives
  the version, attempt and digests from the run and its bytes, promotes only the
  already tested image identities, and publishes without rebuilding.

Approved `linux/amd64` build, runtime, and scanner identities live in the
versioned `release-inputs.json`. Every reference includes its expected name,
version, and immutable SHA-256 digest. Do not update a digest merely to make a
run pass: resolve it for `linux/amd64`, review the upstream identity, commit it,
and let the ordinary quality gate test that reviewed commit. The candidate
workflow rejects a mutable, incorrectly named, or wrong-platform input before
building anything.

Use the manual dispatch on `quality.yml` for a non-publishing source rehearsal.
Its name and summary do not claim to have exercised image promotion, the
offline archive, or release publication.

## Solo-maintainer release procedure

### Where a release lives, and for how long

A release passes through two different storages with two different lifetimes,
and confusing them is the easiest way to invent a deadline that does not exist.

| stage | storage | lifetime |
| --- | --- | --- |
| candidate build output | GitHub Actions artifact | **expires, 14 days** |
| container images | GHCR package | until deleted |
| published release assets | GitHub Release | until deleted |

The candidate artifact is scaffolding between two steps of the maintainer's own
process. **Its 14 days is the window to publish, not the window to distribute.**
Once step 3 promotes the candidate into an immutable GitHub Release, the offline
bundle, deployment archive, manifest, lock and evidence live on that release
with no expiry: download them a month later or a year later and carry them to a
hospital whenever the installation is scheduled.

Nothing in GHCR expires either. Container registries have no retention window;
an image stays until someone deletes it.

So the only real deadline is between building a candidate and publishing it. A
candidate left unpublished for more than 14 days is simply rebuilt — no release
is lost, because an unpublished candidate was never a release.

Publishing promptly is also what keeps Actions storage billing negligible: the
bundle occupies paid artifact storage only for the days between build and
publication, and nothing after. Note that a free GitHub account defaults to a
zero spending limit, which refuses any overage outright rather than charging a
small amount, so raising that limit — not reducing the bundle — is what unblocks
a candidate build that fails on artifact storage.

### 1. Enable Immutable Releases once

Before the first production release, an administrator enables repository-level
Immutable Releases. `scripts/publish-release.mjs` reads that setting with the
maintainer's own GitHub login before every dispatch and refuses while it is
off; the workflow does not use an administrator token to query or change it.
The workflow creates a
run-bound draft (or safely resumes that exact draft after interruption),
uploads an exact asset list without replacement, downloads and compares the
remote assets, publishes the draft, and then requires GitHub to
report the release itself as immutable.

Once a release is published, do not try to replace
its assets or move its tag. Correct any problem in source and issue a new
version.

### 2. Build the candidate

Finish and review the release commit locally, confirm `package.json` has the
intended version, and review every entry in `release-inputs.json`. Before the
tag, measure a representative compressed offline bundle for the exact ten
images. Confirm that GitHub Actions artifact storage and billing can accommodate
one complete bundle plus the deployment archive, evidence, and small metadata
files for the candidate retention window. Splitting the bundle at 1.9 GiB does
not reduce its total storage requirement; the split exists because a single
GitHub Release asset cannot exceed 2 GiB, and the offline bundle has to survive
as release assets to be downloadable long after publication. Also keep enough free runner disk for
the ten loaded images, compressed parts, deployment archive, and security
evidence at the same time. The workflow deliberately records every pre-push
local and portable image identity before pruning the selected Buildx cache and removing that exact
builder container, deletes the Trivy database and scanner image only after scan
evidence is durably uploaded, and removes only local images that are absent
from the verified ten-image set. Never replace those targeted operations with
`docker system prune` or
`docker image prune --all`: either can remove the exact images that must be
bundled.

After the ordinary quality checks and capacity check pass, create and push the
exact release tag. For example:

```powershell
$Version = "1.4.3"
git tag --annotate "hospital-$Version" --message "LOSPOR Hospital $Version"
git push origin "hospital-$Version"
```

Do not move or reuse that tag. If the commit or inputs are wrong, correct the
source and use a new version.

There is one exception, and it is narrow. A candidate that was **never
published** may be re-cut on the same version, because nothing downstream can
have consumed it: a hospital only ever sees a release through a published
GitHub Release, and the `X.Y.Z` image tags are created at publication, not by
`release.yml`. So the exception applies only when both are true — there is no
GitHub Release for the tag, and no `ghcr.io/…-<image>:X.Y.Z` tag exists. Delete
the tag, push the corrected commit, and tag again. The abandoned candidate
becomes unpublishable on its own: `publish-release.yml` binds the candidate
run's `head_sha` to whatever the tag currently points at, and checks it three
times.

Once a release has been published this exception is gone, and re-cutting is not
merely discouraged but refused: an appliance offered the same version with a
different `release.lock` digest stops with "Release X.Y.Z is already installed
with a different release identity" rather than installing it.

Wait for every job in `release.yml` to pass, and note the run ID: the number in
the run's URL. Nothing else needs writing down; the helper reads the version,
attempt and commit from the run.

On the connected review workstation, signed in with `gh auth login` as the
maintainer, prepare the candidate:

```powershell
node .\scripts\publish-release.mjs prepare 12345678901
```

`prepare` refuses a run that did not succeed, was not built from a
`hospital-X.Y.Z` tag by `release.yml`, or whose tag has since moved. It then
downloads that run's candidate into a new directory named
`candidate-<version>-<run>-<attempt>` (it refuses a directory holding anything
else, so files from different runs are never combined), runs the candidate
verifier and the handoff verifier over it, and prints the lock's SHA-256 and the
exact command to sign it. The candidate verifier checks the canonical manifest
and lock, lock sidecar, complete member set, sizes, hashes, and image
identities; the handoff verifier binds the lock to the official repository,
candidate workflow, run ID and attempt, version, tag, and commit. The candidate
is retained only for the workflow's configured period; complete publication
within that window and never reconstruct a missing file.

On the offline signing workstation, sign that exact lock. Keep the private key
off GitHub and do not add it to any environment, repository secret, or Actions
input:

```sh
printf '%s' "$(cat /secure/offline/maintainer.key)" \
  | sh scripts/sign-release-lock.sh lospor-hospital-1.4.3-release.lock
```

Move only the public `lospor-hospital-<version>-release.lock.sig` back into the
candidate directory on the review workstation.

### 3. Publish the reviewed candidate

```powershell
node .\scripts\publish-release.mjs publish 12345678901
```

`publish` reads the run again, checks the lock against its sidecar, requires the
signature to be exactly 64 bytes and to verify over that lock against
`infra/release-signing/release-signing-public.pem`, requires Immutable Releases
to be on, and stops if the version is already published. It shows the version,
commit, run and lock SHA-256, and asks for the literal confirmation
`PUBLISH hospital-<version>`. Only then does it start `publish-release.yml` with
its three inputs: `candidate_run_id`, `release_signature_base64` and
`confirm_publication`. The same three fields can be entered in the GitHub
Actions form by hand. The signature is public; the private key is never entered
anywhere. A rerun of the candidate workflow is a distinct candidate and needs
its own `prepare`.

The publication workflow derives the version from the candidate run's tag, the
attempt from the run, and the lock and signature digests from the downloaded
bytes, and the write job derives them all again and requires them to match. It
stops unless the candidate run succeeded for the exact tag and commit in this
public repository, the confirmation names that version, its handoff and artifact
identity agree, and the dispatch runs from the permitted branch. Before
extracting anything, it verifies the Actions artifact's API-reported ZIP
SHA-256 and accepts only the exact flat candidate member set: ordinary files,
contiguous offline parts, no duplicates, directories, links, traversal,
missing files, or extras.

It also rejects missing, empty, malformed, noncanonical, wrong-length,
digest-mismatched, forged, wrong-key, or altered-lock signatures. The exact
signature digest is part of the resumable/immutable release transaction marker,
so a draft or replay with different signature bytes is refused.

The read-only stage runs the online and registry-independent offline
installation proofs. The write-enabled stage independently rechecks the
candidate provenance and unchanged artifact ID/digest before it promotes final
image tags and creates the release. Publication reuses the tested images and
payload byte for byte; it never rebuilds them.

Watch the complete workflow. Confirm all final image digests, the exact release
asset list, and GitHub's immutable status. Retain the run URL, tag, commit,
candidate identity, lock SHA-256, signature SHA-256, release URL, and timestamp
as the release record.

### The release dossier and GitHub's build attestation

Every release carries a dossier, `release-evidence/release-dossier.json`, inside
its security-evidence archive. The lock covers that archive, so the maintainer's
signature covers the dossier with everything else. It records:

- the release, its commit, and the candidate run and attempt that built it;
- the compatibility rule for updating to it;
- the ten images and their digests;
- the count of critical and high vulnerabilities, and each accepted exception
  with its expiry date;
- the SHA-256 of every vulnerability report and SBOM, and how many components
  each SBOM lists;
- the deployment archive and offline parts;
- the upstream versions it was built from.

The candidate workflow writes the dossier and checks it against the lock and
its own run. Both publication jobs check it against the lock, every evidence
file it names, and the dispatched run. `publish-release.mjs prepare` prints it
for the maintainer. On an appliance, the installer shows it before the guided
installation starts, and preparing an update refuses a release whose dossier
does not match; Status shows it on the **Updates** page for the installed and
the downloaded release.

The candidate workflow also asks GitHub to attest the lock, manifest,
deployment archive, security evidence and offline parts. That record sits
beside the maintainer's signature and never replaces it. The read-only
publication job and `prepare` both require it. Anyone can check a downloaded
file:

```sh
gh attestation verify lospor-hospital-1.4.3-release.lock \
  --repo kaloyandjunow-prog/lospor-hospital \
  --signer-workflow kaloyandjunow-prog/lospor-hospital/.github/workflows/release.yml
```

Attestations are free for public repositories and add a few kilobytes per
release. Releases published before 1.4.0 have neither a dossier nor an
attestation; the installer says so and continues.

### 4. Prepare and carry the installation USB

Use a clean, encrypted USB controlled by the maintainer. Download only the assets of the reviewed
immutable release into a new empty directory. Do not copy an Actions candidate
or a locally reconstructed bundle.

This step is under no time pressure and can be repeated. Release assets do not
expire, so the same verified bundle can be fetched again for a second site, a
reinstall, or a replacement USB months after publication, and every download
verifies against the same lock. Prepare the media when an installation is
actually scheduled rather than stockpiling drives against a deadline that does
not exist.

Before disconnecting the USB:

1. scan the workstation and USB according to the maintainer's endpoint policy;
2. verify the sidecar's exact syntax, recompute the SHA-256 of the release
   lock, and verify the adjacent raw `.sig` against the pinned/reviewed public
   key;
3. from a trusted checkout of the reviewed publication code, run
   `scripts/verify-release.sh <lock> <sidecar> <asset-directory> all` over the
   manifest, deployment archive, security evidence, and every offline part;
4. compare the lock SHA-256 with the separately retained successful-candidate
   and publication records; and
5. record the USB identifier, release version, lock SHA-256, download time, and
   custody transfer.

The maintainer retains physical custody of the USB until installation and
performs the installation on site. If hospital IT must connect or mount the
media, the maintainer remains present and controls the release selection. Do
not use the device for unrelated files. After installation and acceptance,
erase or archive it according to the release-retention policy.

## Automated gate

The repository workflow must pass:

- clean installs for API, Web, PWA, Browser, Status, Core, and exchange
  contract;
- pinned-source and exchange-contract verification;
- typecheck, strict lint, unit tests, and production builds;
- PostgreSQL migrations and all PostgreSQL concurrency tests;
- Status producer/consumer contracts and dependency-free fixture tests;
- safe-runtime-log and no-external-telemetry checks;
- dependency audit at high severity;
- all three resolved Docker Compose models, all application image builds, and
  the exact two-container Status resilience smoke test.

The release Compose contract is checked against `docker compose config
--format json`, not by reading YAML text. It proves that:

- `compose.yaml` gives all ten Hospital release images a controlled build definition;
- `compose.yaml` plus `compose.publish.yaml` retains those builds and adds the
  exact versioned GHCR names;
- `compose.yaml` plus `compose.release.yaml` has those image names and no local
  builds; and
- no model uses `latest`, exposes PostgreSQL, or moves the Status fallback away
  from `127.0.0.1:3443`.

Run the real contract and its destructive negative controls with:

```sh
node scripts/verify-release-compose.mjs
node --test scripts/verify-release-compose.test.mjs
```

The candidate workflow calls the ordinary quality workflow, then runs the full
disposable installation test. It builds ten commit-specific candidates with
the digest-pinned base and source-tarball inputs from `release-inputs.json` and
scans all ten images. The PostgreSQL evidence gate extracts its embedded build
records from the exact candidate, matches them to those inputs, and binds the
provenance hash to the candidate's configuration and ordered root filesystem.
Every Critical and every fixable High vulnerability blocks the candidate. An
unfixed High is allowed only by an exact entry in
`release-risk-exceptions.json` naming the requested release, logical image,
vulnerability, package, meaningful justification, and future expiry date.
Stale, duplicate, inexact, and unused exceptions fail.

Every external GitHub Action in the quality, candidate, and publication
workflows is pinned to a reviewed full commit SHA, with its human-readable
version beside it. A static negative gate rejects a mutable tag or undocumented
pin before a candidate can be produced.

Only after that policy passes are missing run-specific image
candidates pushed. A retried workflow run reuses a candidate only when its
commit, run, and build-input hash match. Every reused or newly built image is
scanned again and bound to the evidence ledger. CI removes its local images,
pulls the registry digests back, tests migrations, and runs a complete clean
appliance from those exact identities. It then creates the deployment archive,
offline parts, evidence, standalone image lock, canonical manifest, release
lock, lock sidecar, and run-bound publication request. The offline archive is
streamed directly from `docker save` through gzip and the part splitter; CI
does not also write an uncompressed image tar. All parts stay in a temporary
directory until their concatenation passes gzip integrity validation. They are
then renamed into `dist` on the same filesystem, and any failed or interrupted
run removes every newly exposed final part. The candidate workflow uploads the
exact completed set and stops. It cannot push final version tags or create a
GitHub Release.

The publication workflow independently verifies the candidate before and
during its write-enabled stage. It resumes only its own exact run-bound draft
(same version, commit, candidate run/attempt, lock SHA-256, tag target, title,
notes, and a byte-identical subset of the approved assets); any other draft or
mutable release is refused. An interrupted upload may leave one or more empty
`starter` asset records; only those exact zero-byte, digest-free records are
deleted by numeric asset ID after the draft identity is verified, then their
approved files are uploaded again. Any partial or ambiguous asset state stops
publication. Assets
are uploaded without wildcards, replacement, or `--clobber`; the complete new
draft is downloaded and compared before publication. An already immutable
release is an idempotent no-op only when its complete asset set is byte-for-byte
identical. Any other existing release stops the run.

Run the supply-chain negative controls with:

```sh
npm run verify:release-inputs
npm run verify:release-workflow
npm run test:release-workflow
npm run test:release-artifacts
```

They cover altered locks, sidecars and payloads; wrong repositories; `latest`;
missing and duplicate images; `linux/arm64`; Docker Hub digest-name
normalisation; oversized parts; unsafe or inexact Actions ZIP members; path
traversal; publication-handoff tampering; Critical/fixable High findings;
missing, malformed, forged, wrong-key, altered-lock and wrong-digest release
signatures; expired or unused exceptions; and restoration of the prior services
when a
failed candidate moved a versioned release tag to a different digest.

## Client verification and installation

A first installation needs no digest, fingerprint, credential, or hand-typed
verification. `losporctl-install.sh` carries the maintainer's release signing
public key inside itself. It verifies the release against the signed release
lock, pins that key, and then starts the guided installer.

### Online

On an Ubuntu 24.04 host that can reach lospor.org, GitHub and ghcr.io:

```sh
curl -fsSLo losporctl-install.sh https://lospor.org/install/losporctl-install.sh
sudo sh losporctl-install.sh
```

Add `--version X.Y.Z` to install a specific release instead of the latest. The
script first confirms that its built-in key matches the fingerprint published at
`https://lospor.org/.well-known/lospor-release-key.txt`, which is served from
Cloudflare rather than GitHub. If lospor.org is unreachable or publishes a
different fingerprint, the script stops before downloading anything. It never
falls back to trusting GitHub alone.

### Offline (USB)

The maintainer copies `losporctl-install.sh` from lospor.org onto a clean
encrypted USB, beside the complete final asset set of one release: manifest,
deployment archive, security evidence, lock, sidecar, raw `release.lock.sig`,
and every ordered offline part. On site:

```sh
sudo sh /media/lospor-usb/losporctl-install.sh
```

The script uses the release files beside it, or those in `--media DIRECTORY`.
Offline, the maintainer's physical custody of the USB is the second channel.
The key fingerprint is printed for the record, and nothing is asked.

### What the script checks before any release code runs

- the raw 64-byte Ed25519 `release.lock.sig` against its built-in key;
- the canonical `release.lock.sha256` sidecar;
- that the lock names exactly this version and exactly one deployment archive,
  whose size and SHA-256 match;
- that every archive entry lies under `lospor-hospital-X.Y.Z/`, with no `.` or
  `..` segment, link or special file;
- that the key shipped inside the release is the key it trusts, before pinning
  it at `/opt/lospor-hospital/secrets/release-signing-public.pem`; and
- every payload against the lock with `verify-release.sh`: all of them offline,
  and the deployment payloads online, where images are later pulled by digest.

It refuses to touch an existing installation. It replaces a bootstrap directory
left by an interrupted attempt, so a retry needs no clean-up.

### When a first installation did not finish

Run the same command again. If the attempt left settings, secrets, an
activation lock, containers, databases or host services, the script lists them,
changes nothing, and offers two ways on:

```sh
sudo sh losporctl-install.sh --resume
sudo sh losporctl-install.sh --discard-unfinished
```

`--resume` continues with the attempt's settings and databases: the guided
installer does not ask for the site settings again, and the release's own
recovery clears the lock an unfinished activation leaves. It refuses an attempt
that stopped while creating its secrets, since its databases could not be
opened. `--discard-unfinished` removes what the attempt left (containers,
volumes, LOSPOR's services, the console command and everything under
`/opt/lospor-hospital` except the verified downloads) after you type DISCARD, or
with `--yes`. Neither runs while another installation is running, and neither
ever touches an installed appliance.

### Where the script comes from

A VM built with the Hyper-V kit carries the script from the release folder the
kit came in, at `/usr/local/lib/lospor/losporctl-install.sh`, checked there
against the SHA-256 of the copy the kit read. Nothing is downloaded and run, so
trust begins with the one download of the release folder.

Fetched by hand instead, the script comes over HTTPS before anything verifies
it, the same model as most vendor installers. It is short enough to read, and
its SHA-256 is published at
`https://lospor.org/install/losporctl-install.sh.sha256` for anyone who wants to
check it by hand. Checking is optional.

### Release gate on Hyper-V

Before publishing, the maintainer runs `scripts/hyperv-install-gate.ps1` on a
Hyper-V host (elevated). It builds a VM with the kit exactly as a hospital
would, checks over SSH that the key works without a console login, the
one-time password is not expired, the carried installer matches byte for byte,
Docker and the host services run and no installation media are left, and with
`-ReleaseMedia` installs the candidate offline and requires `losporctl check`
to pass. Every step is timed; `-EvidencePath` writes the result, and the VM is
removed unless `-Keep` is given.

```powershell
.\scripts\hyperv-install-gate.ps1 -IsoPath D:\iso\ubuntu-24.04.5-live-server-amd64.iso -SshKeyPath $HOME\.ssh\lospor_gate -ReleaseMedia D:\media\lospor-hospital-1.4.3 -EvidencePath .\gate.json
```

**Every launcher on this page runs as root.** An installation ends by writing
and starting the appliance's systemd units, and `install-update-agent.sh` and
`install-host-observability.sh` both refuse outright to run as anyone else.

### The guided installer

Once the key is pinned, the guided installer verifies the lock's signature
itself and asks no digest. It asks where the images should come from. The
default is whichever the release files support: offline when every image part
the lock names is present, connected otherwise. It never chooses silently, and
it fails closed rather than falling back: choosing offline without the parts
stops the install. Set `HOSPITAL_INSTALL_SUPPLY_MODE` to `connected` or
`offline` to answer non-interactively.

Unless `HOSPITAL_UPDATE_SUPPLY_MODE` is explicitly set, the guided installer
uses the same mode for future updates before it runs readiness. An offline
first install therefore needs no network access merely to finish. Set the update
variable separately when, for example, installing from USB now but using
connected updates later.

The launchers can also be run directly from the verified bootstrap directory,
which is what the guided installer does last and what any non-interactive
install should use:

```sh
sudo sh /opt/lospor-hospital/bootstrap-X.Y.Z/lospor-hospital-X.Y.Z/scripts/run-online-release.sh \
  "$LOCK" "$SIDECAR" "$MEDIA"
sudo sh /opt/lospor-hospital/bootstrap-X.Y.Z/lospor-hospital-X.Y.Z/scripts/load-offline.sh \
  "$LOCK" "$SIDECAR" "$MEDIA"
```

For every later update, do not extract the new deployment archive manually.
Use the launcher from the active, previously verified installation; it verifies
and stages the new deployment itself. With `VERSION`, `MEDIA`, `LOCK`, and
`SIDECAR` set for the new release, run exactly one of:

```sh
sudo sh /opt/lospor-hospital/current/scripts/run-online-release.sh \
  "$LOCK" "$SIDECAR" "$MEDIA"
sudo sh /opt/lospor-hospital/current/scripts/load-offline.sh \
  "$LOCK" "$SIDECAR" "$MEDIA"
```

The first command is the online alternative and downloads anonymously from the
public release without a Docker login. It verifies the deployment payload it uses; keeping the complete asset
set on the controlled media preserves one consistent handoff. The second is the
offline alternative, sets `HOSPITAL_UPDATE_SUPPLY_MODE=offline`, needs no
network access, and strictly requires that complete final asset set. Do
not run both for one installation attempt.

Both launchers verify the lock sidecar and the selected payloads before they
touch the running installation, then verify the portable configuration,
root-filesystem and `linux/amd64` platform identities. They extract the candidate into a fresh, versioned
directory, link the hospital's site configuration, secrets, backups, and
runtime data, and invoke that candidate's own installer/updater. Only a
successful run atomically changes the installed-release state. Downgrades and a
different lock digest for the same version are rejected.

The one-time verification authorization is never written to `.env`; only the
non-secret release version, path, and lock digest persist for fresh-shell
operator commands. The release Compose overlay uses `pull_policy: never`, so
Docker cannot silently replace a verified image while starting the appliance.

The fast Status test is:

```sh
./scripts/test-status-dev.sh
```

It runs the real Status image against a synthetic fixture in exactly two
persistent containers. It is a development contract/resilience check, not a
substitute for the actual appliance drill.

Before release, run the full disposable appliance test on a clean host:

```sh
sh ./scripts/test-install.sh
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
5. Enable the appliance-wide clinical-delivery policy. Verify every eligible
   finalized case is queued automatically while drafts and incomplete cases
   remain local.
6. Interrupt an upload, restart the worker, and confirm the same batch resumes
   without a second publication.
7. Receive and verify Central's signed receipt. Confirm the local checkpoint
   advances only after receipt verification.
8. Replay the accepted batch and confirm Central returns the prior result
   without duplicate OMOP rows.
9. Submit a withdrawal, verify its signed receipt and local state, then resend
   and verify a new accepted UPSERT.
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
- altered manifest, ciphertext, release lock, lock sidecar, receipt, or chunk
  checksum;
- missing Central connectivity;
- full disk and unavailable backup destination;
- clinical API and PostgreSQL unavailable together;
- Caddy unavailable while the loopback Status fallback remains reachable;
- missing/stale backup and delivery-worker signals;
- Status restart with its SQLite volume preserved;
- unsupported exchange version and out-of-order sequence;
- a release whose `release.lock.sig` was made by a different key;
- a release whose `release.lock` was altered after signing; and
- a release offering a signing key other than the one the appliance pinned,
  against both `install.sh` and `update.sh`.

Do not tag a release when any required test is skipped.
