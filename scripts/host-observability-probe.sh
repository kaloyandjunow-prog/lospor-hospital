#!/bin/sh
set -eu
set +x

# Root-side, privacy-safe appliance observation. The only output consumed by
# Status is one exact, versioned JSON object made exclusively from fixed enums
# and an observation time. Paths, hostnames, addresses, identifiers, command
# output and credential values never cross this boundary.

root="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd -P)"
. "$root/scripts/installed-release-state.sh"
. "$root/scripts/update-pipeline-lib.sh"

test_only="${HOSPITAL_OBSERVABILITY_TEST_ONLY:-0}"
if [ "$test_only" != 1 ] && [ "$(id -u)" -ne 0 ]; then
  echo HOST_OBSERVABILITY_ROOT_REQUIRED >&2
  exit 1
fi

if [ "$test_only" = 1 ]; then
  appliance_home="${LOSPOR_APPLIANCE_HOME:?LOSPOR_APPLIANCE_HOME is required in test mode}"
else
  appliance_home="$(release_state_appliance_home "$root")"
fi
case "$appliance_home" in /*) ;; *) echo HOST_OBSERVABILITY_HOME_UNSAFE >&2; exit 2 ;; esac
case "$appliance_home" in /|/opt|/opt/) echo HOST_OBSERVABILITY_HOME_UNSAFE >&2; exit 2 ;; esac

now_epoch="${HOSPITAL_OBSERVABILITY_NOW_EPOCH:-$(date -u +%s)}"
case "$now_epoch" in ''|*[!0-9]*) echo HOST_OBSERVABILITY_CLOCK_INVALID >&2; exit 2 ;; esac
observed_at="$(date -u -d "@$now_epoch" +%Y-%m-%dT%H:%M:%SZ 2>/dev/null)" \
  || { echo HOST_OBSERVABILITY_CLOCK_INVALID >&2; exit 2; }

work="$(mktemp -d)"
signal_tmp=""
cleanup_observability() {
  [ -z "$signal_tmp" ] || rm -f -- "$signal_tmp" 2>/dev/null || true
  rm -rf -- "$work" 2>/dev/null || true
  update_credential_value=""
}
trap cleanup_observability EXIT HUP INT TERM

safe_regular_file() {
  observed_file="$1"
  [ -f "$observed_file" ] && [ ! -L "$observed_file" ] \
    && [ "$(stat -c %h "$observed_file" 2>/dev/null || echo 0)" = 1 ]
}

safe_private_directory() {
  observed_directory="$1"
  [ -d "$observed_directory" ] && [ ! -L "$observed_directory" ] \
    && { [ "$test_only" = 1 ] || { \
      [ "$(stat -c %a "$observed_directory" 2>/dev/null || echo unsafe)" = 700 ] \
      && [ "$(stat -c %u "$observed_directory" 2>/dev/null || echo unsafe)" = 0 ]; }; }
}

safe_private_file() {
  observed_private_file="$1"
  safe_regular_file "$observed_private_file" \
    && { [ "$test_only" = 1 ] || { \
      [ "$(stat -c %a "$observed_private_file" 2>/dev/null || echo unsafe)" = 600 ] \
      && [ "$(stat -c %u "$observed_private_file" 2>/dev/null || echo unsafe)" = 0 ]; }; }
}

read_env_value() {
  observed_key="$1"
  observed_env="$appliance_home/.env"
  [ -f "$observed_env" ] && [ ! -L "$observed_env" ] || return 1
  observed_count="$(awk -F= -v key="$observed_key" '$1 == key { count += 1 } END { print count + 0 }' "$observed_env")"
  [ "$observed_count" -le 1 ] || return 1
  [ "$observed_count" -eq 1 ] || return 1
  awk -F= -v key="$observed_key" '$1 == key { value = substr($0, length(key) + 2) } END { print value }' "$observed_env" \
    | tr -d '\r' | sed 's/^"//; s/"$//'
}

credential_ready() {
  observed_credential="$1"
  observed_pattern="$2"
  observed_maximum="$3"
  update_credential_value=""
  if update_credential_read "$observed_credential" "$observed_pattern" "$observed_maximum"; then
    update_credential_value=""
    return 0
  fi
  update_credential_value=""
  return 1
}

# Only fixed lock states cross into Status. The activation lock is itself the
# supported recovery boundary, so its safe directory presence is sufficient.
# The restore wrapper retains append-only private journals and durable boundary
# markers; validate those host-side and reduce every historical object to
# clear, present, or invalid without publishing a filename, phase, database,
# process, backup identity, or timestamp.
activation_lock=clear
activation_lock_path="$appliance_home/.data/release-activation.lock"
if [ -e "$activation_lock_path" ] || [ -L "$activation_lock_path" ]; then
  if safe_private_directory "$activation_lock_path"; then
    activation_lock=present
  else
    activation_lock=invalid
  fi
fi

restore_lock=clear
restore_journal_dir="$appliance_home/backups/.restore-journal"
restore_boundary_map="$work/restore-boundaries.tsv"
: > "$restore_boundary_map"
restore_journal_count=0
restore_invalid=0
restore_present=0

restore_journal_resolved_without_boundary() {
  case "$1:$2" in
    TEMPORARY:FAILED|RECONCILE:FAILED \
      |SAFETY_SNAPSHOT:FAILED|SAFETY_SNAPSHOT:PREFLIGHT_FAILED \
      |SAFETY_SNAPSHOT:PREFLIGHT_INVALID|SAFETY_SNAPSHOT:PROOF_INVALID \
      |SAFETY_SNAPSHOT:PROOF_MISSING \
      |DESTRUCTIVE_RESTORE:BOUNDARY_MARKER_COLLISION \
      |DESTRUCTIVE_RESTORE:REFUSED_PRE_BOUNDARY_REOPENED) return 0 ;;
    *) return 1 ;;
  esac
}

if [ -e "$restore_journal_dir" ] || [ -L "$restore_journal_dir" ]; then
  if ! safe_private_directory "$restore_journal_dir"; then
    restore_invalid=1
  else
    for restore_journal in "$restore_journal_dir"/restore-*.journal; do
      [ -e "$restore_journal" ] || [ -L "$restore_journal" ] || continue
      restore_journal_count=$((restore_journal_count + 1))
      restore_journal_name="$(basename "$restore_journal")"
      if ! printf '%s\n' "$restore_journal_name" \
          | grep -Eq '^restore-[0-9]{8}T[0-9]{6}Z\.[A-Za-z0-9]{6,16}\.journal$' \
          || ! safe_private_file "$restore_journal" \
          || [ "$(wc -c < "$restore_journal" | tr -d '[:space:]')" -lt 1 ] \
          || [ "$(wc -c < "$restore_journal" | tr -d '[:space:]')" -gt 65536 ]; then
        restore_invalid=1
        continue
      fi
      if ! grep -Eq \
          '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z phase=(VERIFY|TEMPORARY|RECONCILE|COMPLETE|SAFETY_SNAPSHOT|DESTRUCTIVE_RESTORE|NEEDS_OPERATOR|QUIESCE|HEALTH) result=(PASSED|TEMPORARY_READY|FAILED|PROOF_MISSING|PROOF_INVALID|PREFLIGHT_FAILED|PREFLIGHT_INVALID|BOUNDARY_MARKER_COLLISION|REFUSED_PRE_BOUNDARY_REOPENED|SWITCH_OR_HEALTH_FAILED|PREFLIGHT|BOUNDARY_PROOF_MISSING|BACKUP_LINEAGE_FAILED|BACKUP_LINEAGE_REBOUND|STATUS_DATABASE_READY|OPERATOR_SYNCHRONIZED|INTERNAL_PASSED|PREOPEN_DOCTOR_FAILED|PREOPEN_DOCTOR_PROOF_MISSING|PREOPEN_DOCTOR_PASSED|DOCTOR_FAILED|STARTED) object=lospor-[A-Za-z0-9._-]{1,180}\.backup mode=(temporary|in-place)$' \
          "$restore_journal" \
          || [ "$(grep -Ecv \
            '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z phase=(VERIFY|TEMPORARY|RECONCILE|COMPLETE|SAFETY_SNAPSHOT|DESTRUCTIVE_RESTORE|NEEDS_OPERATOR|QUIESCE|HEALTH) result=(PASSED|TEMPORARY_READY|FAILED|PROOF_MISSING|PROOF_INVALID|PREFLIGHT_FAILED|PREFLIGHT_INVALID|BOUNDARY_MARKER_COLLISION|REFUSED_PRE_BOUNDARY_REOPENED|SWITCH_OR_HEALTH_FAILED|PREFLIGHT|BOUNDARY_PROOF_MISSING|BACKUP_LINEAGE_FAILED|BACKUP_LINEAGE_REBOUND|STATUS_DATABASE_READY|OPERATOR_SYNCHRONIZED|INTERNAL_PASSED|PREOPEN_DOCTOR_FAILED|PREOPEN_DOCTOR_PROOF_MISSING|PREOPEN_DOCTOR_PASSED|DOCTOR_FAILED|STARTED) object=lospor-[A-Za-z0-9._-]{1,180}\.backup mode=(temporary|in-place)$' \
            "$restore_journal")" -ne 0 ]; then
        restore_invalid=1
        continue
      fi
      if ! while IFS=' ' read -r restore_line_time restore_line_rest; do
          restore_line_epoch="$(date -u -d "$restore_line_time" +%s 2>/dev/null || true)"
          case "$restore_line_epoch" in ''|*[!0-9]*) exit 1 ;; esac
          [ "$restore_line_epoch" -le "$((now_epoch + 300))" ] || exit 1
        done < "$restore_journal"; then
        restore_invalid=1
        continue
      fi
      restore_last="$(tail -n 1 "$restore_journal")"
      restore_phase="$(printf '%s\n' "$restore_last" | sed -n 's/^.* phase=\([A-Z_]*\) result=.*$/\1/p')"
      restore_result="$(printf '%s\n' "$restore_last" | sed -n 's/^.* result=\([A-Z_]*\) object=.*$/\1/p')"
      restore_mode="$(printf '%s\n' "$restore_last" | sed -n 's/^.* mode=\([a-z-]*\)$/\1/p')"
      restore_token="$(printf '%s' "$restore_journal_name" | sha256sum | awk '{ print substr($1, 1, 24) }')"
      restore_terminal=present
      if [ "$restore_phase:$restore_result:$restore_mode" = COMPLETE:PASSED:in-place ]; then
        restore_terminal=complete-in-place
      elif [ "$restore_phase:$restore_result:$restore_mode" = COMPLETE:TEMPORARY_READY:temporary ]; then
        restore_terminal=complete-temporary
      elif restore_journal_resolved_without_boundary "$restore_phase" "$restore_result"; then
        restore_terminal=resolved-pre-boundary
      else
        restore_present=1
      fi
      printf '%s\t%s\t%s\n' "$restore_token" "$restore_mode" "$restore_terminal" \
        >> "$restore_boundary_map"
    done
    restore_actual_count="$(find "$restore_journal_dir" -mindepth 1 -maxdepth 1 -print 2>/dev/null | wc -l | tr -d '[:space:]')"
    case "$restore_actual_count" in ''|*[!0-9]*) restore_invalid=1 ;; esac
    [ "$restore_actual_count" = "$restore_journal_count" ] || restore_invalid=1
  fi
fi

for restore_boundary in "$appliance_home/backups"/.restore-boundary-*.started; do
  [ -e "$restore_boundary" ] || [ -L "$restore_boundary" ] || continue
  restore_boundary_name="$(basename "$restore_boundary")"
  restore_boundary_token="$(printf '%s\n' "$restore_boundary_name" \
    | sed -n 's/^\.restore-boundary-\([0-9a-f]\{24\}\)\.started$/\1/p')"
  restore_boundary_state="$restore_boundary/state"
  if [ -z "$restore_boundary_token" ] \
      || ! safe_private_directory "$restore_boundary" \
      || ! safe_private_file "$restore_boundary_state" \
      || [ "$(wc -c < "$restore_boundary_state" | tr -d '[:space:]')" -gt 1024 ] \
      || [ "$(wc -l < "$restore_boundary_state" | tr -d '[:space:]')" -ne 4 ] \
      || ! grep -Eq '^schemaVersion=1$' "$restore_boundary_state" \
      || ! grep -Eq '^startedAt=[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$' "$restore_boundary_state" \
      || ! grep -Eq '^targetDatabase=lospor_restore_[0-9]{14}_[0-9]+$' "$restore_boundary_state" \
      || ! grep -Eq '^previousDatabase=lospor_previous_[0-9]{14}_[0-9]+$' "$restore_boundary_state"; then
    restore_invalid=1
    continue
  fi
  restore_boundary_started="$(sed -n 's/^startedAt=//p' "$restore_boundary_state")"
  restore_boundary_epoch="$(date -u -d "$restore_boundary_started" +%s 2>/dev/null || true)"
  case "$restore_boundary_epoch" in
    ''|*[!0-9]*) restore_invalid=1; continue ;;
  esac
  if [ "$restore_boundary_epoch" -gt "$((now_epoch + 300))" ]; then
    restore_invalid=1
    continue
  fi
  restore_boundary_match="$(awk -F '\t' -v token="$restore_boundary_token" \
    '$1 == token { print $2 "|" $3; count += 1 } END { if (count != 1) exit 1 }' \
    "$restore_boundary_map" 2>/dev/null || true)"
  if [ "$restore_boundary_match" = 'in-place|complete-in-place' ]; then
    :
  elif [ "$restore_boundary_match" = 'in-place|present' ]; then
    restore_present=1
  else
    restore_invalid=1
  fi
done

# An in-place completion without its durable destructive-boundary proof is not
# clear. A temporary completion and a proved pre-boundary refusal need none.
while IFS="$(printf '\t')" read -r restore_map_token restore_map_mode restore_map_terminal; do
  [ -n "$restore_map_token" ] || continue
  if [ "$restore_map_terminal" = complete-in-place ] \
      && [ ! -d "$appliance_home/backups/.restore-boundary-$restore_map_token.started" ]; then
    restore_invalid=1
  fi
done < "$restore_boundary_map"

if [ "$restore_invalid" -eq 1 ]; then
  restore_lock=invalid
elif [ "$restore_present" -eq 1 ]; then
  restore_lock=present
fi

# Storage is aggregated across the appliance, data, backup and Docker filesystems.
# Only the worst fixed state is published; mount paths and byte counts stay host-side.
storage=unknown
storage_rank=0
docker_root="$(docker info --format '{{.DockerRootDir}}' 2>/dev/null || true)"
for observed_path in "$appliance_home" "$appliance_home/.data" "$appliance_home/backups" "$docker_root"; do
  [ -n "$observed_path" ] && [ -e "$observed_path" ] || continue
  observed_df="$(df -Pk "$observed_path" 2>/dev/null | awk 'NR == 2 { print $4 "|" $5 }')"
  observed_available="${observed_df%%|*}"
  observed_used="${observed_df#*|}"; observed_used="${observed_used%%%}"
  case "$observed_available" in ''|*[!0-9]*) continue ;; esac
  case "$observed_used" in ''|*[!0-9]*) continue ;; esac
  observed_rank=1
  if [ "$observed_available" -lt 10485760 ] || [ "$observed_used" -ge 95 ]; then
    observed_rank=3
  elif [ "$observed_available" -lt 20971520 ] || [ "$observed_used" -ge 85 ]; then
    observed_rank=2
  fi
  [ "$observed_rank" -le "$storage_rank" ] || storage_rank="$observed_rank"
done
case "$storage_rank" in 1) storage=ok ;; 2) storage=low ;; 3) storage=critical ;; esac

clock=unknown
if command -v timedatectl >/dev/null 2>&1; then
  observed_sync="$(timedatectl show --property=NTPSynchronized --value 2>/dev/null || true)"
  case "$observed_sync" in yes) clock=synchronized ;; no) clock=unsynchronized ;; esac
fi

marker_read() {
  marker_path="$1"
  marker_time_key="$2"
  marker_epoch=""; marker_object=""; marker_sha=""
  safe_regular_file "$marker_path" || return 1
  [ "$(wc -c < "$marker_path" | tr -d '[:space:]')" -le 4096 ] || return 1
  [ "$(wc -l < "$marker_path" | tr -d '[:space:]')" = 4 ] || return 1
  awk -F= -v time_key="$marker_time_key" '
    $1 == "schemaVersion" { versions += 1; version = $2; next }
    $1 == time_key { times += 1; epoch = $2; next }
    $1 == "objectName" { objects += 1; object = $2; next }
    $1 == "manifestSha256" { hashes += 1; hash = $2; next }
    { bad = 1 }
    END {
      if (bad || versions != 1 || times != 1 || objects != 1 || hashes != 1 || version != "1") exit 1
      print epoch "|" object "|" hash
    }
  ' "$marker_path" > "$work/marker" || return 1
  marker_record="$(cat "$work/marker")"
  marker_epoch="${marker_record%%|*}"
  marker_rest="${marker_record#*|}"
  marker_object="${marker_rest%%|*}"
  marker_sha="${marker_rest#*|}"
  case "$marker_epoch" in ''|*[!0-9]*) return 1 ;; esac
  printf '%s\n' "$marker_object" | grep -Eq '^lospor-[A-Za-z0-9._-]{1,112}\.backup$' || return 1
  printf '%s\n' "$marker_sha" | grep -Eq '^[a-f0-9]{64}$' || return 1
  [ "$marker_epoch" -le "$((now_epoch + 300))" ] || return 1
}

backup=missing
backup_epoch=""; backup_object=""; backup_sha=""
if marker_read "$appliance_home/backups/.last-verified.v1" completedAtEpoch; then
  backup_epoch="$marker_epoch"; backup_object="$marker_object"; backup_sha="$marker_sha"
  backup_age=$((now_epoch - backup_epoch))
  if [ "$backup_age" -le 21600 ]; then backup=fresh
  elif [ "$backup_age" -le 28800 ]; then backup=aging
  else backup=overdue
  fi
elif [ -e "$appliance_home/backups/.last-verified.v1" ]; then
  backup=invalid
fi

off_host_backup=not-configured
offhost_hook="$appliance_home/secrets/backup/offhost-copy"
deferred_hook="$root/infra/postgres/offhost-deferred.sh"
if safe_regular_file "$offhost_hook" \
    && { [ -x "$offhost_hook" ] || [ "$test_only" = 1 ]; }; then
  if [ -f "$deferred_hook" ] && cmp -s "$offhost_hook" "$deferred_hook"; then
    off_host_backup=not-configured
  elif marker_read "$appliance_home/backups/.last-offhost-verified.v1" acknowledgedAtEpoch; then
    offhost_epoch="$marker_epoch"; offhost_object="$marker_object"; offhost_sha="$marker_sha"
    offhost_age=$((now_epoch - offhost_epoch))
    if [ -n "$backup_object" ] && { [ "$offhost_object" != "$backup_object" ] || [ "$offhost_sha" != "$backup_sha" ]; }; then
      off_host_backup=pending
    elif [ "$offhost_age" -le 21600 ]; then
      off_host_backup=acknowledged
    elif [ "$offhost_age" -le 86400 ]; then
      off_host_backup=aging
    else
      off_host_backup=overdue
    fi
  elif [ -e "$appliance_home/backups/.last-offhost-verified.v1" ]; then
    off_host_backup=invalid
  else
    off_host_backup=missing
  fi
elif [ -e "$offhost_hook" ]; then
  off_host_backup=invalid
fi

update_agent=unknown
installation_marker="$appliance_home/.data/runtime/update/state/update-agent-installation.v1.json"
if safe_regular_file "$installation_marker" && [ "$(wc -c < "$installation_marker" | tr -d '[:space:]')" -le 4096 ]; then
  if grep -Eq '^\{"schemaVersion":1,"signalType":"update-agent-installation","observedAt":"[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z","mode":"console-only"\}$' "$installation_marker"; then
    update_agent=not-installed
  elif grep -Eq '^\{"schemaVersion":1,"signalType":"update-agent-installation","observedAt":"[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z","mode":"agent"\}$' "$installation_marker"; then
    agent_signal="$appliance_home/.data/runtime/update/state/update-agent.v2.json"
    agent_at=""
    if safe_regular_file "$agent_signal" && [ "$(wc -c < "$agent_signal" | tr -d '[:space:]')" -le 4096 ]; then
      agent_at="$(sed -n 's/^.*"observedAt":"\([0-9T:Z-]*\)".*$/\1/p' "$agent_signal")"
    fi
    agent_epoch="$(date -u -d "$agent_at" +%s 2>/dev/null || true)"
    if systemctl is-active --quiet lospor-update-agent.service 2>/dev/null \
        && [ -n "$agent_epoch" ] && [ "$agent_epoch" -le "$((now_epoch + 300))" ] \
        && [ "$((now_epoch - agent_epoch))" -le 600 ]; then
      update_agent=healthy
    else
      update_agent=stale
    fi
  fi
fi

certificate=unknown
certificate_rank=0

# Aggregate the worst state across both public TLS identities and the
# independent loopback Status fallback certificate. Only the final enum crosses
# into Status; hostnames, paths, certificate subjects and fingerprints stay on
# the host.
merge_certificate_state() {
  observed_certificate_state="$1"
  case "$observed_certificate_state" in
    valid) observed_certificate_rank=1 ;;
    expiring) observed_certificate_rank=2 ;;
    expired) observed_certificate_rank=3 ;;
    missing) observed_certificate_rank=4 ;;
    *) observed_certificate_state=unknown; observed_certificate_rank=5 ;;
  esac
  if [ "$observed_certificate_rank" -gt "$certificate_rank" ]; then
    certificate_rank="$observed_certificate_rank"
    certificate="$observed_certificate_state"
  fi
}

observe_certificate_file() {
  observed_certificate_file="$1"
  if ! safe_regular_file "$observed_certificate_file" || [ ! -s "$observed_certificate_file" ]; then
    merge_certificate_state missing
  elif ! openssl x509 -in "$observed_certificate_file" -noout -checkend 0 >/dev/null 2>&1; then
    merge_certificate_state expired
  elif ! openssl x509 -in "$observed_certificate_file" -noout -checkend 2592000 >/dev/null 2>&1; then
    merge_certificate_state expiring
  else
    merge_certificate_state valid
  fi
}

tls_mode="$(read_env_value HOSPITAL_TLS_MODE 2>/dev/null || true)"
case "$tls_mode" in
  operator)
    # Strict readiness already proves this one operator certificate contains
    # both the clinical and research names; monitor its lifetime here.
    observe_certificate_file "$appliance_home/secrets/tls/fullchain.pem"
    ;;
  acme|local)
    clinical_name="$(read_env_value HOSPITAL_CLINICAL_DOMAIN 2>/dev/null || true)"
    research_name="$(read_env_value HOSPITAL_RESEARCH_DOMAIN 2>/dev/null || true)"
    https_port="$(read_env_value HOSPITAL_HTTPS_PORT 2>/dev/null || true)"; https_port="${https_port:-443}"
    if ! printf '%s\n' "$clinical_name" | grep -Eq '^[A-Za-z0-9.-]{1,253}$' \
        || ! printf '%s\n' "$research_name" | grep -Eq '^[A-Za-z0-9.-]{1,253}$' \
        || ! printf '%s\n' "$https_port" | grep -Eq '^[0-9]{1,5}$'; then
      merge_certificate_state unknown
    elif [ "$https_port" -lt 1 ] || [ "$https_port" -gt 65535 ] \
        || ! command -v timeout >/dev/null 2>&1; then
      merge_certificate_state unknown
    else
      observed_certificate_index=0
      for observed_domain in "$clinical_name" "$research_name"; do
        observed_certificate_index=$((observed_certificate_index + 1))
        live_certificate="$work/live-certificate-$observed_certificate_index.pem"
        if printf '\n' | timeout 10 openssl s_client -connect "127.0.0.1:$https_port" \
            -servername "$observed_domain" 2>/dev/null \
            | openssl x509 -outform PEM > "$live_certificate" 2>/dev/null \
            && [ -s "$live_certificate" ]; then
          observe_certificate_file "$live_certificate"
        else
          merge_certificate_state missing
        fi
      done
    fi
    ;;
  *) merge_certificate_state unknown ;;
esac

observe_certificate_file "$appliance_home/secrets/status/fallback-cert.pem"
fallback_reload_marker="$appliance_home/.data/runtime/status-fallback-certificate.reload-required"
if [ -e "$fallback_reload_marker" ] || [ -L "$fallback_reload_marker" ]; then
  # A replacement is not healthy until the independent listener is proven to
  # serve it. The renewal wrapper owns and validates the marker; this privacy-
  # safe projection needs only its presence and never reads arbitrary content.
  merge_certificate_state unknown
fi

services=unknown
service_report="$work/services"
if (cd "$root" && docker compose ps --all --format '{{.Service}}|{{.State}}|{{.Health}}') \
    > "$service_report" 2>/dev/null; then
  services=healthy
  for expected_service in delivery-worker postgres status api backup pwa web browser caddy; do
    expected_record="$(awk -F'|' -v service="$expected_service" '$1 == service { print $2 "|" $3; found += 1 } END { if (found != 1) exit 1 }' "$service_report" 2>/dev/null || true)"
    expected_state="${expected_record%%|*}"
    expected_health="${expected_record#*|}"
    if [ "$expected_state" != running ] || { [ -n "$expected_health" ] && [ "$expected_health" != healthy ]; }; then
      services=degraded
    fi
  done
fi

update_supply="$(read_env_value HOSPITAL_UPDATE_SUPPLY_MODE 2>/dev/null || true)"
[ -n "$update_supply" ] || update_supply=connected
github_release_credential=missing
ghcr_credential=missing
case "$update_supply" in
  offline)
    github_release_credential=not-required
    ghcr_credential=not-required
    ;;
  connected)
    if credential_ready "$appliance_home/secrets/registry/github-release-token" \
        '^[A-Za-z0-9_]{20,255}$' 255; then
      github_release_credential=configured
    fi
    ghcr_user_ready=0; ghcr_token_ready=0
    if credential_ready "$appliance_home/secrets/registry/ghcr-user" \
        '^[A-Za-z0-9]([A-Za-z0-9-]{0,37}[A-Za-z0-9])?$' 39; then
      ghcr_user_ready=1
    fi
    if credential_ready "$appliance_home/secrets/registry/ghcr-token" \
        '^[A-Za-z0-9_]{20,255}$' 255; then
      ghcr_token_ready=1
    fi
    [ "$ghcr_user_ready" -eq 1 ] && [ "$ghcr_token_ready" -eq 1 ] \
      && ghcr_credential=configured
    ;;
  *)
    update_supply=invalid
    ;;
esac

state_dir="$appliance_home/.data/runtime/update/state"
mkdir -p "$state_dir"
signal="$state_dir/host-observability.v1.json"
[ ! -L "$signal" ] && { [ ! -e "$signal" ] || [ -f "$signal" ]; } \
  && { [ ! -e "$signal" ] || [ "$(stat -c %h "$signal" 2>/dev/null || echo 0)" = 1 ]; } \
  || { echo HOST_OBSERVABILITY_SIGNAL_UNSAFE >&2; exit 1; }
signal_tmp="$state_dir/.host-observability.v1.json.tmp.$$"
umask 022
printf '{"schemaVersion":1,"signalType":"host-observability","observedAt":"%s","storage":"%s","clock":"%s","backup":"%s","offHostBackup":"%s","updateAgent":"%s","certificate":"%s","services":"%s","restoreLock":"%s","activationLock":"%s","updateSupply":"%s","githubReleaseCredential":"%s","ghcrCredential":"%s"}\n' \
  "$observed_at" "$storage" "$clock" "$backup" "$off_host_backup" "$update_agent" \
  "$certificate" "$services" "$restore_lock" "$activation_lock" "$update_supply" \
  "$github_release_credential" "$ghcr_credential" \
  > "$signal_tmp"
chmod 0644 "$signal_tmp"
update_durable_replace "$signal_tmp" "$signal" \
  || { echo HOST_OBSERVABILITY_SIGNAL_WRITE_FAILED >&2; exit 1; }
signal_tmp=""
echo HOST_OBSERVABILITY_PUBLISHED
