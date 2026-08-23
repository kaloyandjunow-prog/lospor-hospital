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

go_live=0
case "${1:-}" in "") ;; --go-live) go_live=1 ;; *)
  operator_error "Usage: terminology-status.sh [--go-live]" "Употреба: terminology-status.sh [--go-live]"
  exit 2 ;;
esac

state_dir="$appliance_home/.data/terminology"
active="$state_dir/active.tsv"
minimums="$state_dir/active-minimums.tsv"
evidence="$state_dir/active-manifest.json"
counts_record="$state_dir/active-counts.tsv"

not_ready() {
  operator_error "$1" "$2"
  if [ "$go_live" -eq 1 ]; then return 1; fi
  return 0
}

if [ ! -s "$active" ] || [ ! -s "$minimums" ] || [ ! -s "$evidence" ] || [ ! -s "$counts_record" ]; then
  not_ready \
    "Terminology: no approved package is active. Clinical go-live is not approved." \
    "Терминология: няма активен одобрен пакет. Клиничното въвеждане в експлоатация не е одобрено."
  exit $?
fi

tab="$(printf '\t')"
IFS="$tab" read -r header manifest_sha package_id package_version activated_at operator previous_database run_id extra < "$active" || true
if [ -n "${extra:-}" ] || [ "$header" != LOSPOR-HOSPITAL-TERMINOLOGY-V1 ] \
  || ! printf '%s\n' "$manifest_sha" | grep -Eq '^[a-f0-9]{64}$'; then
  not_ready "Terminology activation record is invalid." "Записът за активиране на терминологията е невалиден."
  exit $?
fi
grep -Fq "\"manifestSha256\": \"$manifest_sha\"" "$evidence" || {
  not_ready "Terminology manifest evidence does not match activation." "Доказателството за manifest не съответства на активирането."
  exit $?
}

database_marker="$(terminology_query_approved_manifest lospor)" || {
  not_ready \
    "Terminology manifest evidence is not bound to the live database." \
    "Доказателството от manifest-а на терминологията не е свързано с действащата база."
  exit $?
}
old_ifs="$IFS"; IFS='|'; set -- $database_marker; IFS="$old_ifs"
if [ "$#" -ne 6 ]; then
  not_ready "Live terminology database marker is invalid." "Маркерът за терминология в действащата база е невалиден."
  exit $?
fi
database_manifest_sha="$1"
database_evidence_sha="$2"
database_minimums_sha="$3"
database_counts_sha="$4"
database_package_id="$5"
database_package_version="$6"
actual_evidence_sha="$(sha256sum "$evidence" | awk '{ print $1 }')"
actual_minimums_sha="$(sha256sum "$minimums" | awk '{ print $1 }')"
actual_counts_sha="$(sha256sum "$counts_record" | awk '{ print $1 }')"
if [ "$database_manifest_sha" != "$manifest_sha" ] \
  || [ "$database_evidence_sha" != "$actual_evidence_sha" ] \
  || [ "$database_minimums_sha" != "$actual_minimums_sha" ] \
  || [ "$database_counts_sha" != "$actual_counts_sha" ] \
  || [ "$database_package_id" != "$package_id" ] \
  || [ "$database_package_version" != "$package_version" ]; then
  not_ready \
    "Terminology database generation and host-side manifest evidence do not match." \
    "Поколението терминология в базата и доказателството от manifest-а на сървъра не съвпадат."
  exit $?
fi

IFS="$tab" read -r minimum_header \
  MIN_ICD10_CODES MIN_ICD10_BULGARIAN_LABELS MIN_ATC_CODES MIN_LAB_LOINC \
  MIN_OMOP_CONCEPTS MIN_OMOP_RELATIONSHIPS MIN_OMOP_ANCESTORS MIN_CONCEPT_MAPS minimum_extra < "$minimums" || true
if [ -n "${minimum_extra:-}" ] || [ "$minimum_header" != LOSPOR-HOSPITAL-TERMINOLOGY-MINIMUMS-V1 ]; then
  not_ready "Terminology minimum-count record is invalid." "Записът за минималните бройки на терминологията е невалиден."
  exit $?
fi

counts="$(terminology_query_counts lospor)" || {
  not_ready "Terminology database checks could not run." "Проверките на базата с терминология не могат да се изпълнят."
  exit $?
}
terminology_counts_parse "$counts" || {
  not_ready "Terminology database returned an invalid count record." "Базата с терминология върна невалиден запис с бройки."
  exit $?
}
if ! terminology_counts_valid; then
  not_ready \
    "Terminology is below its approved minimum or has broken relationships/mappings." \
    "Терминологията е под одобрения минимум или има нарушени връзки/съответствия."
  exit $?
fi

operator_say \
  "Terminology ready: $package_id $package_version, activated $activated_at; manifest $manifest_sha." \
  "Терминологията е готова: $package_id $package_version, активирана $activated_at; manifest $manifest_sha."
