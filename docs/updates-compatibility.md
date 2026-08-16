# Updates and compatibility

## How a site gets a release

Hospital images are built once as a CI candidate from an exact
`hospital-MAJOR.MINOR.PATCH` tag. The maintainer reviews its run-bound
publication request and release-lock SHA-256, then manually dispatches
publication. Publication promotes the already tested image identities without
rebuilding them. All ten release images are built and scanned under LOSPOR's
private GHCR namespace, then recorded in the release lock. A client does not
compile them and never uses `latest`.

The repository, GitHub Releases, and GHCR packages remain private. The
maintainer account uses MFA, publication requires separate version-bound
publication and Immutable-Releases confirmations, and the resulting GitHub
Release must be immutable. There is no software-release key. SHA-256 and
image-digest checks detect changes relative to the published and separately
recorded values, but they are not independent proof of who published those
values. If the GitHub repository/account or USB custody chain is compromised
and all compared records are replaced consistently, the hospital verifier
cannot detect the publisher substitution.

An existing release is immutable. Changes to Web, PWA, Browser, API, Core,
clinical logic, migrations, or bundled reference data require a new version,
new candidate build, and new manual publication transaction. An installed
hospital never pulls source code from Git. Site configuration, credentials,
runtime data, and patient data remain in persistent appliance storage and are
not replaced by an image update.

For an online update, the launcher authenticates to private GHCR using that
hospital's separate revocable read-only credential:

```sh
sh /opt/lospor-hospital/current/scripts/run-online-release.sh \
  /media/lospor-1.0.0/lospor-hospital-1.0.0-release.lock \
  /media/lospor-1.0.0/lospor-hospital-1.0.0-release.lock.sha256 \
  /media/lospor-1.0.0
```

The credential is taken from `HOSPITAL_GHCR_USER` and `HOSPITAL_GHCR_READ_TOKEN`,
or from `secrets/registry/ghcr-user` and `secrets/registry/ghcr-token` when those
variables are unset. The launcher authenticates into a throwaway Docker
configuration and deletes it on every exit path, including interruption. Do not
run `docker login` by hand beforehand: that writes the token into
`~/.docker/config.json` as recoverable base64 and leaves it there indefinitely,
and nothing after the pull needs it.

The launcher first validates the canonical lock sidecar. It then pulls exact
registry digests and verifies the selected `linux/amd64` manifest, image
configuration digest, and ordered root-filesystem diff IDs before tagging the
images for the release Compose model.

### Knowing that an update exists

A connected site can ask the registry what has been published:

```sh
sh /opt/lospor-hospital/current/scripts/check-for-update.sh
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
and do not have to happen together. `--fetch-only` performs the download and the
full identity verification, then stops:

```sh
sh /opt/lospor-hospital/current/scripts/run-online-release.sh --fetch-only \
  /media/lospor-1.0.1/lospor-hospital-1.0.1-release.lock \
  /media/lospor-1.0.1/lospor-hospital-1.0.1-release.lock.sha256 \
  /media/lospor-1.0.1
```

Nothing that is running is touched. Afterwards, applying the update is the same
command without the flag, and takes seconds rather than the length of a download,
because every image is already present and verified.

This is the recommended shape for a working hospital: fetch overnight, apply in a
chosen gap between lists.

### Why the lock still comes from the maintainer

A site's registry credential is read-only and scoped to packages, so it can pull
images but cannot download release assets. That is deliberate rather than a
limitation to be engineered away. The registry supplies the images; the release
lock and its separately delivered `.sha256` supply the fingerprint that decides
whether those images are the right ones. Letting one source provide both would
mean a single compromised channel could replace the payload and the fingerprint
that authenticates it, consistently, and no verification downstream would notice.

The lock is a few kilobytes, so delivering it separately costs nothing.

## Sites with no registry access

A hospital network may install and update without internet or registry access.
Place the complete final release asset set in one directory: manifest,
deployment archive, security-evidence archive, release lock, canonical
`.sha256` sidecar, and every ordered offline part. For an existing installation,
run:

```sh
sh /opt/lospor-hospital/current/scripts/load-offline.sh \
  /media/lospor-1.0.0/lospor-hospital-1.0.0-release.lock \
  /media/lospor-1.0.0/lospor-hospital-1.0.0-release.lock.sha256 \
  /media/lospor-1.0.0
```

A first installation has no trusted `current` launcher yet. Follow the
[first-install bootstrap procedure](release-validation.md#client-verification-and-installation):
verify the deployment archive from the separately retained lock SHA-256,
extract it into the new persistent bootstrap directory, bind that directory to
the appliance home, and then use its production launcher. Do not execute a
launcher directly from an unverified archive or pass a custom install command.

Both launchers verify and stage the checksum-covered deployment archive, then
invoke that candidate kit's own installer or updater. This prevents an older
installed Compose file or script from driving a newer set of images. Only
successful activation updates the non-secret installed release
path/version/lock state; downgrades and same-version lock changes fail before
backup or migration.

If a candidate fails after it starts, the installed state remains on the prior
release. Before restarting that release, activation resolves all ten prior
images by their portable configuration and root-filesystem identities,
restores their ordinary Compose tags, verifies them again, and force-recreates the old
services. This also restores a release tag whose approved digest changed
between releases; a missing old image stops the rollback instead of applying
only part of it.

The candidate workflow splits the compressed archive into parts no larger than
1.9 GiB. Actions stores the large candidate once; both publication stages
independently download and verify that same artifact, and no second
multi-gigabyte Actions artifact is uploaded. The standalone image lock and
`publication-request.tsv` are candidate-only provenance inputs and are absent
from the final release assets.

The offline launcher validates the exact lock-sidecar syntax, every part's size
and SHA-256, the complete gzip stream, and the portable identity and platform
of all ten loaded images before the update starts. The sidecar detects corruption, but an
attacker able to replace both it and the lock can create a matching pair.

For a hand-carried update, the maintainer downloads assets only from the
reviewed private immutable GitHub Release onto a clean encrypted USB, verifies
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
`pg_trgm` from a checksummed upstream tarball. Its zlib 1.3.2 and ACL 2.4.0
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
./scripts/appliance-operator.sh state
```

Database migrations stay backward compatible for the rollback window. Never
roll a schema backward with ad hoc SQL; restore the backup taken in step 1.

## Exchange compatibility

The exchange manifest is explicitly versioned. Central advertises supported
versions and Hospital refuses an incompatible enrollment. Once a second
manifest version exists, Central should retain the previous production version
for at least 24 months or for the contractual hospital upgrade window,
whichever is longer. This is a support policy, not permission for silent data
conversion.
