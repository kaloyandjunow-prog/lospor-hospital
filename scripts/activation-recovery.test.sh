#!/bin/sh
set -eu

root="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd -P)"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT HUP INT TERM
site="$work/site"
home="$site/.lospor-home"
scripts="$site/scripts"
lock="$home/.data/release-activation.lock"
mkdir -p "$scripts" "$lock"
for name in installed-release-state.sh operator-locale.sh update-pipeline-lib.sh recover-release-activation.sh; do
  cp "$root/scripts/$name" "$scripts/$name"
done
printf 'LOSPOR_DEFAULT_LOCALE=en\n' > "$home/.env"

tests=0
ok() { tests=$((tests + 1)); printf 'ok %s - %s\n' "$tests" "$1"; }
fail() { printf 'FAIL: %s\n' "$1" >&2; [ ! -f "$work/out" ] || sed 's/^/    /' "$work/out" >&2; exit 1; }
sha="$(printf candidate | sha256sum | awk '{print $1}')"
candidate="$home/.data/releases/1.3.0/lospor-hospital-1.3.0"
journal="$lock/journal.v1.tsv"
write_journal() {
  phase="$1"; policy="$2"; backup="${3:--}"
  printf 'LOSPOR-HOSPITAL-ACTIVATION-JOURNAL-V1\t1\t%s\t11111111-2222-3333-4444-555555555555\t999999\t1\t-\t-\t-\t1.3.0\t%s\t%s\t%s\t%s\t-\n' \
    "$phase" "$candidate" "$sha" "$policy" "$backup" > "$journal"
  chmod 0600 "$journal"
}

write_journal MUTATION_STARTED backup-required invalid
before="$(sha256sum "$journal" | awk '{print $1}')"
sh "$scripts/recover-release-activation.sh" inspect > "$work/out" 2>&1 \
  || fail "strict valid journal could not be inspected"
grep -Fq 'Activation phase: MUTATION_STARTED' "$work/out" || fail "inspect omitted the exact phase"
grep -Fq 'Nothing was changed.' "$work/out" || fail "inspect did not state its read-only behavior"
[ "$(sha256sum "$journal" | awk '{print $1}')" = "$before" ] || fail "inspect changed the journal"
ok "inspect is read-only and names the exact activation phase"

printf '\textra\n' >> "$journal"
if sh "$scripts/recover-release-activation.sh" inspect > "$work/out" 2>&1; then
  fail "journal with an extra field was accepted"
fi
[ -d "$lock" ] || fail "malformed journal caused automatic lock removal"
ok "malformed or extra journal state fails closed"

write_journal BACKUP_RECOVERY_REQUIRED backup-required lospor-20260820T120000Z-abcdef.backup
if sh "$scripts/recover-release-activation.sh" resume-rollback --confirm > "$work/out" 2>&1; then
  fail "backup-required release accepted service-only rollback"
fi
grep -Fq 'verified-backup recovery' "$work/out" || fail "rollback refusal was not understandable"
[ -d "$lock" ] || fail "rollback refusal removed the activation lock"
ok "backup-required releases cannot use service-only rollback"

write_journal ROLLBACK_INCOMPLETE service-compatible -
if sh "$scripts/recover-release-activation.sh" resume-rollback > "$work/out" 2>&1; then
  fail "rollback ran without explicit confirmation"
fi
grep -Fq -- '--confirm' "$work/out" || fail "rollback did not explain required confirmation"
ok "resume rollback requires explicit confirmation"

if sh "$scripts/recover-release-activation.sh" verify-and-clear > "$work/out" 2>&1; then
  fail "activation lock cleared without explicit confirmation"
fi
grep -Fq -- '--confirm-clear' "$work/out" || fail "clear did not explain required confirmation"
[ -d "$lock" ] || fail "unconfirmed clear removed the lock"
ok "verify-and-clear requires a separate explicit confirmation"

grep -q 'backup_verify_object.*integrity' "$root/scripts/recover-release-activation.sh" \
  && grep -q "grep -Ec '\^HOSPITAL_BACKUP_MANIFEST_HMAC_KEY='" "$root/scripts/recover-release-activation.sh" \
  || fail "backup recovery clear lacks authenticated-object and completed-restore proof"

# The completed-restore proof used to be checked by grepping this very script
# for the literal `mode=emergency` -- a tautology that asserts the string it is
# reading exists. It passed for as long as the gate demanded a token
# restore-backup.sh could never write, leaving the one supported recovery from
# BACKUP_RECOVERY_REQUIRED unreachable. Assert instead that the two scripts
# agree: the mode the gate demands must be one the restore tool journals.
gate_mode="$(sed -n 's/.*phase=COMPLETE result=PASSED object=.* mode=\([a-z][a-z-]*\)[$]".*/\1/p' "$root/scripts/recover-release-activation.sh")"
[ -n "$gate_mode" ] || fail "backup recovery clear has no completed-restore proof"
grep -Eq "restore_mode=$gate_mode([;[:space:]]|\$)" "$root/scripts/restore-backup.sh" \
  || fail "recovery demands restore mode '$gate_mode', which restore-backup.sh never journals"
if grep -Eq 'rm[[:space:]]+-rf[[:space:]].*release-activation' "$root/scripts/recover-release-activation.sh"; then
  fail "recovery script contains broad activation-lock deletion"
fi
ok "backup recovery clear requires authenticated backup and completed emergency restore proof"

# An interrupted FIRST installation used to be unrecoverable: every later
# install refused because a prior activation "needs operator review", while
# verify-and-clear died on the missing current link and resume-rollback refused
# because a first install has no backup by definition. Nothing was committed --
# no current link, no installed release -- so there is nothing to be
# inconsistent with, and the lock must be clearable.
write_journal MUTATION_STARTED backup-required -
[ ! -e "$home/current" ] || fail "fixture unexpectedly has a current release"
sh "$scripts/recover-release-activation.sh" verify-and-clear --confirm-clear > "$work/out" 2>&1 \
  || fail "an interrupted first installation could not be cleared"
[ ! -d "$lock" ] || fail "the activation lock survived a successful clear"
grep -q "No release is installed" "$work/out" \
  || fail "the operator was not told why the lock could be cleared"
[ -n "$(ls -A "$home/.data/release-activation-history" 2>/dev/null)" ] \
  || fail "the cleared journal was not retained in activation history"
ok "an interrupted first installation clears, and its journal is retained"

# The same relaxation must not become a way to clear a lock on an appliance
# whose prior state cannot be proved. With a prior identity recorded but no
# pre-update backup AND no matching snapshot, the appliance is not demonstrably
# unchanged, so the clear must still fail closed.
mkdir -p "$lock"
prior_root="$home/.data/releases/1.2.9/lospor-hospital-1.2.9"
mkdir -p "$prior_root/.release"
printf 'prior-lock\n' > "$prior_root/.release/release.lock"
prior_sha="$(sha256sum "$prior_root/.release/release.lock" | awk '{print $1}')"
# release_state_read validates the installed release is a real one before any
# recovery decision, so the fixture needs the same files a release carries.
: > "$prior_root/compose.yaml"
: > "$prior_root/compose.release.yaml"
printf '%s  release.lock\n' "$prior_sha" > "$prior_root/.release/release.lock.sha256"
printf 'LOSPOR-HOSPITAL-INSTALLED-RELEASE-V1\t1.2.9\t.data/releases/1.2.9/lospor-hospital-1.2.9\t%s\n' \
  "$prior_sha" > "$home/.data/installed-release.tsv"
ln -sfn "$prior_root" "$home/current"
printf 'LOSPOR-HOSPITAL-ACTIVATION-JOURNAL-V1\t1\tBACKUP_RECOVERY_REQUIRED\t11111111-2222-3333-4444-555555555555\t999999\t1\t1.2.9\t%s\t%s\t1.3.0\t%s\t%s\tbackup-required\t-\t-\n' \
  "$prior_root" "$prior_sha" "$candidate" "$sha" > "$journal"
chmod 0600 "$journal"
if sh "$scripts/recover-release-activation.sh" verify-and-clear --confirm-clear > "$work/out" 2>&1; then
  fail "cleared a lock without either a backup proof or a prior-state snapshot"
fi
grep -q "does not prove the appliance is unchanged" "$work/out" \
  || fail "the refusal did not name the missing prior-state snapshot"
[ -d "$lock" ] || fail "a refused clear removed the lock anyway"
ok "no backup and no prior snapshot still fails closed"

# With a pre-update backup recorded, the clear used to demand a completed
# emergency restore -- of a database that a release shipping no migration never
# touched, and which on the release that found this could not be restored at
# all, because a pre-update backup is stamped with the candidate's version and
# every consumer rejects it as newer than the appliance. Both release trees
# declare the newest migration they ship, each authenticated by its own release
# lock, so when they agree the database is provably unmoved and the prior-state
# snapshot is sufficient. When they disagree the restore proof is still required.
mkdir -p "$lock" "$candidate" "$prior_root/scripts"
printf '#!/bin/sh\nexit 0\n' > "$prior_root/scripts/verify-loaded-release-images.sh"
printf '#!/bin/sh\nexit 0\n' > "$prior_root/scripts/doctor.sh"
chmod 0755 "$prior_root/scripts/verify-loaded-release-images.sh" "$prior_root/scripts/doctor.sh"
declare_schema() {
  printf 'LOSPOR-HOSPITAL-RELEASE-COMPATIBILITY-V1\t%s\t20260530000000_init\t%s\tbackup-required\t-\t0\n' \
    "$1" "$2" > "$3/release-compatibility.tsv"
}
stage_backup_recovery_lock() {
  printf 'LOSPOR-HOSPITAL-ACTIVATION-JOURNAL-V1\t1\tBACKUP_RECOVERY_REQUIRED\t11111111-2222-3333-4444-555555555555\t999999\t1\t1.2.9\t%s\t%s\t1.3.0\t%s\t%s\tbackup-required\tlospor-20260821T120000Z-abcdef.backup\t-\n' \
    "$prior_root" "$prior_sha" "$candidate" "$sha" > "$journal"
  chmod 0600 "$journal"
  printf 'LOSPOR-HOSPITAL-INSTALLED-RELEASE-V1\t1.2.9\t.data/releases/1.2.9/lospor-hospital-1.2.9\t%s\n' \
    "$prior_sha" > "$lock/installed-release.before.tsv"
  chmod 0600 "$lock/installed-release.before.tsv"
}

declare_schema 1.2.9 20260914130000_same "$prior_root"
declare_schema 1.3.0 20260920000000_moved "$candidate"
stage_backup_recovery_lock
if sh "$scripts/recover-release-activation.sh" verify-and-clear --confirm-clear > "$work/out" 2>&1; then
  fail "cleared a lock although the candidate shipped a migration"
fi
grep -q "cannot be proved" "$work/out" \
  || fail "the refusal did not name the missing restore proof"
[ -d "$lock" ] || fail "a refused clear removed the lock anyway"
ok "a candidate that shipped a migration still requires the restore proof"

declare_schema 1.3.0 20260914130000_same "$candidate"
stage_backup_recovery_lock
sh "$scripts/recover-release-activation.sh" verify-and-clear --confirm-clear > "$work/out" 2>&1 \
  || fail "a candidate that shipped no migration could not be cleared"
[ ! -d "$lock" ] || fail "the lock survived a successful no-migration clear"
ok "a candidate that shipped no migration clears without an emergency restore"

# Contract-level, not behavioural: reaching this branch for real needs a failed
# candidate plus a docker stub, which this suite has no harness for. It still
# pins the fix, because the failure it prevents was silent -- `docker compose
# down` re-interpolates the compose file and so needs a complete .env, which a
# first installation that failed while writing .env does not have. The rollback
# then left the candidate's containers running AND reported ROLLBACK INCOMPLETE.
# The fallback must not depend on configuration that may itself be the fault.
grep -q 'com.docker.compose.project.working_dir=\$target' "$root/scripts/activate-verified-release.sh" \
  || fail "rollback has no configuration-free fallback for stopping candidate services"
grep -q 'docker rm -f \$candidate_containers' "$root/scripts/activate-verified-release.sh" \
  || fail "the label-based fallback does not actually remove the candidate containers"
ok "failed-candidate teardown can stop services without a usable .env"

grep -q 'update_durable_replace.*temporary.*journal' "$root/scripts/recover-release-activation.sh" \
  && grep -q 'update_durable_replace.*journal_tmp.*activation_journal' "$root/scripts/activate-verified-release.sh" \
  && grep -q 'update_sync_path.*appliance_home' "$root/scripts/activate-verified-release.sh" \
  || fail "activation state transitions are not durably flushed"
ok "activation journals and the current-release switch are durably published"

printf 'activation recovery tests passed (%s)\n' "$tests"
