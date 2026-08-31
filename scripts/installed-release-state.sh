#!/bin/sh

# Shared, non-secret installed-release state. Do not source the state file: it
# is parsed as one strict tab-separated record so a damaged file cannot execute
# shell code.

release_state_appliance_home() {
  candidate_root="$1"
  if [ -d "$candidate_root/.lospor-home" ]; then
    (CDPATH= cd -- "$candidate_root/.lospor-home" 2>/dev/null && pwd -P)
  else
    (CDPATH= cd -- "$candidate_root" 2>/dev/null && pwd -P)
  fi
}

release_state_file() {
  printf '%s/.data/installed-release.tsv\n' "$1"
}

release_state_sync() {
  command -v sync >/dev/null 2>&1 || return 1
  sync "$1" >/dev/null 2>&1 && return 0
  case "$(uname -s 2>/dev/null || echo unknown)" in MINGW*|MSYS*|CYGWIN*) return 0 ;; esac
  return 1
}

release_lock_checksum_verify() {
  checksum_lock="$1"
  checksum_sidecar="$2"
  checksum_lock_name="$(basename "$checksum_lock")"
  checksum_sidecar_name="$(basename "$checksum_sidecar")"
  [ "$checksum_sidecar_name" = "$checksum_lock_name.sha256" ] \
    || { echo "Release-lock checksum filename is inconsistent." >&2; return 1; }
  [ -s "$checksum_lock" ] && [ -s "$checksum_sidecar" ] \
    || { echo "Release lock or checksum is missing." >&2; return 1; }
  checksum_expected_bytes=$((67 + ${#checksum_lock_name}))
  checksum_actual_bytes="$(wc -c < "$checksum_sidecar" | tr -d '[:space:]')"
  [ "$checksum_actual_bytes" = "$checksum_expected_bytes" ] \
    || { echo "Release-lock checksum is not canonical." >&2; return 1; }
  [ "$(tail -c 1 "$checksum_sidecar" | wc -l | tr -d '[:space:]')" = 1 ] \
    || { echo "Release-lock checksum is not newline-terminated." >&2; return 1; }
  release_lock_checksum_sha="$(sha256sum "$checksum_lock" | awk '{print $1}')"
  [ "$(cat "$checksum_sidecar")" = "$release_lock_checksum_sha  $checksum_lock_name" ] \
    || { echo "Release lock does not match its recorded SHA-256." >&2; return 1; }
  return 0
}

release_state_read() {
  state_home="$1"
  state_path="$(release_state_file "$state_home")"
  [ -f "$state_path" ] || return 10
  tab="$(printf '\t')"
  state_lines="$(wc -l < "$state_path" | tr -d '[:space:]')"
  [ "$state_lines" = 1 ] || { echo "Installed release state must be exactly one line." >&2; return 1; }
  awk -F '\t' 'NR == 1 && NF == 4 { ok=1 } END { exit !ok }' "$state_path" \
    || { echo "Installed release state has an unsupported field count." >&2; return 1; }
  IFS="$tab" read -r state_header state_version state_relative state_lock_sha state_extra < "$state_path" \
    || { echo "Installed release state is unreadable." >&2; return 1; }
  [ -z "${state_extra:-}" ] && [ "$state_header" = LOSPOR-HOSPITAL-INSTALLED-RELEASE-V1 ] \
    || { echo "Installed release state has an unsupported format." >&2; return 1; }
  printf '%s\n' "$state_version" | grep -Eq '^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$' \
    || { echo "Installed release version is invalid." >&2; return 1; }
  expected_relative=".data/releases/$state_version/lospor-hospital-$state_version"
  [ "$state_relative" = "$expected_relative" ] \
    || { echo "Installed release path is invalid." >&2; return 1; }
  printf '%s\n' "$state_lock_sha" | grep -Eq '^[a-f0-9]{64}$' \
    || { echo "Installed release-lock digest is invalid." >&2; return 1; }
  state_release_root="$state_home/$state_relative"
  state_release_lock="$state_release_root/.release/release.lock"
  state_release_lock_checksum="$state_release_root/.release/release.lock.sha256"
  [ -f "$state_release_root/compose.yaml" ] \
    && [ -f "$state_release_root/compose.release.yaml" ] \
    && [ -s "$state_release_lock" ] \
    && [ -s "$state_release_lock_checksum" ] \
    || { echo "Installed release files are missing." >&2; return 1; }
  release_lock_checksum_verify "$state_release_lock" "$state_release_lock_checksum" || return 1
  [ "$release_lock_checksum_sha" = "$state_lock_sha" ] \
    || { echo "Installed release lock no longer matches installed state." >&2; return 1; }
  (CDPATH= cd -- "$state_release_root" 2>/dev/null && pwd -P) >/dev/null \
    || { echo "Installed release directory is inaccessible." >&2; return 1; }
  return 0
}

release_state_apply() {
  state_home="$1"
  if release_state_read "$state_home"; then
    HOSPITAL_RELEASE="$state_version"
    COMPOSE_FILE="$state_release_root/compose.yaml:$state_release_root/compose.release.yaml"
    HOSPITAL_INSTALLED_RELEASE_LOCK="$state_release_lock"
    HOSPITAL_INSTALLED_RELEASE_LOCK_SHA256="$state_lock_sha"
    LOSPOR_APPLIANCE_HOME="$state_home"
    export HOSPITAL_RELEASE COMPOSE_FILE HOSPITAL_INSTALLED_RELEASE_LOCK
    export HOSPITAL_INSTALLED_RELEASE_LOCK_SHA256 LOSPOR_APPLIANCE_HOME
    return 0
  else
    state_result=$?
  fi
  [ "$state_result" -eq 10 ] && return 10
  return "$state_result"
}

# A verified launcher sets this short-lived environment only while it invokes
# the freshly extracted candidate.  Operational scripts must not treat the
# transition bit by itself as authorization: require every path and identity
# to point back to the candidate root that is actually executing the script.
#
# Return 10 when no transition is requested, 0 for a coherent verified
# transition, and 1 for any incomplete or inconsistent transition state.
release_state_assert_verified_transition() {
  transition_candidate_root="$1"
  [ "${HOSPITAL_RELEASE_TRANSITION:-}" = 1 ] || return 10

  transition_root="$(CDPATH= cd -- "$transition_candidate_root" 2>/dev/null && pwd -P)" \
    || { echo "Verified release transition root is inaccessible." >&2; return 1; }
  transition_lock="$transition_root/.release/release.lock"
  transition_lock_checksum="$transition_root/.release/release.lock.sha256"
  transition_compose="$transition_root/compose.yaml:$transition_root/compose.release.yaml"

  [ "${HOSPITAL_IMAGES_VERIFIED:-}" = 1 ] \
    || { echo "Verified release transition lacks image authorization." >&2; return 1; }
  release_lock_checksum_verify "$transition_lock" "$transition_lock_checksum" \
    || { echo "Verified release transition integrity files are invalid." >&2; return 1; }
  transition_lock_sha="$release_lock_checksum_sha"
  [ -f "$transition_root/compose.yaml" ] && [ -f "$transition_root/compose.release.yaml" ] \
    || { echo "Verified release transition Compose files are missing." >&2; return 1; }
  [ "${COMPOSE_FILE:-}" = "$transition_compose" ] \
    || { echo "Verified release transition Compose selection is inconsistent." >&2; return 1; }

  supplied_lock="${HOSPITAL_VERIFIED_RELEASE_LOCK:-}"
  supplied_lock_directory="$(CDPATH= cd -- "$(dirname "$supplied_lock")" 2>/dev/null && pwd -P)" \
    || { echo "Verified release transition lock path is inaccessible." >&2; return 1; }
  supplied_lock="$supplied_lock_directory/$(basename "$supplied_lock")"
  [ "$supplied_lock" = "$transition_lock" ] \
    || { echo "Verified release transition lock does not belong to this release root." >&2; return 1; }
  supplied_lock_sha="${HOSPITAL_VERIFIED_RELEASE_LOCK_SHA256:-}"
  printf '%s\n' "$supplied_lock_sha" | grep -Eq '^[a-f0-9]{64}$' \
    || { echo "Verified release transition SHA-256 is invalid or unset." >&2; return 1; }
  [ "$supplied_lock_sha" = "$transition_lock_sha" ] \
    || { echo "Verified release transition lock does not match the selected SHA-256." >&2; return 1; }

  transition_version="$(awk -F '\t' '$1 == "release" { count += 1; value = $2 } END { if (count == 1) print value }' "$transition_lock")"
  printf '%s\n' "$transition_version" | grep -Eq '^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$' \
    || { echo "Verified release transition lock has no unique valid version." >&2; return 1; }
  [ "${HOSPITAL_RELEASE:-}" = "$transition_version" ] \
    || { echo "Verified release transition version is inconsistent." >&2; return 1; }

  transition_home="$(release_state_appliance_home "$transition_root")" \
    || { echo "Verified release transition appliance home is inaccessible." >&2; return 1; }
  supplied_home="${LOSPOR_APPLIANCE_HOME:-}"
  [ -n "$supplied_home" ] \
    || { echo "Verified release transition appliance home is unset." >&2; return 1; }
  supplied_home="$(CDPATH= cd -- "$supplied_home" 2>/dev/null && pwd -P)" \
    || { echo "Verified release transition appliance home is inaccessible." >&2; return 1; }
  [ "$supplied_home" = "$transition_home" ] \
    || { echo "Verified release transition appliance home is inconsistent." >&2; return 1; }
  return 0
}

release_version_compare() {
  left="$1"; right="$2"
  awk -v left="$left" -v right="$right" 'BEGIN {
    split(left, a, "."); split(right, b, ".")
    for (i = 1; i <= 3; i++) {
      if ((a[i] + 0) < (b[i] + 0)) { print -1; exit }
      if ((a[i] + 0) > (b[i] + 0)) { print 1; exit }
    }
    print 0
  }'
}

release_state_assert_transition() {
  transition_home="$1"; target_version="$2"; target_lock="$3"
  target_sha="$(sha256sum "$target_lock" | awk '{print $1}')"
  if release_state_read "$transition_home"; then
    comparison="$(release_version_compare "$target_version" "$state_version")"
    [ "$comparison" -ge 0 ] || {
      echo "Refusing to downgrade Hospital from $state_version to $target_version." >&2
      return 1
    }
    if [ "$comparison" -eq 0 ] && [ "$target_sha" != "$state_lock_sha" ]; then
      echo "Release $target_version is already installed with a different release identity." >&2
      return 1
    fi
    if [ "$comparison" -eq 0 ]; then return 20; fi
    return 0
  else
    state_result=$?
  fi
  [ "$state_result" -eq 10 ] && return 0
  return "$state_result"
}

release_state_write() {
  write_home="$1"; write_version="$2"; write_relative="$3"; write_lock="$4"
  state_directory="$write_home/.data"
  mkdir -p "$state_directory"
  state_path="$(release_state_file "$write_home")"
  temporary="$state_path.tmp.$$"
  release_lock_checksum_verify "$write_lock" "$write_lock.sha256" || return 1
  lock_sha="$release_lock_checksum_sha"
  umask 077
  printf 'LOSPOR-HOSPITAL-INSTALLED-RELEASE-V1\t%s\t%s\t%s\n' \
    "$write_version" "$write_relative" "$lock_sha" > "$temporary"
  # Return the status of whatever actually failed rather than a flat 1. The
  # activation launcher exits with this value, so collapsing it here erases the
  # only signal an operator or the update agent gets about which durability step
  # gave way.
  if chmod 0600 "$temporary" \
    && command -v sync >/dev/null 2>&1 \
    && release_state_sync "$temporary" \
    && mv "$temporary" "$state_path" \
    && release_state_sync "$state_path" \
    && release_state_sync "$state_directory"; then
    return 0
  else
    # $? is the failing condition's status only inside the else branch; an if
    # whose condition is false and that has no else is itself a success.
    write_result=$?
  fi
  [ "$write_result" -ne 0 ] || write_result=1
  rm -f "$temporary" 2>/dev/null || true
  echo "Could not durably publish installed release state." >&2
  return "$write_result"
}

# A mutex around the update-status file.
#
# It has two writers -- check-for-update.sh and run-online-release.sh
# --fetch-only -- and each does a read-modify-write that preserves the other's
# fields. Today a human serialises them; once an agent runs the check on a clock
# they can genuinely overlap, and an operator running the check by hand during a
# fetch would silently drop the field that says a release is downloaded, making
# a staged update look unavailable.
#
# mkdir is the mutex because it is atomic and leaves nothing to clean up but
# itself. A holder that dies leaves the directory behind, so anything older than
# a minute is broken open: every write here takes milliseconds.
release_state_lock_update_status() {
  lock_home="$1"
  lock_directory="$lock_home/.data/update-status.lock"
  mkdir -p "$lock_home/.data"
  lock_attempt=0
  while ! mkdir "$lock_directory" 2>/dev/null; do
    lock_attempt=$((lock_attempt + 1))
    if [ -n "$(find "$lock_directory" -maxdepth 0 -mmin +1 2>/dev/null)" ]; then
      rmdir "$lock_directory" 2>/dev/null || true
      continue
    fi
    [ "$lock_attempt" -lt 30 ] || {
      echo "Timed out waiting for the update-status lock." >&2
      return 1
    }
    sleep 1
  done
  return 0
}

release_state_unlock_update_status() {
  rmdir "$1/.data/update-status.lock" 2>/dev/null || true
}

# How many of this release's services are actually running?
#
# Matched on the compose working-directory label rather than a project name,
# because the project name depends on COMPOSE_PROJECT_NAME or the directory
# basename, and neither is reliable from here. The label is written by Compose
# itself and names the exact release root.
release_state_running_service_count() {
  docker ps -q \
    --filter "label=com.docker.compose.project.working_dir=$1" 2>/dev/null \
    | grep -c . || true
}

# Recreate and start an installed release whose containers are gone.
#
# Re-running a launcher against an already-installed release used to print
# "already installed" and exit 0 with nothing running: an operator whose
# containers had been removed -- `docker system prune -a` on a host short of
# disk removes stopped ones -- got a success message on a dead appliance, and
# no supported command would start it again. The short-circuit happened before
# activation, so even a custom command could not reach the stack.
#
# Recreating is safe: containers hold no state. The database, secrets, backups
# and reference data live in volumes and the appliance home, and this is the
# same recreate step every update already performs. Images have been verified
# against the release lock by the caller before this runs.
release_state_start_installed_services() {
  start_home="$1"
  start_root="$2"
  start_version="$3"
  start_lock="$4"
  start_lock_sha="$5"

  HOSPITAL_RELEASE="$start_version" \
  HOSPITAL_IMAGES_VERIFIED=1 \
  HOSPITAL_VERIFIED_RELEASE_LOCK="$start_lock" \
  HOSPITAL_VERIFIED_RELEASE_LOCK_SHA256="$start_lock_sha" \
  COMPOSE_FILE="$start_root/compose.yaml:$start_root/compose.release.yaml" \
    docker compose up -d --remove-orphans || return 1

  [ "$(release_state_running_service_count "$start_root")" -gt 0 ] || return 1
  return 0
}
