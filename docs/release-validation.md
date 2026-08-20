# Hospital release validation

A Hospital release is acceptable only after the automated quality workflow and
this Linux appliance drill both pass. The serverless demonstration is not part
of the drill.

## What is shipped

Hospital `1.0.0` is built once for `linux/amd64`. Its ten Hospital images are
API, Web, PWA, Browser, Status, migrator, tools, PostgreSQL, Caddy, and the curl
delivery worker. Each is built as a run-specific candidate from the approved
digest-pinned bases; PostgreSQL, Caddy, and curl are hardened Hospital images,
not unmodified third-party release payloads. `Core` is compiled into the
applications; it is not another container.

Every private GitHub Release contains:

- `lospor-hospital-<version>-deployment.tar.gz`;
- one or more ordered `images.tar.gz.part-NNN` files, each no larger than
  1.9 GiB;
- the audit-oriented JSON manifest;
- the canonical line-oriented `lospor-hospital-<version>-release.lock` and its
  `.sha256` sidecar; and
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

The line-oriented format lets a hospital verify a release with `sha256sum` and
ordinary Ubuntu tools. Node.js, npm, Git, Prisma, `jq`, and database clients are
not host prerequisites.

## Distribution trust and GitHub setup

The trust chain is:

1. a private GitHub repository and private GHCR packages;
2. the maintainer's GitHub account protected by MFA;
3. an exact tag-triggered candidate build and automated gates;
4. a separate manual publication run bound to the reviewed candidate run,
   attempt, version, and release-lock SHA-256;
5. repository-level Immutable Releases;
6. the maintainer's physical custody of the USB and on-site installation; and
7. an Ed25519 signature over `release.lock`, made off GitHub, checked against a
   key the site pinned once.

The first six provide strong provenance within the GitHub account and strong
integrity checks within the delivered bundle. Only the seventh is independent of
GitHub, and its independence rests entirely on where the key is kept.

Require MFA for the maintainer account, protect its recovery methods, review
active sessions and access tokens, and keep write access limited to the
maintainer. Keep all ten LOSPOR GHCR packages private. Give each connected
hospital a separate revocable, read-only registry credential. The offline
route needs no registry or internet access.

### The release signing key

The key is Ed25519, generated and held by the maintainer, and **it is never
given to GitHub Actions**. That is the whole point of it. A key a workflow can
use lives in the same trust domain as the registry that workflow pushes to:
whoever can publish images can then sign for them, and the signature proves
nothing that the registry did not already assert. `release-workflow-contract-lib.mjs`
enforces this by refusing any release workflow that so much as mentions
signatures, release keys or a trust root, so the arrangement cannot be quietly
undone later by adding a convenient secret.

So signing is a local step:

    printf '%s' "$(cat /path/to/maintainer.key)" | ./scripts/sign-release-lock.sh release.lock

The key is read from standard input and never from a path argument, so it does
not appear in the process table or the shell history. The script verifies its own
output before exiting; a signature it cannot itself check is not written.

The resulting `release.lock.sig` travels as an ordinary release asset. Nothing in
the publication workflow knows what it is — the asset list is enumerated
generically — and Immutable Releases means it must be present in the candidate
bundle before publication, not uploaded afterwards.

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
  accepts the selected candidate run identity, independently checked lock
  hash, and literal publication confirmation. It promotes only the already
  tested image identities and publishes without rebuilding.

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
Immutable Releases. Immediately before every publication dispatch, the
maintainer visually checks that repository setting and supplies the
version-bound confirmation required by the workflow. Both publication jobs
independently check the literal confirmation; the workflow does not use an
administrator token to query or change the repository setting. It creates a
run-bound draft (or safely resumes that exact draft after interruption),
uploads an exact asset list without replacement, downloads and compares the
remote assets, publishes the draft, and then requires GitHub to
report the release itself as immutable.

Once a release is public within the private repository, do not try to replace
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
$Version = "1.0.0"
git tag --annotate "hospital-$Version" --message "LOSPOR Hospital $Version"
git push origin "hospital-$Version"
```

Do not move or reuse that tag. If the commit or inputs are wrong, correct the
source and use a new version. Wait for every job in `release.yml` to pass, then
record outside the downloaded candidate:

- candidate run ID and run attempt;
- the full 40-character commit;
- version and tag; and
- the 64-character release-lock SHA-256 printed by the successful run.

Download only that run's candidate artifact into a new empty directory. Do not
combine files from different runs or attempts:

```powershell
$Version = "1.0.0"
$Repository = "kaloyandjunow-prog/lospor-hospital"
$CandidateRunId = "12345678901"
$CandidateRunAttempt = "1"
$Commit = "0123456789abcdef0123456789abcdef01234567"
$ExpectedLockSha256 = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
$ArtifactName = "hospital-$Version-$CandidateRunId-$CandidateRunAttempt-candidate"
$CandidateDirectory = Join-Path (Get-Location) "candidate-$Version-$CandidateRunId-$CandidateRunAttempt"

New-Item -ItemType Directory -Path $CandidateDirectory -ErrorAction Stop
gh run download $CandidateRunId --repo $Repository --name $ArtifactName `
  --dir $CandidateDirectory
```

Replace every example value with the candidate summary and reviewed tag. The
candidate is retained only for the workflow's configured period. Complete the
review and publication within that window; never reconstruct a missing file or
mix in one from another run.

On the connected review workstation, verify the candidate against the commit
and run identity recorded independently. The candidate verifier checks the
canonical manifest and lock, lock sidecar, complete member set, sizes, hashes,
and image identities. The handoff verifier binds the lock to the official
repository, candidate workflow, run ID/attempt, version, tag, and commit. Also
compare the actual lock hash with the value recorded from the successful
Actions run.

```powershell
node .\scripts\verify-release-candidate.mjs `
  $Version $CandidateDirectory candidate-assets $Commit
node .\scripts\verify-release-handoff.mjs `
  "$CandidateDirectory\lospor-hospital-$Version-publication-request.tsv" `
  "$CandidateDirectory\lospor-hospital-$Version-release.lock" `
  $Version $Commit $CandidateRunId $CandidateRunAttempt
```

### 3. Publish the reviewed candidate manually

Dispatch publication only while signed in to the private repository with the
maintainer account and MFA. Supply the exact recorded values and the literal
confirmation required by the workflow:

```powershell
$Repository = "kaloyandjunow-prog/lospor-hospital"
$Version = "1.0.0"
$CandidateRunId = "12345678901"
$CandidateRunAttempt = "1"
$ExpectedLockSha256 = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"

gh workflow run publish-release.yml --repo $Repository --ref main `
  -f "candidate_run_id=$CandidateRunId" `
  -f "candidate_run_attempt=$CandidateRunAttempt" `
  -f "version=$Version" `
  -f "expected_lock_sha256=$ExpectedLockSha256" `
  -f "confirm_publication=PUBLISH hospital-$Version" `
  -f "confirm_immutable_releases=IMMUTABLE RELEASES ENABLED hospital-$Version"
```

The same six fields can be entered in the GitHub Actions form:
`candidate_run_id`, `candidate_run_attempt`, `version`,
`expected_lock_sha256`, `confirm_publication`, and
`confirm_immutable_releases`. Enter the last value only after visually checking
that Immutable Releases is enabled for the repository. Select only the
candidate run and attempt already reviewed. A rerun is a distinct candidate
and requires a new review and manual decision.

The publication workflow stops unless the candidate run succeeded for the
exact tag and commit, its handoff and artifact identity agree, the lock has the
expected SHA-256, and the dispatch runs from the permitted branch. Before
extracting anything, it verifies the Actions artifact's API-reported ZIP
SHA-256 and accepts only the exact flat candidate member set: ordinary files,
contiguous offline parts, no duplicates, directories, links, traversal,
missing files, or extras.

The read-only stage runs the online and registry-independent offline
installation proofs. The write-enabled stage independently rechecks the
candidate provenance and unchanged artifact ID/digest before it promotes final
image tags and creates the release. Publication reuses the tested images and
payload byte for byte; it never rebuilds them.

Watch the complete workflow. Confirm all final image digests, the exact release
asset list, and GitHub's immutable status. Retain the run URL, tag, commit,
candidate identity, lock SHA-256, release URL, and timestamp as the release
record.

### 4. Prepare and carry the installation USB

Use a clean, encrypted USB controlled by the maintainer. From an authenticated
session in the private repository, download only the assets of the reviewed
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
2. verify the sidecar's exact syntax and recompute the SHA-256 of the release
   lock;
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

Only after that policy passes are missing private, run-specific image
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
expired or unused exceptions; and restoration of the prior services when a
failed candidate moved a versioned release tag to a different digest.

## Client verification and installation

The final release does not contain a separate unarchived launcher. On a first
installation, verify the lock against the SHA-256 retained separately from the
successful candidate/publication record, verify the deployment archive from
that lock, and only then extract its launcher into a new persistent bootstrap
directory. The following is an executable Ubuntu example; replace the version,
media path, and expected hash, and run it as the appliance service account:

```sh
set -eu
export LC_ALL=C

VERSION=1.0.0
MEDIA=/media/lospor-1.0.0
EXPECTED_LOCK_SHA256=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef
APPLIANCE_HOME=/opt/lospor-hospital

LOCK="$MEDIA/lospor-hospital-$VERSION-release.lock"
SIDECAR="$LOCK.sha256"
LOCK_NAME="$(basename "$LOCK")"
DEPLOYMENT_NAME="lospor-hospital-$VERSION-deployment.tar.gz"
DEPLOYMENT="$MEDIA/$DEPLOYMENT_NAME"

test "$(sha256sum "$LOCK" | awk '{print $1}')" = "$EXPECTED_LOCK_SHA256"
printf '%s  %s\n' "$EXPECTED_LOCK_SHA256" "$LOCK_NAME" | cmp - "$SIDECAR"

DEPLOYMENT_RECORD="$(awk -F '\t' -v file="$DEPLOYMENT_NAME" '
  $1 == "artifact" && $2 == "deployment" && $4 == file {
    count += 1; bytes = $5; digest = $6
  }
  END { if (count != 1) exit 1; print bytes, digest }
' "$LOCK")"
printf '%s\n' "$DEPLOYMENT_RECORD" \
  | grep -Eq '^[1-9][0-9]* [a-f0-9]{64}$'
set -- $DEPLOYMENT_RECORD
test "$(wc -c < "$DEPLOYMENT" | tr -d '[:space:]')" = "$1"
test "$(sha256sum "$DEPLOYMENT" | awk '{print $1}')" = "$2"

PREFIX="lospor-hospital-$VERSION/"
tar -tzf "$DEPLOYMENT" | awk -v prefix="$PREFIX" '
  index($0, prefix) != 1 { bad = 1 }
  $0 ~ /(^|\/)\.\.?($|\/)/ { bad = 1 }
  END { exit bad }
'
tar -tvzf "$DEPLOYMENT" \
  | awk 'substr($0, 1, 1) != "-" && substr($0, 1, 1) != "d" { bad = 1 }
         END { exit bad }'

sudo install -d -m 0750 -o "$(id -un)" -g "$(id -gn)" "$APPLIANCE_HOME"
test ! -e "$APPLIANCE_HOME/current"
test ! -e "$APPLIANCE_HOME/.data/installed-release.tsv"
BOOTSTRAP_PARENT="$APPLIANCE_HOME/bootstrap-$VERSION"
test ! -e "$BOOTSTRAP_PARENT"
mkdir -m 0700 "$BOOTSTRAP_PARENT"
tar -xzf "$DEPLOYMENT" --no-same-owner --no-same-permissions \
  -C "$BOOTSTRAP_PARENT"
BOOTSTRAP_ROOT="$BOOTSTRAP_PARENT/lospor-hospital-$VERSION"
test -f "$BOOTSTRAP_ROOT/scripts/verify-release.sh"
test ! -e "$BOOTSTRAP_ROOT/.lospor-home"
ln -s "$APPLIANCE_HOME" "$BOOTSTRAP_ROOT/.lospor-home"

sh "$BOOTSTRAP_ROOT/scripts/verify-release.sh" \
  "$LOCK" "$SIDECAR" "$MEDIA" all
```

The final asset directory in `MEDIA` must be complete: manifest, deployment
archive, security-evidence archive, release lock, sidecar, and every ordered
offline part. The `all` check rechecks every checksum-covered payload with the
launcher whose deployment archive was just verified. It deliberately does not
require the candidate-only image lock or `publication-request.tsv`.

For an online first installation, authenticate the hospital's read-only GHCR
credential and run the guided installer:

```sh
printf '%s' "$HOSPITAL_GHCR_READ_TOKEN" \
  | docker login ghcr.io --username "$HOSPITAL_GHCR_USER" --password-stdin
sh "$BOOTSTRAP_ROOT/scripts/install-guided.sh" \
  "$LOCK" "$SIDECAR" "$MEDIA"
```

It asks for the release lock digest you were sent separately, compares it, and
stops if it differs; then collects the site and administrator details, shows
the full readiness report, and runs the same launcher below. It is a front end
only: every check still belongs to the scripts it calls, and no failure it
reports can be continued past. Where `whiptail` is unavailable it falls back to
plain prompts rather than requiring anything to be installed on the host.

The launcher can also be run directly, which is what the guided installer does
last and what any non-interactive install should use:

```sh
sh "$BOOTSTRAP_ROOT/scripts/run-online-release.sh" \
  "$LOCK" "$SIDECAR" "$MEDIA"
```

For a registry-independent first installation, use the same complete final
asset directory and verified bootstrap root:

```sh
sh "$BOOTSTRAP_ROOT/scripts/load-offline.sh" \
  "$LOCK" "$SIDECAR" "$MEDIA"
```

For every later update, do not extract the new deployment archive manually.
Use the launcher from the active, previously verified installation; it verifies
and stages the new deployment itself. With `VERSION`, `MEDIA`, `LOCK`, and
`SIDECAR` set for the new release, run exactly one of:

```sh
sh /opt/lospor-hospital/current/scripts/run-online-release.sh \
  "$LOCK" "$SIDECAR" "$MEDIA"
sh /opt/lospor-hospital/current/scripts/load-offline.sh \
  "$LOCK" "$SIDECAR" "$MEDIA"
```

The first command is the online alternative and still requires the read-only
GHCR login. It verifies the deployment payload it uses; keeping the complete
asset set on the controlled media preserves one consistent handoff. The second
is the offline alternative and strictly requires that complete final asset set.
Do not run both for one installation attempt.

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
