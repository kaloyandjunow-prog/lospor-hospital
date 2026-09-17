# Updates and compatibility

[Български](updates-compatibility.bg.md) | **English**

## How a site gets a release

**Releases that still exist.** On 15 September 2026, before the first 1.4.0
runs, releases 1.0.0 to 1.3.2 were withdrawn: their GitHub Releases and GHCR
images were deleted, and their git tags were kept as history. 1.3.3 remains, as
the last working release before 1.4.0. 1.4.0 installs fresh; no hospital runs an
earlier version, so there is no upgrade path from 1.3.x.

Hospital images are built once as a CI candidate from an exact
`hospital-MAJOR.MINOR.PATCH` tag. The maintainer reviews its run-bound
publication request and release-lock SHA-256, then manually dispatches
publication with the offline-produced raw Ed25519 signature and its separately
recorded SHA-256. Publication verifies the signature twice, then promotes the
already tested image identities without
rebuilding them. All ten release images are built and scanned under LOSPOR's
public GHCR namespace, then recorded in the release lock. A client does not
compile them and never uses `latest`.

The repository, GitHub Releases, and GHCR packages are public; visibility is
not part of the trust model. The
maintainer account uses MFA, publication requires separate version-bound
publication and Immutable-Releases confirmations, and the resulting GitHub
Release must be immutable. SHA-256 and image-digest checks detect changes
relative to the published and separately recorded values, but on their own they
are not proof of who published those values: if the GitHub repository/account or
USB custody chain were compromised and all compared records replaced
consistently, those checks could not detect the substitution.

A release is therefore also signed with an Ed25519 key the maintainer holds off
GitHub, and a site pins that key once at installation. A compromise of GitHub
alone then cannot produce a release the appliance accepts, and an appliance can
authenticate an update without a person first being read a digest over the
phone -- which is what makes unattended download safe. A site that has not
pinned the key keeps verifying each release against the digest it is given,
exactly as before. See [Release validation](release-validation.md) for key
handling and rotation.

An existing release is immutable. Changes to Web, PWA, Browser, API, Core,
clinical logic, migrations, or bundled reference data require a new version,
new candidate build, and new manual publication transaction. An installed
hospital never pulls source code from Git. Site configuration, credentials,
runtime data, and patient data remain in persistent appliance storage and are
not replaced by an image update.

For an online update, prepare one exact immutable GitHub Release. Use
**Download and verify** on the authenticated Status release page, or use the
host-only command when the installation deliberately runs in console-only
mode:

```sh
sudo sh /opt/lospor-hospital/current/scripts/prepare-verified-release.sh 1.4.0 -
```

The root-owned preparer accepts only the semantic version and an optional fixed-
shape request id. It chooses the repository, tag, asset names, paths and
verification commands itself. The release metadata and assets are
read anonymously from the public GitHub release, and images are pulled
anonymously into a throwaway Docker configuration that is deleted on every exit
path. The appliance stores no GitHub or registry credential. Do not run
`docker login` by hand.

Preparation refuses a draft, prerelease, mutable release, wrong tag or commit,
wrong publication marker, missing/extra/duplicate asset, mismatched GitHub asset
size/digest, unsafe redirect, invalid lock sidecar, missing/bad Ed25519
signature, undeclared migration boundary, unsupported rollback policy, or OCI
identity mismatch. It then pulls exact registry digests and verifies the
selected `linux/amd64` manifest, image configuration digest, and ordered root-
filesystem diff IDs. Only after every check succeeds does it atomically publish
a root-owned prepared-release descriptor. Running services are not touched.

### Knowing that an update exists

A connected site can ask the registry what has been published:

```sh
sudo sh /opt/lospor-hospital/current/scripts/check-for-update.sh
```

This only reads. It pulls nothing, changes nothing, and records the answer in
`.data/update-status.tsv` for later inspection. Exit status 0 means the question
was answered — whether or not an update exists. Exit status 1 means it could not
be answered, and the recorded state is then `unknown`, never `current`: an
appliance must never report itself up to date because its network was down.

Running it from `cron` or a systemd timer is safe, because it cannot change what
is installed.

### Downloading without applying

Pulling several gigabytes and restarting the appliance are two different events
and do not have to happen together. Preparation performs the download and the
full identity verification, then stops:

```sh
sudo sh /opt/lospor-hospital/current/scripts/prepare-verified-release.sh 1.4.0 -
```

Nothing that is running is touched. Afterwards, apply only the exact descriptor
that preparation wrote:

```sh
sudo sh /opt/lospor-hospital/current/scripts/apply-prepared-release.sh 1.4.0 -
```

The apply command revalidates the descriptor, the installed identity it was
prepared from, capacity, current and candidate images, and activation locks.
It cannot be given a caller-selected lock, directory, digest, repository, tag,
Compose file, or command.

This is the recommended shape for a working hospital: fetch overnight, apply in a
chosen gap between lists.

### Why downloading the lock from GitHub is safe

The `.sha256` sidecar still detects accidental corruption, but it is not the
trust boundary: an attacker controlling GitHub could replace both a lock and its
digest consistently. The pinned Ed25519 public key is the independent trust
anchor. Its private key is held outside GitHub and Actions, and preparation
requires a valid raw signature over the exact lock. It also binds the immutable
GitHub Release metadata to the reviewed publication run, attempt, commit, lock
SHA-256, signature SHA-256 and exact final asset set. A GitHub-only compromise
therefore cannot create an acceptable update.

## Sites with no registry access

A hospital network may install and update without internet or registry access.
Place the complete final release asset set in one directory: manifest,
deployment archive, security-evidence archive, release lock, canonical
`.sha256` sidecar, raw 64-byte `.sig`, and every ordered offline part. For an
existing installation,
run:

```sh
sudo sh /opt/lospor-hospital/current/scripts/load-offline.sh \
  /media/lospor-1.4.0/lospor-hospital-1.4.0-release.lock \
  /media/lospor-1.4.0/lospor-hospital-1.4.0-release.lock.sha256 \
  /media/lospor-1.4.0
```

A first installation has no trusted `current` launcher yet. Use
[`losporctl-install.sh`](release-validation.md#client-verification-and-installation):
it verifies the signed lock and the deployment archive, extracts it into a new
bootstrap directory bound to the appliance home, pins the key, and hands over to
the guided installer. Do not execute a launcher directly from an unverified
archive or pass a custom install command.

Both launchers verify and stage the checksum-covered deployment archive, then
invoke that candidate kit's own installer or updater. This prevents an older
installed Compose file or script from driving a newer set of images. Only
successful activation updates the non-secret installed release
path/version/lock state; downgrades and same-version lock changes fail before
backup or migration.

Every release declares one of two rollback policies. `service-compatible` is
accepted only with signed, hash-bound evidence that the exact old application
has passed the exact new schema for the declared window. `backup-required`
means that a failure after database mutation cannot be recovered by guessing
that the old services are compatible; activation retains its lock and requires
the authenticated, verified pre-update backup and a technician. Release 1.3.0
is deliberately `backup-required` because no executed old-app/new-schema proof
exists for it. Never add reverse SQL or mark a release `service-compatible`
without the required evidence artifact.

The candidate workflow splits the compressed archive into parts no larger than
1.9 GiB. Actions stores the large candidate once; both publication stages
independently download and verify that same artifact, and no second
multi-gigabyte Actions artifact is uploaded. The standalone image lock and
`publication-request.tsv` are candidate-only provenance inputs and are absent
from the final release assets. The candidate is deliberately unsigned; the
manual publication transaction adds the verified raw signature to the exact
final asset allowlist.

The offline launcher validates the exact lock-sidecar syntax, every part's size
and SHA-256, the complete gzip stream, and the portable identity and platform
of all ten loaded images before the update starts. The sidecar detects corruption, but an
attacker able to replace both it and the lock can create a matching pair.

For a hand-carried update, the maintainer downloads assets only from the
reviewed immutable GitHub Release onto a clean encrypted USB, verifies
the bundle, records its lock SHA-256, and retains physical custody through the
on-site installation. Do not combine assets from different releases or use the
device for unrelated files. See [Hospital release
validation](release-validation.md#solo-maintainer-release-procedure) for the
complete candidate, publication, USB, and installation procedure.

## Building from source

Omitting `compose.release.yaml` builds from the vendored source. That is the
development path. `update.sh` detects the resolved Compose model. A release
model fails closed unless an integrity-verifying launcher passes its ephemeral
verification state, and every release service uses `pull_policy: never` so
Compose cannot silently replace a verified image while starting the appliance.

The Hospital PostgreSQL image remains Debian Bookworm/glibc compatible with
volumes created by `postgres:17.6-bookworm`, but builds PostgreSQL 17.11 plus
`pg_trgm` and `pgcrypto` from a checksummed upstream tarball. Its zlib 1.3.2 and ACL 2.4.0
runtime libraries are likewise source-built, while LDAP, libxml, UUID,
readline/ncurses and unused package tooling are absent. CI opens an exact 17.6
`en_US.utf8` data volume in the production image, compares collation metadata,
ordering and indexed lookup semantics, and separately proves custom-format
backup/restore and all migrations.

The 17.11 patch update opens an existing version-17 data directory in place;
it requires neither dump/restore nor `pg_upgrade`. Before migrations, the
appliance rejects logical-decoding slots and custom output plugins (Hospital
does not use either), so migrations cannot emit WAL in that unsupported state.
After migrations, it follows PostgreSQL's documented remediation by running
`ANALYZE` on every
persistent user table with a GIN index, then fails closed if the refreshed
`pg_class.reltuples` estimates remain non-finite or negative. A restore
runs the cluster-level preflight before it replaces the database, then applies
the same migration/postflight order; a first installation does likewise.

## What update.sh does, in order

1. takes and verifies a database backup;
2. verifies all ten loaded image identities for a release, or builds the
   vendored source in development mode;
3. installs runtime secrets;
4. starts PostgreSQL, waits for it to become ready, and rejects unsupported
   logical-decoding slots or custom output plugins;
5. applies forward database migrations;
6. repairs and verifies GIN-table statistics with `ANALYZE`;
7. creates or updates the restricted Status database-probe role;
8. starts Status independently;
9. verifies that the clinical and Status credential generations agree; and
10. starts the remaining services and runs health checks.

The first update from a release without Status requires an explicit choice of
an existing active clinical `ADMIN` as the appliance operator. `update.sh`
prompts when both credential stores are still uninitialized. It never selects
an administrator silently. Later updates fail closed if a credential
transaction is pending or the generations disagree; inspect safe state with:

```sh
sudo sh /opt/lospor-hospital/current/scripts/appliance-operator.sh state
```

Database migrations are backward-compatible only when the release's signed
compatibility evidence proves that exact claim. Never roll a schema backward
with ad hoc SQL. For a `backup-required` release, restore the authenticated
backup taken before mutation with the supported emergency restore workflow.

## Exchange compatibility

The exchange manifest is explicitly versioned. Central advertises supported
versions and Hospital refuses an incompatible enrollment. Once a second
manifest version exists, Central should retain the previous production version
for at least 24 months or for the contractual hospital upgrade window,
whichever is longer. This is a support policy, not permission for silent data
conversion.

## Applying an update from the status page

An appliance on a hospital LAN is often unreachable by SSH, and the person who
notices an update is available is rarely the person with a console. So the
status page can ask for one, and a host agent applies it.

The split matters. Status runs unprivileged, has no Docker socket, and mounts
the agent's state read-only — it physically cannot apply a release, which is
what makes a control reachable from a browser safe to offer. It writes a request
into a directory on the host; the agent reads it and decides.

Install and verify the canonical systemd agent:

```sh
sudo sh /opt/lospor-hospital/current/scripts/install-update-agent.sh
```

If a site deliberately chooses host-console updates, record that truthful mode
instead:

```sh
sudo sh /opt/lospor-hospital/current/scripts/install-update-agent.sh --console-only
```

The installer writes an allowlisted, root-only environment file, verifies the
unit, enables it, waits for a fresh heartbeat, and writes a non-secret mode
marker. `doctor.sh` then treats an enabled, active, fresh canonical agent as
healthy, a deliberate console-only marker as healthy, and a configured but
missing/stale agent as a failure. Status never silently offers browser controls
when the host truth is absent.

### What an operator sees

`/status/release` names what is installed, what is published, and the exact
signed release that is prepared. Downloading is one press, because it changes
nothing that is running. Applying is two: the first acts on nothing at all and
renders a confirmation that says plainly that the clinical services will
restart and, for `backup-required`, that failure after migration needs verified-
backup recovery by a technician.

Outside the maintenance window the request is **queued**, not refused, and the
page names the time it will run. Applying immediately is a separate control with
its own press, so bypassing the window is always a deliberate act.

### What the agent refuses

- A malformed, linked, multiply-linked, oversized, stale or replayed request.
  The browser may provide only an action, random request id, semantic version,
  creation time and maintenance-window intent; it cannot provide a path, URL,
  digest or command.
- A request that was prepared from a different installed identity, or Apply for
  anything other than the exact root-owned prepared descriptor.
- Apply from a console-recovery Status session. Recovery may prepare an update,
  but it cannot restart clinical services.
- Anything at all while `release-activation.lock` exists. The lock means either
  an apply is running or a rollback did not finish, and only a person can tell
  which, so the agent stops and says so. **It never removes the lock.**
- Work that conflicts with backup, restore, terminology import, another prepare,
  insufficient Docker/data/backup capacity, or an invalid/backward clock.

A failed apply is terminal. One request, one attempt: an agent that retried
across a reboot would turn one operator's intent into two attempts on a clinical
database.

Accepted requests, transitions and terminal results are durable. A scheduled
request survives restart until its next real opening in the configured IANA
timezone, including daylight-saving changes. A restart during safe preparation
may resume the exact in-flight request; a restart after Apply became ambiguous
always stops in `NEEDS_OPERATOR` and never retries the database mutation.

### Inspecting an interrupted activation

Never delete `.data/release-activation.lock` manually. First perform a read-only,
bilingual inspection:

```sh
sudo sh /opt/lospor-hospital/current/scripts/recover-release-activation.sh inspect
```

The recovery tool validates the fixed journal, the original boot/process
identity, old/candidate roots and lock hashes, rollback policy, and recorded pre-
update backup. `resume-rollback --confirm` is available only for a proved
`service-compatible` release. For `backup-required`, complete the authenticated
emergency restore of the exact recorded backup; `verify-and-clear
--confirm-clear` then requires the root-only completed restore proof, current
release identity, image verification and `doctor.sh` before it archives the
journal and clears only the known lock objects.

### If the agent stops

Its own row on the status page degrades after ten minutes without a heartbeat.
Without that, a stopped agent would be invisible until the update check went
stale at fourteen days, which is far too slow to notice that the thing applying
security fixes is not running.
