# Updates and compatibility

## How a site gets a release

Images are built once, in CI, from a tagged commit, and a site runs those exact
bytes. It does not compile its own copy: four Next.js applications built on a
hospital server produce a build nobody else has, and nothing can then be pointed
at and called the tested artefact.

Tagging `hospital-<version>` publishes to `ghcr.io`. A site pins the version
explicitly — never `latest`, because a hospital must not be upgraded by a
container restart.

```sh
export HOSPITAL_RELEASE=8.5.0
export COMPOSE_FILE=compose.yaml:compose.release.yaml
./scripts/update.sh
```

## Sites with no registry access

A hospital network that cannot reach `ghcr.io` is the normal case, not the
exception. Bundle the same images to a file and carry it in:

```sh
# on a machine that has built the images
docker compose --profile tools build
./scripts/bundle-offline.sh 8.5.0

# at the site
./scripts/load-offline.sh dist/lospor-hospital-8.5.0.images.tar.gz
export HOSPITAL_RELEASE=8.5.0
export COMPOSE_FILE=compose.yaml:compose.release.yaml
./scripts/update.sh
```

The bundle is roughly 850 MB — the images share most of their layers, so it is
far smaller than their combined size. `load-offline.sh` verifies the checksum
before loading anything and refuses a bundle whose checksum is missing or wrong:
a file that travelled on a USB stick between two buildings is exactly the kind
that arrives truncated, and a half-loaded image set would leave the appliance
running a mixture of versions.

## Building from source

Omitting `compose.release.yaml` builds from the vendored source instead. That is
the development path. `update.sh` handles both without being told which: `pull`
skips anything buildable and `build` skips anything already pulled.

## What update.sh does, in order

1. takes a backup;
2. verifies the pinned sources and the exchange-contract checksum;
3. pulls or builds;
4. applies forward database migrations;
5. starts the services and runs the health checks.

Database migrations must stay backward compatible for the rollback window.
Never roll a schema backward with ad hoc SQL — restore the backup taken in
step 1.

## Exchange compatibility

The exchange manifest is explicitly versioned. Central advertises supported
versions and Hospital refuses an incompatible enrollment. Once a second manifest
version exists, Central should retain the previous production version for at
least 24 months or for the contractual hospital upgrade window, whichever is
longer. This is a support policy, not permission for silent data conversion.
