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
. "$root/scripts/operator-locale.sh"
. "$root/scripts/update-pipeline-lib.sh"
operator_locale_load "$root"

test -f .env || {
  operator_error "Hospital is not configured." "Болничната система не е конфигурирана."
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
sh ./scripts/ensure-backup-configuration.sh
./scripts/backup-now.sh --kind pre-update

# The verified backup finishes before the update-wide mutation lock is taken,
# so this update's own backup can run while other scheduled/manual backups are
# subsequently excluded from migrations and service replacement. The lock is a
# persistent host file bind-mounted into the backup container; neither side may
# replace or delete it because flock coordination depends on the shared inode.
update_appliance_home="$(release_state_appliance_home "$root")"
update_pipeline_init "$root" "$update_appliance_home"
if ! update_io_lock_acquire database-update; then
  operator_error "Another backup, update, or destructive maintenance operation is active." "Изпълнява се друго архивиране, обновяване или действие по поддръжката."
  exit 1
fi
# Child maintenance helpers may rely on this already-held lock, but may not
# claim that exemption outside this update process.
export STATUS_FALLBACK_CERTIFICATE_IO_LOCK_HELD=1
trap 'update_io_lock_release' EXIT HUP INT TERM

# Leave the exact protected recovery object beside an activation journal. This
# is non-PHI object identity only; recovery still authenticates the manifest.
if [ -n "${HOSPITAL_ACTIVATION_LOCK:-}" ] && [ -d "$HOSPITAL_ACTIVATION_LOCK" ]; then
  latest_pre_update="$(find "$(release_state_appliance_home "$root")/backups" -mindepth 2 -maxdepth 2 \
    -name .retain-pre-update -type f -printf '%T@\t%h\n' 2>/dev/null \
    | sort -n | tail -n 1 | cut -f2-)"
  if [ -n "$latest_pre_update" ]; then
    backup_record="$HOSPITAL_ACTIVATION_LOCK/pre-update-backup"
    backup_record_tmp="$backup_record.tmp.$$"
    printf '%s\n' "$(basename "$latest_pre_update")" > "$backup_record_tmp"
    chmod 0600 "$backup_record_tmp"
    update_durable_replace "$backup_record_tmp" "$backup_record"
  fi
fi
docker compose config --quiet

resolved_compose="$(docker compose --profile tools config --format json)"
update_supply="$(install_detect_supply "$resolved_compose")"
unset resolved_compose
install_supply_authorized "$update_supply" "${HOSPITAL_IMAGES_VERIFIED:-}" || {
  operator_error \
    "Packaged updates must be launched by run-online-release.sh or load-offline.sh; the verification flag is invalid in source mode." \
    "Пакетираните обновявания трябва да се стартират чрез run-online-release.sh или load-offline.sh; флагът за проверка е невалиден при работа от изходен код."
  exit 1
}
case "$update_supply:${HOSPITAL_IMAGES_VERIFIED:-}" in
  verified-release:1)
    test -s "${HOSPITAL_VERIFIED_RELEASE_LOCK:-}" || { operator_error "Verified release lock is unavailable." "Провереният заключващ файл на версията не е наличен."; exit 1; }
    release_state_assert_verified_transition "$root" \
      || { operator_error "Release update lacks a coherent verified transition." "Обновяването няма последователен и проверен преход между версиите."; exit 1; }
    sh ./scripts/verify-loaded-release-images.sh "$HOSPITAL_VERIFIED_RELEASE_LOCK"
    ;;
  source:"")
    docker compose pull --ignore-buildable
    docker compose build --pull
    ;;
esac
sh scripts/validate-caddy-config.sh
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
    operator_say "Select the existing clinical ADMIN who will operate this appliance." "Изберете съществуващия клиничен ADMIN, който ще управлява тази система."
    sh scripts/appliance-operator.sh initialize
    ;;
  11)
    operator_say "Status has no credential store; prove the current clinical operator to rebuild it." "Status няма хранилище за достъп; удостоверете текущия клиничен оператор, за да го възстановите."
    sh scripts/appliance-operator.sh repair-status
    ;;
  12)
    operator_say "Finish the interrupted initial operator selection." "Завършете прекъснатия първоначален избор на оператор."
    sh scripts/appliance-operator.sh initialize
    ;;
  13)
    operator_error "A credential change is pending. Re-run that exact operator action first." "Има чакаща промяна на данните за достъп. Първо изпълнете отново точно същото действие за оператора."
    sh scripts/appliance-operator.sh state >&2 || true
    exit 1
    ;;
  *)
    operator_error "Status and clinical credential generations disagree." "Поколенията на данните за достъп в Status и клиничната система не съвпадат."
    operator_error "Run: sh scripts/appliance-operator.sh state" "Изпълнете: sh scripts/appliance-operator.sh state"
    exit 1
    ;;
esac

docker compose up -d
# Status may already have been started with a newly generated fallback pair,
# but the durable reload marker is cleared only after the independent listener
# is fingerprint-verified. Do that before doctor can accept the update.
sh scripts/renew-status-fallback-certificate.sh
./scripts/doctor.sh
