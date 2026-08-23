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
  && grep -q 'phase=COMPLETE result=PASSED.*mode=emergency' "$root/scripts/recover-release-activation.sh" \
  && grep -q "grep -Ec '\^HOSPITAL_BACKUP_MANIFEST_HMAC_KEY='" "$root/scripts/recover-release-activation.sh" \
  || fail "backup recovery clear lacks authenticated-object and completed-restore proof"
if grep -Eq 'rm[[:space:]]+-rf[[:space:]].*release-activation' "$root/scripts/recover-release-activation.sh"; then
  fail "recovery script contains broad activation-lock deletion"
fi
ok "backup recovery clear requires authenticated backup and completed emergency restore proof"

grep -q 'update_durable_replace.*temporary.*journal' "$root/scripts/recover-release-activation.sh" \
  && grep -q 'update_durable_replace.*journal_tmp.*activation_journal' "$root/scripts/activate-verified-release.sh" \
  && grep -q 'update_sync_path.*appliance_home' "$root/scripts/activate-verified-release.sh" \
  || fail "activation state transitions are not durably flushed"
ok "activation journals and the current-release switch are durably published"

printf 'activation recovery tests passed (%s)\n' "$tests"
