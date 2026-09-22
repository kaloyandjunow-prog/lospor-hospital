#!/bin/sh
set -eu

root="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd -P)"
. "$root/scripts/installed-release-state.sh"
. "$root/scripts/operator-locale.sh"
. "$root/scripts/update-pipeline-lib.sh"
appliance_home="$(release_state_appliance_home "$root")"
operator_locale_load "$appliance_home"
lock_dir="$appliance_home/.data/release-activation.lock"
journal="$lock_dir/journal.v1.tsv"
command="${1:-inspect}"
confirmation="${2:-}"
case "$command" in inspect|resume-rollback|verify-and-clear) ;; *) operator_error "Usage: recover-release-activation.sh [inspect|resume-rollback --confirm|verify-and-clear --confirm-clear]" "Употреба: recover-release-activation.sh [inspect|resume-rollback --confirm|verify-and-clear --confirm-clear]"; exit 2 ;; esac

read_journal() {
  # Set when this function has already named the exact failure, so the caller
  # does not paper over it with a vaguer message.
  journal_reported=0
  [ -d "$lock_dir" ] && [ ! -L "$lock_dir" ] && [ -f "$journal" ] && [ ! -L "$journal" ] \
    || { operator_error "No supported activation journal is present." "Няма поддържан дневник за активиране."; journal_reported=1; return 1; }
  [ "$(wc -l < "$journal" | tr -d '[:space:]')" = 1 ] \
    && [ "$(wc -c < "$journal" | tr -d '[:space:]')" -le 4096 ] \
    || { operator_error "The activation journal is malformed." "Дневникът за активиране е невалиден."; journal_reported=1; return 1; }
  awk -F '\t' 'NR == 1 && NF == 15 { ok=1 } END { exit !ok }' "$journal" \
    || { operator_error "The activation journal has an unsupported field count." "Дневникът за активиране има неподдържан брой полета."; journal_reported=1; return 1; }
  tab="$(printf '\t')"
  IFS="$tab" read -r journal_header journal_epoch journal_phase journal_boot journal_pid \
    journal_process_start journal_old_version journal_old_root journal_old_sha \
    journal_candidate_version journal_candidate_root journal_candidate_sha \
    journal_policy journal_backup journal_doctor journal_extra < "$journal" || return 1
  [ -z "${journal_extra:-}" ] && [ "$journal_header" = LOSPOR-HOSPITAL-ACTIVATION-JOURNAL-V1 ] || return 1
  update_valid_epoch "$journal_epoch" || return 1
  printf '%s\n' "$journal_pid" | grep -Eq '^[0-9]{1,10}$' || return 1
  printf '%s\n' "$journal_process_start" | grep -Eq '^[0-9]{1,20}$' || return 1
  printf '%s\n' "$journal_boot" | grep -Eq '^(unknown|[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})$' || return 1
  case "$journal_phase" in LOCKED|CANDIDATE_STAGED|PRE_MUTATION_VERIFIED|MUTATION_STARTED|CANDIDATE_SUCCEEDED|STATE_COMMITTED|CURRENT_SWITCHED|VERIFIED|ROLLBACK_STARTED|ROLLBACK_VERIFIED|ROLLBACK_INCOMPLETE|BACKUP_RECOVERY_REQUIRED) ;; *) return 1 ;; esac
  printf '%s\n' "$journal_candidate_version" | grep -Eq '^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$' || return 1
  printf '%s\n' "$journal_candidate_sha" | grep -Eq '^[a-f0-9]{64}$' || return 1
  [ "$journal_candidate_root" = "$appliance_home/.data/releases/$journal_candidate_version/lospor-hospital-$journal_candidate_version" ] || return 1
  case "$journal_policy" in service-compatible|backup-required|-) ;; *) return 1 ;; esac
  case "$journal_doctor" in -|passed|failed) ;; *) return 1 ;; esac
  case "$journal_old_version" in
    -) [ "$journal_old_root" = - ] && [ "$journal_old_sha" = - ] || return 1 ;;
    *)
      printf '%s\n' "$journal_old_version" | grep -Eq '^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$' || return 1
      [ "$journal_old_root" = "$appliance_home/.data/releases/$journal_old_version/lospor-hospital-$journal_old_version" ] || return 1
      printf '%s\n' "$journal_old_sha" | grep -Eq '^[a-f0-9]{64}$' || return 1
      ;;
  esac
  printf '%s\n' "$journal_backup" | grep -Eq '^(-|invalid|lospor-[A-Za-z0-9._-]{1,180})$' || return 1
  if [ "$journal_backup" = - ]; then
    backup_record="$lock_dir/pre-update-backup"
    case "$journal_phase" in
      MUTATION_STARTED|CANDIDATE_SUCCEEDED|STATE_COMMITTED|CURRENT_SWITCHED|ROLLBACK_STARTED|ROLLBACK_INCOMPLETE|BACKUP_RECOVERY_REQUIRED)
        if [ -f "$backup_record" ] && [ ! -L "$backup_record" ] \
          && [ "$(stat -c %h "$backup_record" 2>/dev/null || echo 0)" = 1 ] \
          && [ "$(wc -l < "$backup_record" | tr -d '[:space:]')" = 1 ]; then
          recorded_backup="$(cat "$backup_record")"
          printf '%s\n' "$recorded_backup" | grep -Eq '^lospor-[A-Za-z0-9._-]{1,180}$' || return 1
          journal_backup="$recorded_backup"
        fi
        ;;
    esac
  fi
}

process_active() {
  current_boot="$(cat /proc/sys/kernel/random/boot_id 2>/dev/null || echo unknown)"
  [ "$journal_boot" = "$current_boot" ] || return 1
  [ -r "/proc/$journal_pid/stat" ] || return 1
  current_start="$(awk '{print $22}' "/proc/$journal_pid/stat" 2>/dev/null || echo -)"
  [ "$current_start" = "$journal_process_start" ]
}

rewrite_journal() {
  phase="$1"; doctor="$2"
  temporary="$journal.tmp.$$"
  boot="$(cat /proc/sys/kernel/random/boot_id 2>/dev/null || echo unknown)"
  process_start="$(awk '{print $22}' "/proc/$$/stat" 2>/dev/null || echo 0)"
  umask 077
  printf 'LOSPOR-HOSPITAL-ACTIVATION-JOURNAL-V1\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\n' \
    "$(date -u +%s)" "$phase" "$boot" "$$" "$process_start" "$journal_old_version" \
    "$journal_old_root" "$journal_old_sha" "$journal_candidate_version" "$journal_candidate_root" \
    "$journal_candidate_sha" "$journal_policy" "$journal_backup" "$doctor" > "$temporary"
  chmod 0600 "$temporary"
  update_durable_replace "$temporary" "$journal"
  read_journal
}

verify_backup_recovery_proof() {
  backup_root="$appliance_home/backups"
  backup_object="$backup_root/$journal_backup"
  backup_library="$state_release_root/infra/postgres/backup-object-lib.sh"
  [ -f "$appliance_home/.env" ] && [ ! -L "$appliance_home/.env" ] \
    && [ -f "$backup_library" ] && [ ! -L "$backup_library" ] \
    || return 1
  [ "$(grep -Ec '^HOSPITAL_BACKUP_MANIFEST_HMAC_KEY=' "$appliance_home/.env")" = 1 ] \
    || return 1
  raw_manifest_hmac="$(sed -n 's/^HOSPITAL_BACKUP_MANIFEST_HMAC_KEY=//p' "$appliance_home/.env" | tr -d '\r')"
  [ "$(printf '%s' "$raw_manifest_hmac" | wc -c | tr -d '[:space:]')" -le 512 ] || return 1
  case "$raw_manifest_hmac" in
    \"*\") HOSPITAL_BACKUP_MANIFEST_HMAC_KEY="${raw_manifest_hmac#\"}"; HOSPITAL_BACKUP_MANIFEST_HMAC_KEY="${HOSPITAL_BACKUP_MANIFEST_HMAC_KEY%\"}" ;;
    *\"*) return 1 ;;
    *) HOSPITAL_BACKUP_MANIFEST_HMAC_KEY="$raw_manifest_hmac" ;;
  esac
  [ "${#HOSPITAL_BACKUP_MANIFEST_HMAC_KEY}" -ge 32 ] || return 1
  HOSPITAL_BACKUP_DIR="$backup_root"
  export HOSPITAL_BACKUP_MANIFEST_HMAC_KEY HOSPITAL_BACKUP_DIR
  . "$backup_library"
  backup_verify_object "$backup_object" integrity || return 1
  [ "$(basename "$backup_verified_object")" = "$journal_backup" ] \
    && [ "$backup_manifest_kind" = pre-update ] \
    && [ "$backup_manifest_release" = "$journal_old_version" ] \
    || return 1
  backup_read_last_verified \
    && [ "$(basename "$backup_last_object")" = "$journal_backup" ] \
    || return 1

  restore_journal_root="$backup_root/.restore-journal"
  [ -d "$restore_journal_root" ] && [ ! -L "$restore_journal_root" ] || return 1
  restore_proof_count=0
  for restore_journal in "$restore_journal_root"/restore-*.journal; do
    [ -e "$restore_journal" ] || continue
    [ -f "$restore_journal" ] && [ ! -L "$restore_journal" ] || return 1
    # The mode token is restore-backup.sh's own flag name, `in-place` -- the
    # mode whose typed confirmation is "EMERGENCY RESTORE <site> <timestamp>".
    # This gate used to demand `mode=emergency`, a token no code path writes:
    # restore_mode is only ever temporary, drill or in-place. That made the one
    # supported recovery from BACKUP_RECOVERY_REQUIRED unreachable, so a
    # backup-required release that failed after its pre-update backup was taken
    # locked the appliance permanently -- resume-rollback refuses such a
    # release, and verify-and-clear could never be satisfied.
    if grep -Eq "^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z phase=COMPLETE result=PASSED object=${journal_backup} mode=in-place$" "$restore_journal"; then
      restore_proof_count=$((restore_proof_count + 1))
    fi
  done
  [ "$restore_proof_count" -ge 1 ]
}

# read_journal has already said which check failed, and says so precisely: no
# journal present, malformed, wrong field count. Adding "failed strict
# validation" on top of that replaced a precise diagnosis with a vaguer one,
# and a misleading one -- an operator told the journal failed validation looks
# for a corrupt journal, when the common case is that there is no lock at all
# and nothing is wrong. Only speak here when read_journal did not.
read_journal || {
  [ "$journal_reported" = 1 ] \
    || operator_error "The activation journal failed strict validation." "Дневникът за активиране не премина строгата проверка."
  exit 1
}

if [ "$command" = inspect ]; then
  active=no; process_active && active=yes
  operator_say "Activation phase: $journal_phase" "Етап на активирането: $journal_phase"
  operator_say "Candidate: $journal_candidate_version (sha256:$journal_candidate_sha)" "Кандидат: $journal_candidate_version (sha256:$journal_candidate_sha)"
  operator_say "Prior release: $journal_old_version" "Предишна версия: $journal_old_version"
  operator_say "Rollback policy: $journal_policy" "Политика за връщане: $journal_policy"
  operator_say "Pre-update backup: $journal_backup" "Архив преди обновяването: $journal_backup"
  operator_say "Original activation process still active: $active" "Първоначалният процес за активиране още работи: $active"
  # Why it stopped, not only that it stopped. Inspect is the command the
  # documentation sends an operator to first, and it described the state
  # exactly while never mentioning that the reason was written down.
  latest_apply_log="$(ls -1t "$appliance_home/.data/update-private"/apply-*.log 2>/dev/null | head -n 1 || true)"
  if [ -n "$latest_apply_log" ] && [ -f "$latest_apply_log" ]; then
    operator_say "Why it stopped, from $latest_apply_log:" "Защо спря, според $latest_apply_log:"
    tail -n 12 "$latest_apply_log" 2>/dev/null | sed "s/^/  /" || true
  fi
  operator_say "Nothing was changed. Use the supported recovery command only after reviewing this state." "Нищо не е променено. Използвайте поддържаната команда за възстановяване само след преглед на това състояние."
  exit 0
fi

process_active && { operator_error "The activation process is still running; recovery is refused." "Процесът за активиране още работи; възстановяването е отказано."; exit 1; }

if [ "$command" = resume-rollback ]; then
  [ "$confirmation" = --confirm ] || { operator_error "Re-run with --confirm after inspecting the journal." "След преглед на дневника изпълнете отново с --confirm."; exit 2; }
  [ "$journal_policy" = service-compatible ] \
    || { operator_error "This release requires verified-backup recovery; service rollback is not supported." "Тази версия изисква възстановяване от проверен архив; връщане само на услугите не се поддържа."; exit 1; }
  [ "$journal_old_version" != - ] && [ -s "$lock_dir/installed-release.before.tsv" ] \
    || { operator_error "The exact prior release snapshot is missing." "Липсва точната снимка на предишната версия."; exit 1; }
  expected_state="LOSPOR-HOSPITAL-INSTALLED-RELEASE-V1${tab}${journal_old_version}${tab}.data/releases/$journal_old_version/lospor-hospital-$journal_old_version${tab}${journal_old_sha}"
  [ "$(cat "$lock_dir/installed-release.before.tsv")" = "$expected_state" ] \
    || { operator_error "The prior release snapshot disagrees with the journal." "Снимката на предишната версия не съвпада с дневника."; exit 1; }
  [ -s "$journal_old_root/.release/release.lock" ] \
    && [ "$(sha256sum "$journal_old_root/.release/release.lock" | awk '{print $1}')" = "$journal_old_sha" ] \
    || { operator_error "The prior release lock is missing or changed." "Заключващият файл на предишната версия липсва или е променен."; exit 1; }
  rewrite_journal ROLLBACK_STARTED -
  state_tmp="$appliance_home/.data/installed-release.recovery.$$"
  current_tmp="$appliance_home/.data/current.recovery.$$"
  cleanup_tmp() { rm -f "$state_tmp" "$current_tmp"; }
  trap cleanup_tmp EXIT HUP INT TERM
  cp "$lock_dir/installed-release.before.tsv" "$state_tmp"
  chmod 0600 "$state_tmp"
  update_durable_replace "$state_tmp" "$(release_state_file "$appliance_home")"
  ln -s "$journal_old_root" "$current_tmp"
  mv -Tf "$current_tmp" "$appliance_home/current"
  update_sync_path "$appliance_home"
  sh "$journal_old_root/scripts/verify-loaded-release-images.sh" "$journal_old_root/.release/release.lock" restore-tags
  HOSPITAL_RELEASE="$journal_old_version" HOSPITAL_IMAGES_VERIFIED=1 \
    HOSPITAL_VERIFIED_RELEASE_LOCK="$journal_old_root/.release/release.lock" \
    HOSPITAL_VERIFIED_RELEASE_LOCK_SHA256="$journal_old_sha" \
    COMPOSE_FILE="$journal_old_root/compose.yaml:$journal_old_root/compose.release.yaml" \
      docker compose up -d --force-recreate
  (cd "$journal_old_root" && sh scripts/doctor.sh)
  release_state_read "$appliance_home"
  current="$(CDPATH= cd -- "$appliance_home/current" && pwd -P)"
  [ "$state_version" = "$journal_old_version" ] && [ "$state_lock_sha" = "$journal_old_sha" ] \
    && [ "$current" = "$journal_old_root" ] || { operator_error "Rollback verification failed." "Проверката след връщането е неуспешна."; exit 1; }
  rewrite_journal ROLLBACK_VERIFIED passed
  trap - EXIT HUP INT TERM
  cleanup_tmp
  operator_say "The exact prior services are restored and healthy. The lock remains until verify-and-clear is confirmed." "Точните предишни услуги са възстановени и работят. Заключването остава, докато не потвърдите verify-and-clear."
  exit 0
fi

[ "$confirmation" = --confirm-clear ] || { operator_error "Re-run with --confirm-clear after inspecting and verifying recovery." "След преглед и проверка на възстановяването изпълнете отново с --confirm-clear."; exit 2; }

# A first installation that never committed leaves no release to inspect at all.
#
# This is reachable by simply interrupting a first install -- a Ctrl+C or a
# power cut during migrations -- and it used to be unrecoverable: every later
# install refused with "a prior activation needs operator review", while
# verify-and-clear died below on the missing `current` link and resume-rollback
# refused because a first install has no backup by definition. The only way out
# was deleting the lock by hand, on an appliance that had not been touched.
#
# Clearing here is safe precisely because nothing exists to be inconsistent
# with: there is no current link, no installed-release state, and the journal
# records no prior identity. The appliance is exactly as it was before the
# attempt -- uninstalled.
if [ "$journal_old_sha" = - ] \
  && [ ! -e "$appliance_home/current" ] \
  && [ ! -s "$(release_state_file "$appliance_home")" ]; then
  case "$journal_phase" in
    LOCKED|CANDIDATE_STAGED|PRE_MUTATION_VERIFIED|MUTATION_STARTED|BACKUP_RECOVERY_REQUIRED|ROLLBACK_STARTED|ROLLBACK_INCOMPLETE)
      clear_uninstalled=1
      ;;
    *)
      operator_error "The journal records a committed phase but no installed release remains." "Дневникът записва потвърден етап, но не остава инсталирана версия."
      exit 1
      ;;
  esac
else
  clear_uninstalled=0
fi

if [ "${clear_uninstalled:-0}" -eq 0 ]; then
release_state_read "$appliance_home"
current="$(CDPATH= cd -- "$appliance_home/current" 2>/dev/null && pwd -P)" \
  || { operator_error "The current release link is inaccessible." "Връзката към текущата версия не е достъпна."; exit 1; }
[ "$current" = "$state_release_root" ] || { operator_error "Installed state and current release disagree." "Инсталираното състояние и текущата версия не съвпадат."; exit 1; }
case "$state_lock_sha" in
  "$journal_old_sha")
    case "$journal_phase" in
      LOCKED|CANDIDATE_STAGED|PRE_MUTATION_VERIFIED|ROLLBACK_VERIFIED) ;;
      MUTATION_STARTED|CANDIDATE_SUCCEEDED|ROLLBACK_STARTED|ROLLBACK_INCOMPLETE|BACKUP_RECOVERY_REQUIRED)
        # A candidate that failed before update.sh recorded a pre-update backup
        # never reached the database: taking and verifying that backup is
        # update.sh's first step, and the object name is written into the lock
        # at that point. So "no backup recorded" is itself the evidence that
        # nothing was mutated -- and demanding a restore proof for a restore
        # that was never needed left the appliance permanently flagged
        # unhealthy with no supported way out. Most likely trigger: the backup
        # step failing, which is exactly when recovery must work.
        #
        # The prior identity is still installed and current (proved by this
        # case arm and the check above), and the recorded snapshot must still
        # agree with the journal, so the appliance is demonstrably on the
        # release it started from.
        if [ "$journal_backup" = - ]; then
          expected_before="LOSPOR-HOSPITAL-INSTALLED-RELEASE-V1${tab}${journal_old_version}${tab}.data/releases/$journal_old_version/lospor-hospital-$journal_old_version${tab}${journal_old_sha}"
          [ -s "$lock_dir/installed-release.before.tsv" ] \
            && [ "$(cat "$lock_dir/installed-release.before.tsv")" = "$expected_before" ] \
            || { operator_error "No pre-update backup was recorded and the prior release snapshot does not prove the appliance is unchanged." "Не е записан архив преди обновяването и снимката на предишната версия не доказва, че системата е непроменена."; exit 1; }
        else
          [ "$journal_policy" = backup-required ] \
            && [ "$journal_backup" != invalid ] \
            && verify_backup_recovery_proof \
            || { operator_error "The recorded pre-update backup and completed emergency restore cannot be proved." "Записаният архив преди обновяването и завършеното аварийно възстановяване не могат да бъдат доказани."; exit 1; }
        fi
        ;;
      *) operator_error "The journal does not prove completed recovery to the prior release." "Дневникът не доказва завършено възстановяване към предишната версия."; exit 1 ;;
    esac
    ;;
  "$journal_candidate_sha")
    case "$journal_phase" in STATE_COMMITTED|CURRENT_SWITCHED|VERIFIED) ;; *) operator_error "The journal does not prove a committed candidate." "Дневникът не доказва, че кандидатът е записан като текущ."; exit 1 ;; esac
    ;;
  *)
    if [ "$journal_old_sha" = - ]; then
      case "$journal_phase" in
        LOCKED|CANDIDATE_STAGED)
          [ "$state_lock_sha" != "$journal_candidate_sha" ] \
            || { operator_error "The candidate identity is active without a committed journal phase." "Кандидат-версията е активна без потвърден етап в дневника."; exit 1; }
          ;;
        *) operator_error "The activation phase cannot be cleared without an exact prior identity." "Етапът на активиране не може да бъде изчистен без точната предишна версия."; exit 1 ;;
      esac
    else
      operator_error "The active release is neither the exact prior nor candidate identity." "Активната версия не е нито точната предишна, нито кандидат версия."
      exit 1
    fi
    ;;
esac
sh "$state_release_root/scripts/verify-loaded-release-images.sh" "$state_release_lock"
(cd "$state_release_root" && sh scripts/doctor.sh)
else
  # Nothing is installed, so there are no images to verify and no appliance for
  # doctor to examine. The lock is the only artefact left to clear.
  operator_say "No release is installed; clearing the lock left by an interrupted first installation." "Няма инсталирана версия; заключването, оставено от прекъсната първа инсталация, се изчиства."
fi

unexpected="$(find "$lock_dir" -mindepth 1 -maxdepth 1 ! -name journal.v1.tsv ! -name installed-release.before.tsv ! -name pre-update-backup -print -quit)"
[ -z "$unexpected" ] || { operator_error "The activation lock contains an unexpected recovery object." "Заключването за активиране съдържа неочакван обект за възстановяване."; exit 1; }
history="$appliance_home/.data/release-activation-history"
mkdir -p "$history"; chmod 0700 "$history"
history_record="$history/$(date -u +%Y%m%dT%H%M%SZ)-cleared-$journal_candidate_version.tsv"
history_tmp="$history_record.tmp.$$"
cp "$journal" "$history_tmp"
chmod 0600 "$history_tmp"
update_durable_replace "$history_tmp" "$history_record"
rm -f "$lock_dir/pre-update-backup" "$lock_dir/installed-release.before.tsv" "$journal"
update_sync_path "$lock_dir"
rmdir "$lock_dir"
update_sync_path "$(dirname "$lock_dir")"
operator_say "The coherent activation lock was verified and cleared. The journal was retained in activation history." "Последователното състояние беше проверено и заключването е изчистено. Дневникът е запазен в историята на активиранията."
