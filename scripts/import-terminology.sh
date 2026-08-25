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

usage() {
  operator_error \
    "Usage: import-terminology.sh <package-directory-under-reference-data> [--operator <name>] [--resume]" \
    "Употреба: import-terminology.sh <папка-на-пакета-в-reference-data> [--operator <име>] [--resume]"
  exit 2
}

package_relative="${1:-}"
[ -n "$package_relative" ] || usage
shift
operator_identity="${SUDO_USER:-$(id -un 2>/dev/null || echo unknown)}"
resume=0
while [ "$#" -gt 0 ]; do
  case "$1" in
    --operator) [ "$#" -ge 2 ] || usage; operator_identity="$2"; shift 2 ;;
    --resume) resume=1; shift ;;
    *) usage ;;
  esac
done
case "$package_relative" in ""|/*|*..*|*[!A-Za-z0-9._/-]*) usage ;; esac
printf '%s\n' "$operator_identity" | grep -Eq '^[A-Za-z0-9А-Яа-я ._@-]{1,100}$' || {
  operator_error "Operator identity contains unsupported characters." "Името на оператора съдържа неподдържани знаци."
  exit 2
}

package_host="$root/reference-data/$package_relative"
manifest_host="$package_host/manifest.json"
[ -d "$package_host" ] && [ -s "$manifest_host" ] || {
  operator_error "Terminology package or manifest.json is missing: $package_host" "Липсва пакетът с терминология или manifest.json: $package_host"
  exit 1
}
if [ "$package_relative" = . ]; then
  manifest_container=/reference-data/manifest.json
  vocabulary_container=/reference-data
else
  manifest_container="/reference-data/$package_relative/manifest.json"
  vocabulary_container="/reference-data/$package_relative"
fi

state_dir="$appliance_home/.data/terminology"
mkdir -p "$state_dir/runs"
chmod 700 "$state_dir" "$state_dir/runs"
lock="$state_dir/import.lock"
if ! mkdir "$lock" 2>/dev/null; then
  operator_error "Another terminology import is running, or its lock needs review: $lock" "Вече се изпълнява импорт на терминология или заключването изисква проверка: $lock"
  exit 1
fi

services_stopped=0
completed=0
running_services=""
restart_services() {
  [ "$services_stopped" -eq 1 ] || return 0
  for service in $running_services; do docker compose up -d "$service" >/dev/null 2>&1 || true; done
  services_stopped=0
}
cleanup() {
  result=$?
  restart_services
  rmdir "$lock" 2>/dev/null || true
  if [ "$result" -ne 0 ] && [ "$completed" -eq 0 ]; then
    operator_error \
      "Import stopped. The live database was retained; the staged generation and evidence remain for --resume." \
      "Импортът спря. Действащата база е запазена; подготвеното поколение и доказателствата остават за --resume."
  fi
  exit "$result"
}
trap cleanup EXIT HUP INT TERM

candidate_evidence="$state_dir/manifest-candidate.$$"
sh scripts/container-node.sh scripts/terminology-manifest.mjs verify "$manifest_container" > "$candidate_evidence"
fields_file="$state_dir/manifest-fields.$$"
sh scripts/container-node.sh scripts/terminology-manifest.mjs fields "$manifest_container" > "$fields_file"
while IFS="$(printf '\t')" read -r key value; do
  case "$key" in
    MANIFEST_SHA256) MANIFEST_SHA256="$value" ;;
    PACKAGE_ID) PACKAGE_ID="$value" ;;
    PACKAGE_VERSION) PACKAGE_VERSION="$value" ;;
    SOURCE_NAME) SOURCE_NAME="$value" ;;
    LICENCE_IDENTIFIER) LICENCE_IDENTIFIER="$value" ;;
    MIN_ICD10_CODES) MIN_ICD10_CODES="$value" ;;
    MIN_ICD10_BULGARIAN_LABELS) MIN_ICD10_BULGARIAN_LABELS="$value" ;;
    MIN_ATC_CODES) MIN_ATC_CODES="$value" ;;
    MIN_LAB_LOINC) MIN_LAB_LOINC="$value" ;;
    MIN_OMOP_CONCEPTS) MIN_OMOP_CONCEPTS="$value" ;;
    MIN_OMOP_RELATIONSHIPS) MIN_OMOP_RELATIONSHIPS="$value" ;;
    MIN_OMOP_ANCESTORS) MIN_OMOP_ANCESTORS="$value" ;;
    MIN_CONCEPT_MAPS) MIN_CONCEPT_MAPS="$value" ;;
  esac
done < "$fields_file"
rm -f "$fields_file"
for required_value in MANIFEST_SHA256 PACKAGE_ID PACKAGE_VERSION SOURCE_NAME LICENCE_IDENTIFIER \
  MIN_ICD10_CODES MIN_ICD10_BULGARIAN_LABELS MIN_ATC_CODES MIN_LAB_LOINC \
  MIN_OMOP_CONCEPTS MIN_OMOP_RELATIONSHIPS MIN_OMOP_ANCESTORS MIN_CONCEPT_MAPS
do
  eval "present=\${$required_value:-}"
  [ -n "$present" ] || { operator_error "Verified manifest omitted $required_value." "Провереният manifest не съдържа $required_value."; exit 1; }
done

if [ -s "$state_dir/active.tsv" ] && grep -Fq "$(printf '\t')$MANIFEST_SHA256$(printf '\t')" "$state_dir/active.tsv"; then
  rm -f "$candidate_evidence"
  sh scripts/terminology-status.sh --go-live
  operator_say "This exact terminology package is already active; no import was performed." "Точно този пакет с терминология вече е активен; не е извършен нов импорт."
  completed=1
  exit 0
fi

pending="$state_dir/pending.tsv"
if [ -s "$pending" ]; then
  tab="$(printf '\t')"
  IFS="$tab" read -r pending_header pending_sha stage_database previous_database phase run_id pending_extra < "$pending" || true
  [ -z "${pending_extra:-}" ] && [ "$pending_header" = LOSPOR-HOSPITAL-TERMINOLOGY-PENDING-V1 ] \
    && [ "$pending_sha" = "$MANIFEST_SHA256" ] || {
      operator_error "A different unfinished terminology generation exists; review it before starting another." "Съществува друго незавършено поколение терминология; проверете го преди нов импорт."
      exit 1
    }
  [ "$resume" -eq 1 ] || {
    operator_error "An unfinished import exists. Re-run this exact package with --resume." "Има незавършен импорт. Стартирайте отново същия пакет с --resume."
    exit 1
  }
else
  run_id="$(date -u +%Y%m%dT%H%M%SZ)-$(printf '%s' "$MANIFEST_SHA256" | cut -c1-12)"
  stage_database="lospor_term_$(printf '%s' "$MANIFEST_SHA256" | cut -c1-16)"
  previous_database="-"
  phase=verified
fi
terminology_database_name "$stage_database" || { operator_error "Unsafe staging database name." "Опасно име на подготвената база."; exit 1; }
run_dir="$state_dir/runs/$run_id"
mkdir -p "$run_dir"
chmod 700 "$run_dir"
mv "$candidate_evidence" "$run_dir/manifest-evidence.json"
chmod 600 "$run_dir/manifest-evidence.json"

write_pending() {
  phase="$1"
  printf 'LOSPOR-HOSPITAL-TERMINOLOGY-PENDING-V1\t%s\t%s\t%s\t%s\t%s\n' \
    "$MANIFEST_SHA256" "$stage_database" "$previous_database" "$phase" "$run_id" > "${pending}.tmp.$$"
  chmod 600 "${pending}.tmp.$$"
  mv "${pending}.tmp.$$" "$pending"
}
write_pending "$phase"

running_services="$(docker compose ps --services --status running 2>/dev/null | tr '\n' ' ')"
for service in api delivery-worker web pwa browser backup status; do
  case " $running_services " in *" $service "*) docker compose stop "$service" >/dev/null ;; esac
done
services_stopped=1
docker compose up -d postgres >/dev/null

postgres_sql() {
  docker compose exec -T postgres psql -X -v ON_ERROR_STOP=1 -U lospor -d postgres -Atc "$1"
}
database_exists() {
  [ "$(postgres_sql "SELECT count(*) FROM pg_database WHERE datname = '$1';")" = 1 ]
}
terminate_database_connections() {
  postgres_sql "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$1' AND pid <> pg_backend_pid();" >/dev/null
}

# A host loss between the two database renames leaves enough state to recover
# deterministically. Restore the prior `lospor` name and retain the candidate as
# the stage, then repeat validation/import under --resume.
if [ "$phase" = activating ] && [ "$previous_database" != - ] && database_exists "$previous_database"; then
  if database_exists lospor && ! database_exists "$stage_database"; then
    terminate_database_connections lospor
    postgres_sql "ALTER DATABASE \"lospor\" RENAME TO \"$stage_database\";" >/dev/null
    postgres_sql "ALTER DATABASE \"$previous_database\" RENAME TO \"lospor\";" >/dev/null
  elif ! database_exists lospor && database_exists "$stage_database"; then
    postgres_sql "ALTER DATABASE \"$previous_database\" RENAME TO \"lospor\";" >/dev/null
  else
    operator_error "Interrupted activation has an ambiguous database layout; no rename was attempted." "Прекъснатото активиране е оставило нееднозначно разположение на базите; не е извършено преименуване."
    exit 1
  fi
  previous_database="-"
  write_pending validated
fi

if ! database_exists "$stage_database"; then
  database_bytes="$(postgres_sql "SELECT pg_database_size('lospor');")"
  available_kib="$(docker compose exec -T postgres sh -c "df -Pk /var/lib/postgresql/data | awk 'NR == 2 { print \$4 }'")"
  case "$database_bytes:$available_kib" in *[!0-9:]*|:*)
    operator_error "Could not establish terminology staging capacity." "Не може да се определи мястото за подготвяне на терминологията."
    exit 1 ;;
  esac
  required_kib=$((database_bytes / 1024 + database_bytes / 10240 + 1048576))
  [ "$available_kib" -ge "$required_kib" ] || {
    operator_error "Insufficient PostgreSQL storage for an isolated terminology generation." "Недостатъчно място в PostgreSQL за отделно поколение терминология."
    exit 1
  }
  terminate_database_connections lospor
  postgres_sql "CREATE DATABASE \"$stage_database\" WITH TEMPLATE \"lospor\" OWNER \"lospor\";" >/dev/null
  write_pending staged
fi

stage_run() {
  MSYS_NO_PATHCONV=1 docker compose --profile tools run --rm --no-deps --interactive=false -T \
    -e HOSPITAL_TERMINOLOGY_DATABASE="$stage_database" tools sh -eu -c '
      case "$DATABASE_URL" in */lospor) ;; *) echo "Unexpected database URL shape." >&2; exit 1 ;; esac
      DATABASE_URL="${DATABASE_URL%/lospor}/$HOSPITAL_TERMINOLOGY_DATABASE"
      DIRECT_URL="$DATABASE_URL"
      export DATABASE_URL DIRECT_URL
      exec "$@"
    ' sh "$@"
}

run_step() {
  step="$1"; marker="$2"; shift 2
  log="$run_dir/$step.log"
  operator_say "Terminology import step: $step" "Стъпка от импорта на терминология: $step"
  if ! stage_run "$@" > "$log" 2>&1; then
    cat "$log" >&2
    return 1
  fi
  if [ -n "$marker" ] && ! grep -Fq "$marker" "$log"; then
    cat "$log" >&2
    operator_error "Step $step did not emit its success marker." "Стъпката $step не изведе знак за успешен край."
    return 1
  fi
  if [ "${HOSPITAL_TERMINOLOGY_TEST_MODE:-}" = 1 ] \
    && [ "${HOSPITAL_TERMINOLOGY_TEST_FAIL_AFTER_STEP:-}" = "$step" ]; then
    operator_error "Injected terminology test failure after $step." "Инжектирана тестова грешка след $step."
    return 1
  fi
}

write_pending importing
run_step local-vocabularies "All vocabulary seeds complete." \
  ./node_modules/.bin/tsx scripts/seed-vocabularies.ts --vocab-dir "$vocabulary_container"
run_step bundled-loinc "Done." \
  ./node_modules/.bin/tsx scripts/seed-lab-loinc.ts
run_step athena "Athena vocabulary import complete." \
  ./node_modules/.bin/tsx scripts/seed-athena-vocabularies.ts --vocab-dir "$vocabulary_container" --replace
run_step concept-maps "Active concept maps:" \
  ./node_modules/.bin/tsx scripts/seed-concept-maps.ts

counts="$(terminology_query_counts "$stage_database")"
terminology_counts_parse "$counts" || { operator_error "Staged terminology counts are invalid." "Бройките на подготвената терминология са невалидни."; exit 1; }
terminology_counts_valid || {
  operator_error "Staged terminology failed count, relationship, mapping, or bilingual-label validation." "Подготвената терминология не премина проверката на бройки, връзки, съответствия или двуезични етикети."
  exit 1
}
terminology_counts_record > "$run_dir/counts.tsv"
chmod 600 "$run_dir/counts.tsv"
printf 'LOSPOR-HOSPITAL-TERMINOLOGY-MINIMUMS-V1\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\n' \
  "$MIN_ICD10_CODES" "$MIN_ICD10_BULGARIAN_LABELS" "$MIN_ATC_CODES" "$MIN_LAB_LOINC" \
  "$MIN_OMOP_CONCEPTS" "$MIN_OMOP_RELATIONSHIPS" "$MIN_OMOP_ANCESTORS" "$MIN_CONCEPT_MAPS" \
  > "$run_dir/minimums.tsv"
chmod 600 "$run_dir/minimums.tsv"
write_pending validated

# Re-hash every source byte immediately before activation. The package is a
# read-only mount to the tool, but this also detects a host-side replacement
# during a long Athena import.
sh scripts/container-node.sh scripts/terminology-manifest.mjs fields "$manifest_container" > "$run_dir/final-fields.tsv"
final_sha="$(awk -F '\t' '$1 == "MANIFEST_SHA256" { print $2 }' "$run_dir/final-fields.tsv")"
[ "$final_sha" = "$MANIFEST_SHA256" ] || {
  operator_error "Terminology package changed during import; activation refused." "Пакетът с терминология е променен по време на импорта; активирането е отказано."
  exit 1
}

# Record the complete checksum evidence and the hashes of the approved
# minima/count records inside the staged database before its name can become
# live. A later database restore therefore carries its own terminology proof;
# host-side evidence from another generation cannot make it pass readiness.
terminology_record_approved_manifest \
  "$stage_database" "$run_dir/manifest-evidence.json" \
  "$run_dir/minimums.tsv" "$run_dir/counts.tsv" "$run_id" || {
  operator_error \
    "Could not bind terminology manifest evidence to the staged database." \
    "Доказателството от manifest-а на терминологията не може да бъде свързано с подготвената база."
  exit 1
}
stage_marker="$(terminology_query_approved_manifest "$stage_database")" || {
  operator_error \
    "The staged database did not return its terminology evidence marker." \
    "Подготвената база не върна маркера си с доказателство за терминологията."
  exit 1
}
stage_marker_sha="${stage_marker%%|*}"
[ "$stage_marker_sha" = "$MANIFEST_SHA256" ] || {
  operator_error \
    "The staged database terminology marker does not match the verified manifest." \
    "Маркерът за терминология в подготвената база не съответства на проверения manifest."
  exit 1
}

previous_database="lospor_previous_$(date -u +%Y%m%d%H%M%S)_$(printf '%s' "$MANIFEST_SHA256" | cut -c1-6)"
terminology_database_name "$previous_database" || exit 1
database_exists "$previous_database" && {
  operator_error "Previous-generation database name already exists; activation refused." "Вече съществува база с името за предишното поколение; активирането е отказано."
  exit 1
}
write_pending activating
terminate_database_connections lospor
terminate_database_connections "$stage_database"
postgres_sql "ALTER DATABASE \"lospor\" RENAME TO \"$previous_database\";" >/dev/null
if ! postgres_sql "ALTER DATABASE \"$stage_database\" RENAME TO \"lospor\";" >/dev/null; then
  postgres_sql "ALTER DATABASE \"$previous_database\" RENAME TO \"lospor\";" >/dev/null || true
  previous_database="-"
  write_pending validated
  operator_error "Activation failed; the prior live database name was restored." "Активирането се провали; предишното име на действащата база е възстановено."
  exit 1
fi

if [ -s "$state_dir/active.tsv" ]; then
  mkdir -p "$run_dir/previous-active"
  for prior_file in active.tsv active-minimums.tsv active-manifest.json active-counts.tsv; do
    [ ! -f "$state_dir/$prior_file" ] || cp "$state_dir/$prior_file" "$run_dir/previous-active/$prior_file"
  done
fi
activated_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
cp "$run_dir/manifest-evidence.json" "$state_dir/active-manifest.json.tmp.$$"
cp "$run_dir/minimums.tsv" "$state_dir/active-minimums.tsv.tmp.$$"
cp "$run_dir/counts.tsv" "$state_dir/active-counts.tsv.tmp.$$"
printf 'LOSPOR-HOSPITAL-TERMINOLOGY-V1\t%s\t%s\t%s\t%s\t%s\t%s\t%s\n' \
  "$MANIFEST_SHA256" "$PACKAGE_ID" "$PACKAGE_VERSION" "$activated_at" "$operator_identity" "$previous_database" "$run_id" \
  > "$state_dir/active.tsv.tmp.$$"
chmod 600 "$state_dir"/*.tmp.$$
mv "$state_dir/active-manifest.json.tmp.$$" "$state_dir/active-manifest.json"
mv "$state_dir/active-minimums.tsv.tmp.$$" "$state_dir/active-minimums.tsv"
mv "$state_dir/active-counts.tsv.tmp.$$" "$state_dir/active-counts.tsv"
mv "$state_dir/active.tsv.tmp.$$" "$state_dir/active.tsv"
rm -f "$pending"
restart_services
if ! sh scripts/terminology-status.sh --go-live; then
  operator_error \
    "Post-activation terminology readiness failed; restoring the prior database generation." \
    "Готовността на терминологията след активиране е неуспешна; предишното поколение база се възстановява."
  if sh scripts/rollback-terminology.sh --confirm; then
    completed=1
    operator_error \
      "The prior database generation was restored and public go-live remains refused." \
      "Предишното поколение база е възстановено и клиничното въвеждане остава отказано."
  else
    operator_error \
      "Automatic terminology rollback also failed; keep the appliance closed and recover from the retained database generations." \
      "Автоматичното връщане на терминологията също се провали; оставете системата затворена и възстановете от запазените поколения база."
  fi
  exit 1
fi

operator_say \
  "Terminology generation activated atomically. The prior database is retained for explicit rollback: $previous_database" \
  "Поколението терминология е активирано атомарно. Предишната база е запазена за изрично връщане: $previous_database"
completed=1
