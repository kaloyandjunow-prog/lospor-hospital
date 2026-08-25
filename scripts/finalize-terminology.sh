#!/bin/sh
set -eu

root="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"
. "$root/scripts/installed-release-state.sh"
appliance_home="$(release_state_appliance_home "$root")"
if release_state_apply "$appliance_home"; then root="$state_release_root"; fi
cd "$root"
. "$root/scripts/operator-locale.sh"
. "$root/scripts/terminology-db-lib.sh"
operator_locale_load "$root"

[ "${1:-}" = --confirm-drop-rollback ] && [ "$#" -eq 1 ] || {
  operator_error \
    "Usage: finalize-terminology.sh --confirm-drop-rollback" \
    "Употреба: finalize-terminology.sh --confirm-drop-rollback"
  exit 2
}
state_dir="$appliance_home/.data/terminology"
active="$state_dir/active.tsv"
[ -s "$active" ] || { operator_error "No active terminology generation is recorded." "Няма записано активно поколение терминология."; exit 1; }
tab="$(printf '\t')"
IFS="$tab" read -r header manifest_sha package_id package_version activated_at operator previous_database run_id extra < "$active" || true
[ -z "${extra:-}" ] && [ "$header" = LOSPOR-HOSPITAL-TERMINOLOGY-V1 ] \
  && terminology_database_name "$previous_database" || {
    operator_error "No retained rollback database remains." "Не е останала запазена база за връщане."
    exit 1
  }

docker compose exec -T postgres psql -X -v ON_ERROR_STOP=1 -U lospor -d postgres \
  -c "DROP DATABASE \"$previous_database\" WITH (FORCE);" >/dev/null
printf 'LOSPOR-HOSPITAL-TERMINOLOGY-V1\t%s\t%s\t%s\t%s\t%s\t-\t%s\n' \
  "$manifest_sha" "$package_id" "$package_version" "$activated_at" "$operator" "$run_id" \
  > "${active}.tmp.$$"
chmod 600 "${active}.tmp.$$"
mv "${active}.tmp.$$" "$active"
printf 'LOSPOR-HOSPITAL-TERMINOLOGY-FINALIZED-V1\t%s\t%s\t%s\n' \
  "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$manifest_sha" "$previous_database" \
  > "$state_dir/last-finalization.tsv"
chmod 600 "$state_dir/last-finalization.tsv"
operator_say \
  "Terminology rollback generation $previous_database was permanently removed." \
  "Поколението за връщане на терминологията $previous_database беше окончателно премахнато."
