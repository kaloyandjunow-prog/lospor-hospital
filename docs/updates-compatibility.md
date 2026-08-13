# Updates and compatibility

## How a site gets a release

Hospital images are built once as a CI candidate from an exact
`hospital-MAJOR.MINOR.PATCH` tag. The maintainer reviews its run-bound
publication request and release-lock SHA-256, then manually dispatches
publication. Publication promotes the already tested image identities without
rebuilding them. Seven LOSPOR images and three approved third-party images are
recorded in the release lock. A client does not compile them and never uses
`latest`.

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

For an online update, hospital IT authenticates to private GHCR using that
hospital's separate revocable read-only credential, then the maintainer runs:

```sh
printf '%s' "$HOSPITAL_GHCR_READ_TOKEN" \
  | docker login ghcr.io --username "$HOSPITAL_GHCR_USER" --password-stdin
sh /opt/lospor-hospital/current/scripts/run-online-release.sh \
  /media/lospor-1.0.0/lospor-hospital-1.0.0-release.lock \
  /media/lospor-1.0.0/lospor-hospital-1.0.0-release.lock.sha256 \
  /media/lospor-1.0.0
```

The launcher first validates the canonical lock sidecar. It then pulls exact
registry digests, checks their image IDs and `linux/amd64` platform, and only
then tags them for the release Compose model.

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
release. Before restarting that release, activation checks that all ten prior
content-addressed image IDs from its release lock still exist, restores their
ordinary Compose tags, verifies them again, and force-recreates the old
services. This also restores a third-party tag whose approved digest changed
between releases; a missing old image stops the rollback instead of applying
only part of it.

The candidate workflow splits the compressed archive into parts no larger than
1.9 GiB. Actions stores the large candidate once; both publication stages
independently download and verify that same artifact, and no second
multi-gigabyte Actions artifact is uploaded. The standalone image lock and
`publication-request.tsv` are candidate-only provenance inputs and are absent
from the final release assets.

The offline launcher validates the exact lock-sidecar syntax, every part's size
and SHA-256, the complete gzip stream, all ten loaded image IDs, and the
platform before the update starts. The sidecar detects corruption, but an
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

## What update.sh does, in order

1. takes and verifies a database backup;
2. verifies all ten loaded image identities for a release, or builds the
   vendored source in development mode;
3. installs runtime secrets;
4. applies forward database migrations;
5. creates or updates the restricted Status database-probe role;
6. starts Status independently;
7. verifies that the clinical and Status credential generations agree; and
8. starts the remaining services and runs health checks.

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
