#!/bin/sh
set -eu

# The host-side update agent.
#
# Status can ask for an update; it cannot apply one. It runs unprivileged, has
# no docker socket, and mounts the signals directory read-only -- which is what
# makes a control reachable from a browser safe to offer at all. So it writes a
# request into a directory on the host and this loop, which does have the
# authority, decides whether to act on it.
#
# It has to run on the host rather than in a container: applying a release runs
# `docker compose down`, and a clock inside a container cannot supervise its own
# restart.
#
# Deliberately the same construction as infra/delivery/worker-loop.sh -- a fast
# outer sleep with slower inner clocks gated by stamp files -- because that
# shape is already used twice here and is understood.
#
# Three rules, each preventing a specific harm. They are not refactors waiting
# to happen:
#
#   Never remove release-activation.lock. It means both "in progress" and "a
#   rollback did not finish", and only a person can tell which. Clearing it
#   automatically would let the agent start a second attempt on top of a
#   half-applied release.
#
#   Never retry an apply. One request, one attempt, one terminal outcome. An
#   agent that retries across a reboot turns one operator's intent into two
#   attempts on a clinical database.
#
#   Refuse to act on a backward clock. Everything here is time-based -- the
#   maintenance window, the stamps, request expiry -- so if the agent sees its
#   own last stamp in the future it stops rather than guessing.

root="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd -P)"
. "$root/scripts/installed-release-state.sh"

appliance_home="$(release_state_appliance_home "$root")"
runtime="$appliance_home/.data/runtime"
requests_dir="$runtime/update/requests"
state_dir="$runtime/update/state"
signals_dir="$state_dir"
inflight_dir="$state_dir/inflight"
ledger="$state_dir/applied-requests.tsv"
marker="$state_dir/update-agent.v1.json"
clock_stamp="$state_dir/agent-last-tick"
check_stamp="$state_dir/last-update-check"
activation_lock="$appliance_home/.data/release-activation.lock"

mkdir -p "$requests_dir" "$inflight_dir"

poll="${HOSPITAL_UPDATE_AGENT_POLL_SECONDS:-15}"
check_interval="${HOSPITAL_UPDATE_CHECK_INTERVAL_SECONDS:-86400}"
window_start="${HOSPITAL_UPDATE_WINDOW_START:-20:00}"
window_end="${HOSPITAL_UPDATE_WINDOW_END:-06:00}"
# How long a finished or failed update stays on the page before the agent
# goes quiet again.
terminal_decay="${HOSPITAL_UPDATE_TERMINAL_DECAY_SECONDS:-1800}"

for value in "$poll" "$check_interval"; do
  case "$value" in ''|*[!0-9]*) echo UPDATE_AGENT_INTERVAL_INVALID >&2; exit 2 ;; esac
done
[ "$poll" -ge 5 ] || { echo UPDATE_AGENT_INTERVAL_INVALID >&2; exit 2; }

# The release this loop was started from. `current` is a symlink the activation
# moves, so when it moves the running agent is stale: it exits 0 and systemd's
# Restart=always brings it back from the new path. That is how a release ships
# a fix to the agent that applied it.
started_from="$(readlink "$appliance_home/.data/current" 2>/dev/null || echo unknown)"

now_utc() { date -u +%Y-%m-%dT%H:%M:%SZ; }
now_epoch() { date -u +%s; }

# ── the agent's own signal ───────────────────────────────────────────────────

write_marker() {
  phase="$1"; code="${2:-}"; target="${3:-}"; scheduled="${4:-}"
  temporary="$marker.tmp.$$"
  {
    printf '{"schemaVersion":1,"signalType":"update-agent","observedAt":"%s","phase":"%s"' \
      "$(now_utc)" "$phase"
    [ -z "$target" ]    || printf ',"targetVersion":"%s"' "$target"
    [ -z "$code" ]      || printf ',"resultCode":"%s"' "$code"
    [ -z "$scheduled" ] || printf ',"scheduledFor":"%s"' "$scheduled"
    printf '}\n'
  } > "$temporary"
  mv "$temporary" "$marker"
}

# ── the three rules ──────────────────────────────────────────────────────────

clock_went_backwards() {
  [ -f "$clock_stamp" ] || return 1
  last="$(cat "$clock_stamp" 2>/dev/null || echo 0)"
  case "$last" in ''|*[!0-9]*) return 1 ;; esac
  # A minute of slack: NTP correcting a small drift is not a backward clock.
  [ "$last" -gt "$(( $(now_epoch) + 60 ))" ]
}

# ── the maintenance window ───────────────────────────────────────────────────
#
# Read here and never by Status, so the window cannot be widened from the web
# page. Applying an update restarts the clinical stack and may run a one-way
# migration; both are clinical events, and a button reachable from any
# allowlisted address is a different thing from a technician at a console.

minutes_of() { printf '%s' "$1" | awk -F: '{print ($1 * 60) + $2}'; }

inside_window() {
  now_minutes="$(date +%H:%M | awk -F: '{print ($1 * 60) + $2}')"
  start="$(minutes_of "$window_start")"
  end="$(minutes_of "$window_end")"
  if [ "$start" -le "$end" ]; then
    [ "$now_minutes" -ge "$start" ] && [ "$now_minutes" -lt "$end" ]
  else
    # The ordinary case: the window crosses midnight.
    [ "$now_minutes" -ge "$start" ] || [ "$now_minutes" -lt "$end" ]
  fi
}

next_window_opening() {
  # When a queued request will run, so the page can name a time rather than
  # saying "later". Today if the window has not opened yet, otherwise tomorrow.
  opening="$window_start"
  now_minutes="$(date +%H:%M | awk -F: '{print ($1 * 60) + $2}')"
  if [ "$now_minutes" -lt "$(minutes_of "$opening")" ]; then
    date -u -d "today $opening" +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || now_utc
  else
    date -u -d "tomorrow $opening" +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || now_utc
  fi
}

# ── requests ─────────────────────────────────────────────────────────────────

read_field() {
  # A request is small, flat JSON written by Status. Read one string field
  # without a JSON parser, and refuse anything that is not the shape expected --
  # this runs as root, so it treats the file as untrusted input.
  sed -n "s/.*\"$2\"[[:space:]]*:[[:space:]]*\"\([^\"]*\)\".*/\1/p" "$1" | head -n 1
}

already_applied() {
  [ -f "$ledger" ] || return 1
  cut -f 1 "$ledger" 2>/dev/null | grep -Fxq "$1"
}

record_applied() {
  printf '%s\t%s\t%s\t%s\n' "$1" "$2" "$3" "$(now_utc)" >> "$ledger"
}

handle_request() {
  request="$1"
  request_id="$(read_field "$request" requestId)"
  target_version="$(read_field "$request" targetVersion)"
  target_sha="$(read_field "$request" targetLockSha256)"
  expected_version="$(read_field "$request" expectedInstalledVersion)"
  expires_at="$(read_field "$request" expiresAt)"
  session_kind="$(read_field "$request" sessionKind)"
  window_mode="$(read_field "$request" window)"

  # Consumed before anything else happens. rename() is atomic, so if two ticks
  # ever overlap only one of them has a request at all, and the file is gone
  # either way -- there is nothing left to retry.
  consumed="$inflight_dir/$(basename "$request")"
  mv "$request" "$consumed" 2>/dev/null || return 0

  refuse() {
    write_marker failed "$1" "${target_version:-}"
    record_applied "${request_id:-unknown}" "${target_version:-unknown}" "$1"
    rm -f "$consumed"
    return 0
  }

  case "$request_id" in
    [0-9a-f]*) [ "${#request_id}" -eq 32 ] || { refuse UPDATE_REQUEST_MALFORMED; return 0; } ;;
    *) refuse UPDATE_REQUEST_MALFORMED; return 0 ;;
  esac
  printf '%s' "$target_sha" | grep -Eq '^[a-f0-9]{64}$' \
    || { refuse UPDATE_REQUEST_MALFORMED; return 0; }

  # A recovery session is break-glass for someone who has lost the password.
  # The one thing it must do is fix the credential; restarting the clinical
  # stack is not that. Checked here as well as in Status so a compromised
  # Status cannot promote itself by lying about the session.
  [ "$session_kind" = password ] || { refuse UPDATE_REQUEST_SESSION_KIND; return 0; }

  already_applied "$request_id" && { refuse UPDATE_REQUEST_REPLAYED; return 0; }

  if [ -n "$expires_at" ]; then
    expiry="$(date -u -d "$expires_at" +%s 2>/dev/null || echo 0)"
    [ "$expiry" -gt "$(now_epoch)" ] || { refuse UPDATE_REQUEST_EXPIRED; return 0; }
  fi

  # The layer that actually matters. Even if consumption and the ledger both
  # failed, a replay is arithmetically dead: the request names the version it
  # believed was installed, and release_state_assert_transition already refuses
  # a downgrade and a same-identity reapplication.
  if release_state_read "$appliance_home"; then
    [ "$state_version" = "$expected_version" ] \
      || { refuse UPDATE_REQUEST_STALE; return 0; }
  fi

  # Never on top of a lock. It means either an apply is running or a rollback
  # did not finish, and only the second matters -- but only a person can tell
  # which, so the agent stops either way.
  if [ -e "$activation_lock" ]; then
    write_marker needs-operator UPDATE_ACTIVATION_LOCK_PRESENT "$target_version"
    rm -f "$consumed"
    return 0
  fi

  if [ "$window_mode" != override ] && ! inside_window; then
    # Accepted and waiting, not refused. An operator who clicks at two in the
    # afternoon has succeeded; the page tells them when it will happen.
    write_marker queued UPDATE_QUEUED "$target_version" "$(next_window_opening)"
    mv "$consumed" "$request" 2>/dev/null || true
    return 0
  fi

  write_marker preparing UPDATE_PREPARING "$target_version"
  record_applied "$request_id" "$target_version" ATTEMPTED

  write_marker applying UPDATE_APPLYING "$target_version"
  set +e
  ( cd "$root" && sh scripts/update.sh ) >"$state_dir/last-apply.log" 2>&1
  applied=$?
  set -e

  rm -f "$consumed"
  if [ "$applied" -eq 0 ]; then
    write_marker completed UPDATE_COMPLETED "$target_version"
    # Re-check immediately so the release row stops advertising an update that
    # has just been applied.
    rm -f "$check_stamp"
  elif [ -e "$activation_lock" ]; then
    write_marker needs-operator UPDATE_ROLLBACK_INCOMPLETE "$target_version"
  else
    write_marker failed UPDATE_APPLY_FAILED "$target_version"
  fi
}

# ── the slow clock ───────────────────────────────────────────────────────────

check_due() {
  [ -f "$check_stamp" ] || return 0
  last="$(cat "$check_stamp" 2>/dev/null || echo 0)"
  case "$last" in ''|*[!0-9]*) return 0 ;; esac
  [ "$(( $(now_epoch) - last ))" -ge "$check_interval" ]
}

run_check() {
  now_epoch > "$check_stamp"
  set +e
  ( cd "$root" && sh scripts/check-for-update.sh --quiet ) >/dev/null 2>&1
  set -e
}

# ── the loop ─────────────────────────────────────────────────────────────────

while true; do
  if clock_went_backwards; then
    write_marker needs-operator UPDATE_AGENT_CLOCK_BACKWARDS
    echo "UPDATE_AGENT_CLOCK_BACKWARDS" >&2
    exit 1
  fi
  now_epoch > "$clock_stamp"

  # The release moved underneath this process, so this copy of the agent is the
  # old one. Exiting 0 lets Restart=always bring back the version that shipped
  # with the release now running.
  current_now="$(readlink "$appliance_home/.data/current" 2>/dev/null || echo unknown)"
  if [ "$current_now" != "$started_from" ]; then
    echo "UPDATE_AGENT_RELEASE_CHANGED" >&2
    exit 0
  fi

  handled=0
  for request in "$requests_dir"/apply.request.v1.json; do
    [ -e "$request" ] || continue
    handle_request "$request"
    handled=1
  done

  if [ "$handled" -eq 0 ]; then
    # A terminal outcome has to survive long enough to be read. The page
    # refreshes every fifteen seconds, so overwriting "completed" on the next
    # tick would mean nobody ever sees how their update ended -- and "failed"
    # would vanish faster than the person who caused it could look.
    #
    # queued and needs-operator are not terminal and never decay: one is waiting
    # for the window, the other for a person.
    case "$(read_field "$marker" phase 2>/dev/null || echo idle)" in
      queued|needs-operator) ;;
      completed|failed)
        observed="$(read_field "$marker" observedAt 2>/dev/null || echo '')"
        seen="$(date -u -d "$observed" +%s 2>/dev/null || echo 0)"
        if [ "$(( $(now_epoch) - seen ))" -ge "$terminal_decay" ]; then
          write_marker idle UPDATE_AGENT_READY
        fi
        ;;
      *) write_marker idle UPDATE_AGENT_READY ;;
    esac
  fi

  if check_due; then run_check; fi

  sleep "$poll"
done
