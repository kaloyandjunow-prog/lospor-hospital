# Updates and compatibility

## How a site gets a release

Hospital images are built once in CI from an exact `hospital-MAJOR.MINOR.PATCH`
tag. Seven LOSPOR images and three approved third-party images are recorded in
the signed release lock. A client does not compile them and never uses
`latest`.

For an online update, hospital IT authenticates to private GHCR using that
hospital's separate revocable read-only credential, then runs the signed
launcher:

```sh
printf '%s' "$HOSPITAL_GHCR_READ_TOKEN" \
  | docker login ghcr.io --username "$HOSPITAL_GHCR_USER" --password-stdin
./scripts/run-online-release.sh release.lock release.lock.sig \
  /etc/lospor/trust/hospital-release-ed25519.pem /media/lospor-1.0.0
```

The launcher verifies the signature before downloading anything, pulls exact
registry digests, checks their image IDs and `linux/amd64` platform, and only
then tags them for the release Compose model.

## Sites with no registry access

A hospital network may install and update without internet or registry access.
Place the signed lock, signature, and every ordered offline part in one
directory, then run:

```sh
./scripts/load-offline.sh release.lock release.lock.sig \
  /etc/lospor/trust/hospital-release-ed25519.pem /media/lospor-1.0.0
```

Both launchers also verify and stage the signed deployment archive, then invoke
that candidate kit's own installer or updater. This prevents an older installed
Compose file or script from driving a newer set of images. Only successful
activation updates the non-secret installed release path/version/lock state;
downgrades and same-version identity changes fail before backup or migration.
If a candidate fails after it starts, the installed state remains on the prior
release. Before restarting that release, activation checks that all ten prior
content-addressed image IDs from its signed lock still exist, restores their
ordinary Compose tags, verifies them again, and force-recreates the old
services. This also restores a third-party tag whose newly approved digest
changed between releases; a missing old image fails closed instead of applying
only part of the rollback.

The release workflow splits the compressed archive into parts no larger than
1.9 GiB. The offline launcher verifies the Ed25519 signature, every part's size
and SHA-256, the complete gzip stream, all ten loaded image IDs, and platform
before the update starts. A public key found beside a USB bundle is not a trust
anchor; hospital IT receives and records the trusted key fingerprint through a
separate authenticated onboarding route.

## Building from source

Omitting `compose.release.yaml` builds from the vendored source. That is the
development path. `update.sh` detects the resolved Compose model. A release
model fails closed unless a signed launcher passes its ephemeral verification
state, and every release service uses `pull_policy: never` so Compose cannot
silently replace a verified image while starting it.

## What update.sh does, in order

1. takes and verifies a database backup;
2. verifies all ten loaded image identities for a signed release, or builds the
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
