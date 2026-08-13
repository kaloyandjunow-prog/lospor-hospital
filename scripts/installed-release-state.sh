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

release_state_read() {
  state_home="$1"
  state_path="$(release_state_file "$state_home")"
  [ -f "$state_path" ] || return 10
  tab="$(printf '\t')"
  state_lines="$(wc -l < "$state_path" | tr -d '[:space:]')"
  [ "$state_lines" = 1 ] || { echo "Installed release state must be exactly one line." >&2; return 1; }
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
  [ -f "$state_release_root/compose.yaml" ] \
    && [ -f "$state_release_root/compose.release.yaml" ] \
    && [ -s "$state_release_lock" ] \
    || { echo "Installed release files are missing." >&2; return 1; }
  actual_lock_sha="$(sha256sum "$state_release_lock" | awk '{print $1}')"
  [ "$actual_lock_sha" = "$state_lock_sha" ] \
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
    LOSPOR_APPLIANCE_HOME="$state_home"
    export HOSPITAL_RELEASE COMPOSE_FILE HOSPITAL_INSTALLED_RELEASE_LOCK LOSPOR_APPLIANCE_HOME
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
  transition_signature="$transition_root/.release/release.lock.sig"
  transition_public_key="$transition_root/.release/trusted-public-key.pem"
  transition_compose="$transition_root/compose.yaml:$transition_root/compose.release.yaml"

  [ "${HOSPITAL_IMAGES_VERIFIED:-}" = 1 ] \
    || { echo "Verified release transition lacks image authorization." >&2; return 1; }
  [ -s "$transition_lock" ] && [ -s "$transition_signature" ] && [ -s "$transition_public_key" ] \
    || { echo "Verified release transition trust files are missing." >&2; return 1; }
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
      echo "Release $target_version is already installed with a different signed identity." >&2
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
  lock_sha="$(sha256sum "$write_lock" | awk '{print $1}')"
  umask 077
  printf 'LOSPOR-HOSPITAL-INSTALLED-RELEASE-V1\t%s\t%s\t%s\n' \
    "$write_version" "$write_relative" "$lock_sha" > "$temporary"
  mv "$temporary" "$state_path"
}
