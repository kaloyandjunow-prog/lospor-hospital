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

[ "${1:-}" = --confirm ] && [ "$#" -eq 1 ] || {
  operator_error \
    "Usage: rollback-terminology.sh --confirm" \
    "Употреба: rollback-terminology.sh --confirm"
  exit 2
}

state_dir="$appliance_home/.data/terminology"
active="$state_dir/active.tsv"
[ -s "$active" ] || { operator_error "No active terminology generation is recorded." "Няма записано активно поколение терминология."; exit 1; }
tab="$(printf '\t')"
IFS="$tab" read -r header manifest_sha package_id package_version activated_at operator previous_database run_id extra < "$active" || true
[ -z "${extra:-}" ] && [ "$header" = LOSPOR-HOSPITAL-TERMINOLOGY-V1 ] \
  && terminology_database_name "$previous_database" || {
    operator_error "No retained rollback database is recorded." "Няма записана запазена база за връщане."
    exit 1
  }

running_services="$(docker compose ps --services --status running 2>/dev/null | tr '\n' ' ')"
restart_services() { for service in $running_services; do docker compose up -d "$service" >/dev/null 2>&1 || true; done; }
trap restart_services EXIT HUP INT TERM
for service in api delivery-worker web pwa browser backup status; do
  case " $running_services " in *" $service "*) docker compose stop "$service" >/dev/null ;; esac
done
docker compose up -d postgres >/dev/null
postgres_sql() { docker compose exec -T postgres psql -X -v ON_ERROR_STOP=1 -U lospor -d postgres -Atc "$1"; }
database_exists() { [ "$(postgres_sql "SELECT count(*) FROM pg_database WHERE datname = '$1';")" = 1 ]; }
database_exists "$previous_database" || { operator_error "Retained rollback database is missing." "Запазената база за връщане липсва."; exit 1; }
rejected="lospor_rejected_$(date -u +%Y%m%d%H%M%S)_$(printf '%s' "$manifest_sha" | cut -c1-6)"
terminology_database_name "$rejected" || exit 1
database_exists "$rejected" && { operator_error "Rollback target name already exists." "Името за върнатата база вече съществува."; exit 1; }
postgres_sql "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname IN ('lospor', '$previous_database') AND pid <> pg_backend_pid();" >/dev/null
postgres_sql "ALTER DATABASE \"lospor\" RENAME TO \"$rejected\";" >/dev/null
if ! postgres_sql "ALTER DATABASE \"$previous_database\" RENAME TO \"lospor\";" >/dev/null; then
  postgres_sql "ALTER DATABASE \"$rejected\" RENAME TO \"lospor\";" >/dev/null || true
  operator_error "Rollback failed; the current live database name was restored." "Връщането се провали; името на текущата действаща база е възстановено."
  exit 1
fi

previous_state="$state_dir/runs/$run_id/previous-active"
if [ -s "$previous_state/active.tsv" ]; then
  for state_file in active.tsv active-minimums.tsv active-manifest.json active-counts.tsv; do
    cp "$previous_state/$state_file" "$state_dir/$state_file"
    chmod 600 "$state_dir/$state_file"
  done
else
  rm -f "$state_dir/active.tsv" "$state_dir/active-minimums.tsv" \
    "$state_dir/active-manifest.json" "$state_dir/active-counts.tsv"
fi
printf 'LOSPOR-HOSPITAL-TERMINOLOGY-ROLLBACK-V1\t%s\t%s\t%s\t%s\n' \
  "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$manifest_sha" "$previous_database" "$rejected" \
  > "$state_dir/last-rollback.tsv"
chmod 600 "$state_dir/last-rollback.tsv"
rm -f "$state_dir/pending.tsv"
restart_services
trap - EXIT HUP INT TERM
sh scripts/terminology-status.sh
operator_say \
  "Terminology rollback completed. The rejected generation is retained as $rejected for review." \
  "Връщането на терминологията завърши. Отхвърленото поколение е запазено като $rejected за проверка."
