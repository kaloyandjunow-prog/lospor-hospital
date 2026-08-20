#!/bin/sh
set -eu

# Updates a running appliance.
#
# Two supply routes are supported. A source checkout builds locally. A packaged
# release must be entered through run-online-release.sh or load-offline.sh;
# those wrappers verify the exact release-lock SHA-256, download/load exact identities,
# and pass an ephemeral HOSPITAL_IMAGES_VERIFIED=1 flag to this process.
#
#   # published images (preferred)
#   ./scripts/run-online-release.sh release.lock release.lock.sha256 artifacts
#
#   # from source
#   ./scripts/update.sh
#
# The order is deliberate: back up before anything is touched, verify the bundle
# is what it claims to be before it is run, and apply migrations before starting
# the new containers. Database migrations must stay backward compatible for the
# rollback window — recovery is restoring the backup taken on the first line,
# never rolling the schema backward by hand.

root="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"
cd "$root"
. "$root/scripts/install-supply-lib.sh"
. "$root/scripts/installed-release-state.sh"

if [ "${HOSPITAL_RELEASE_TRANSITION:-}" != 1 ]; then
  appliance_home="$(release_state_appliance_home "$root")"
  set +e
  release_state_apply "$appliance_home"
  state_result=$?
  set -e
  case "$state_result" in
    0) root="$state_release_root"; cd "$root" ;;
    10) ;;
    *) exit "$state_result" ;;
  esac
fi

test -f .env || {
  echo "Hospital is not configured." >&2
  exit 1
}

# The signing key this appliance trusts, checked before anything is touched.
#
# This is the half of pinning that does the work. Pinning at install is a
# convenience; refusing here is the guarantee. A release that could hand over a
# new signing key would authenticate every release after it, so a key that
# differs from the pinned one stops the update -- ahead of the backup, ahead of
# the migration, ahead of any container being replaced.
#
# A site that never pinned is not failing: it keeps verifying each release
# against the digest it is given, and exit 3 says so without stopping anything.
release_signing_key="infra/release-signing/release-signing-public.pem"
if [ -s "$release_signing_key" ]; then
  set +e
  sh scripts/pin-release-signing-key.sh "$release_signing_key"
  pin_result=$?
  set -e
  case "$pin_result" in
    0|3) ;;
    *) exit "$pin_result" ;;
  esac
fi

./scripts/ensure-status-secrets.sh
./scripts/ensure-api-secrets-layout.sh
./scripts/backup-now.sh
docker compose config --quiet

resolved_compose="$(docker compose --profile tools config --format json)"
update_supply="$(install_detect_supply "$resolved_compose")"
unset resolved_compose
install_supply_authorized "$update_supply" "${HOSPITAL_IMAGES_VERIFIED:-}" || {
  echo "Packaged updates must be launched by run-online-release.sh or load-offline.sh; the verification flag is invalid in source mode." >&2
  exit 1
}
case "$update_supply:${HOSPITAL_IMAGES_VERIFIED:-}" in
  verified-release:1)
    test -s "${HOSPITAL_VERIFIED_RELEASE_LOCK:-}" || { echo "Verified release lock is unavailable." >&2; exit 1; }
    release_state_assert_verified_transition "$root" \
      || { echo "Release update lacks a coherent verified transition." >&2; exit 1; }
    sh ./scripts/verify-loaded-release-images.sh "$HOSPITAL_VERIFIED_RELEASE_LOCK"
    ;;
  source:"")
    docker compose pull --ignore-buildable
    docker compose build --pull
    ;;
esac
docker compose run --rm -T runtime-secrets-init

docker compose up -d postgres
sh scripts/postgres-update-gate.sh preflight
docker compose run --rm -T migrate
sh scripts/postgres-update-gate.sh postflight
docker compose --profile tools run --rm -T status-db-init

# Every appliance installed before this release has an empty Icd10Code table and
# therefore cannot code a diagnosis, so the seed has to run on update as well as
# on install. Insert-only, so a site that has since imported its licensed
# package is not touched, and idempotent, so repeating it costs one query.
docker compose --profile tools run --rm -T tools \
  ./node_modules/.bin/tsx scripts/seed-icd10-from-bundle.ts

docker compose up -d status

# The first status-enabled upgrade needs one explicit operator selection. Both
# stores then keep independent hashes at the same monotonic generation.
set +e
sh scripts/appliance-operator.sh verify
operator_state=$?
set -e
case "$operator_state" in
  0) ;;
  10)
    echo "Select the existing clinical ADMIN who will operate this appliance."
    sh scripts/appliance-operator.sh initialize
    ;;
  11)
    echo "Status has no credential store; prove the current clinical operator to rebuild it."
    sh scripts/appliance-operator.sh repair-status
    ;;
  12)
    echo "Finish the interrupted initial operator selection."
    sh scripts/appliance-operator.sh initialize
    ;;
  13)
    echo "A credential change is pending. Re-run that exact operator action first." >&2
    sh scripts/appliance-operator.sh state >&2 || true
    exit 1
    ;;
  *)
    echo "Status and clinical credential generations disagree." >&2
    echo "Run: sh scripts/appliance-operator.sh state" >&2
    exit 1
    ;;
esac

docker compose up -d
./scripts/doctor.sh
