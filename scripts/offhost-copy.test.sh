#!/bin/sh
set -eu

source_root="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd -P)"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT HUP INT TERM
tests=0
ok() { tests=$((tests + 1)); printf 'ok %s - %s\n' "$tests" "$1"; }
fail() { printf 'not ok - %s\n' "$1" >&2; [ ! -f "$work/out" ] || sed 's/^/    /' "$work/out" >&2; exit 1; }

home="$work/home"; release="$work/release"; bin="$work/bin"
object=lospor-20260913T072635Z-W3UVqwGn.backup
clinical_text="patient-record-that-must-not-leave-in-clear"

fixture() {
  rm -rf "$home" "$release" "$bin" "$work/share" "$work/sftp-root" "$work/calls"
  mkdir -p "$home/backups/$object" "$home/secrets/backup" "$home/.data/runtime/update/state" \
    "$release/scripts" "$bin" "$work/share" "$work/sftp-root"
  for script in offhost-copy.sh installed-release-state.sh operator-locale.sh update-pipeline-lib.sh; do
    cp "$source_root/scripts/$script" "$release/scripts/"
  done
  mkdir -p "$release/infra/postgres"
  cp "$source_root/infra/postgres/offhost-deferred.sh" "$release/infra/postgres/"
  cp "$source_root/infra/postgres/offhost-deferred.sh" "$home/secrets/backup/offhost-copy"
  cat > "$release/scripts/restore-backup.sh" <<'STUB'
#!/bin/sh
echo "restore-backup $*" >> "$CALLS"
[ -f "$OFFHOST_HOME/$2/database.dump" ] && grep -q patient-record "$OFFHOST_HOME/$2/database.dump" || exit 9
exit "${RESTORE_EXIT:-0}"
STUB
  printf '{"objectType":"fixture"}\n' > "$home/backups/$object/manifest.json"
  printf '%s\n' "$clinical_text" > "$home/backups/$object/database.dump"
  printf 'schemaVersion=1\ncompletedAtEpoch=%s\nobjectName=%s\nmanifestSha256=%s\n' \
    "$(date -u +%s)" "$object" "$(sha256sum "$home/backups/$object/manifest.json" | awk '{print $1}')" \
    > "$home/backups/.last-verified.v1"
  : > "$home/.data/io-mutation.lock"
  : > "$work/calls"
  # SFTP: batch commands run against a local directory standing in for the server.
  cat > "$bin/sftp" <<'STUB'
#!/bin/sh
batch=""
while [ "$#" -gt 1 ]; do case "$1" in -b) batch="$2"; shift 2 ;; *) shift ;; esac; done
printf '%s\n' "sftp $1" >> "$CALLS"
[ "${SFTP_DOWN:-0}" != 1 ] || exit 255
while IFS= read -r line; do
  ignore=0
  case "$line" in -*) ignore=1; line="${line#-}" ;; esac
  set -- $line
  result=0
  case "$1" in
    mkdir) mkdir "$FAKE_SFTP_ROOT/$2" 2>/dev/null || result=1 ;;
    rm) rm "$FAKE_SFTP_ROOT/$2" 2>/dev/null || result=1 ;;
    put) cp "$2" "$FAKE_SFTP_ROOT/$3" || result=1 ;;
    get) cp "$FAKE_SFTP_ROOT/$2" "$3" || result=1 ;;
    rename) [ ! -e "$FAKE_SFTP_ROOT/$3" ] && mv "$FAKE_SFTP_ROOT/$2" "$FAKE_SFTP_ROOT/$3" || result=1 ;;
    *) result=1 ;;
  esac
  [ "$result" -eq 0 ] || [ "$ignore" -eq 1 ] || exit 1
done < "$batch"
STUB
  cat > "$bin/ssh-keyscan" <<'STUB'
#!/bin/sh
printf '%s\n' "[backup.hospital.test]:2222 ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIBKq1rQ0Zk8pYyv0mYbIuPPvXqfFxz1xWmZyP3n0y2cH"
STUB
  chmod +x "$bin"/*
}

ctl() {
  PATH="$bin:$PATH" CALLS="$work/calls" FAKE_SFTP_ROOT="$work/sftp-root" OFFHOST_HOME="$home" \
    LOSPOR_APPLIANCE_HOME="$home" HOSPITAL_OFFHOST_TEST_ONLY=1 HOSPITAL_UPDATE_TEST_ONLY=1 LOSPOR_DEFAULT_LOCALE=en "$@" \
    > "$work/out" 2>&1
}
code() { awk -F '\t' -v kind="$1" '$1 == kind { line = $3 } END { print line }' "$home/.data/offhost/results.v1.tsv"; }
run() { ctl sh "$release/scripts/offhost-copy.sh" "$@"; }

# 1. Nothing configured: the timer's run is a silent success; the rest say so.
fixture
run run || fail "an unconfigured run did not succeed quietly"
[ ! -e "$home/backups/.last-offhost-verified.v1" ] || fail "an unconfigured run acknowledged a copy"
set +e; run test; result=$?; set -e
[ "$result" = 2 ] && grep -Fq 'not configured' "$work/out" || fail "test without configuration did not say so (exit $result)"
ok "an unconfigured appliance runs nothing and says it is not configured"

# 2. A share path must be absolute and outside the appliance.
for bad in relative/path /opt/lospor-hospital/backups /mnt/../etc; do
  set +e; run configure mount "$bad"; result=$?; set -e
  [ "$result" = 2 ] || fail "the share path $bad was accepted (exit $result)"
done
ok "a relative, appliance-internal or traversing share path is refused"

# 3-5. Mount: a test round-trips and leaves nothing; a run copies, encrypts, acknowledges once.
run configure mount "$work/share" || fail "configuring a share failed"
[ "$(grep -Ec '^[a-f0-9]{64}$' "$home/secrets/backup/offhost-encryption.key")" = 2 ] || fail "no encryption key was generated"
run test || fail "the connection test failed"
[ -z "$(ls -A "$work/share")" ] || fail "the connection test left files on the share"
ok "a connection test writes, reads back and removes its probe"

run run || fail "copying to the share failed"
[ -s "$work/share/$object.lospor-offhost" ] && [ -s "$work/share/$object.lospor-offhost.meta" ] || fail "the copy and its metadata are not on the share"
! grep -rqF "$clinical_text" "$work/share" || fail "backup content reached the share unencrypted"
grep -qx "objectName=$object" "$home/backups/.last-offhost-verified.v1" || fail "the copy was not acknowledged"
[ "$(code run)" = OFFHOST_COPY_ACKNOWLEDGED ] || fail "the run was not recorded"
[ -z "$(ls -A "$home/.data/offhost/work")" ] || fail "the encrypted work copy was left on the appliance"
ok "a run stores an encrypted copy, reads it back and only then acknowledges it"

cp "$home/backups/.last-offhost-verified.v1" "$work/marker-before"
touch -d '2026-01-01' "$work/share/$object.lospor-offhost"
run run || fail "a second run failed"
cmp -s "$work/marker-before" "$home/backups/.last-offhost-verified.v1" \
  && [ "$(date -r "$work/share/$object.lospor-offhost" +%Y)" = 2026 ] && [ "$(date -r "$work/share/$object.lospor-offhost" +%m)" = 01 ] \
  || fail "an already acknowledged backup was copied again"
ok "an already acknowledged backup is not copied again"

# 6. A drill restores the fetched, decrypted bytes under a name of its own, then removes them.
run drill || fail "the drill failed"
grep -Eq "^restore-backup --drill backups/lospor-20260913T072635Z-offhostdrill[0-9a-f]{12}\.backup$" "$work/calls" \
  || fail "the drill did not restore the fetched copy under its own name"
[ "$(find "$home/backups" -maxdepth 1 -name '*offhostdrill*' | wc -l)" = 0 ] || fail "the drill left its restored object in backups"
[ -f "$home/backups/$object/database.dump" ] || fail "the drill touched the local object"
grep -q "	passed	$object	OFFHOST_DRILL_PASSED$" "$home/.data/offhost/drills.v1.tsv" || fail "the passed drill was not recorded"
ok "a drill restores the fetched copy under its own name and removes it"

# 7. A copy changed at the destination fails authentication before anything is decrypted or restored.
cp "$work/share/$object.lospor-offhost" "$work/good"
printf 'x' | dd of="$work/share/$object.lospor-offhost" bs=1 seek=100 conv=notrunc 2>/dev/null
: > "$work/calls"
set +e; run drill; result=$?; set -e
[ "$result" = 1 ] && [ "$(code drill)" = OFFHOST_DRILL_AUTHENTICATION_FAILED ] || fail "a changed copy was not refused as unauthenticated"
! grep -q restore-backup "$work/calls" || fail "a changed copy reached the restore"
cp "$work/good" "$work/share/$object.lospor-offhost"
RESTORE_EXIT=1 run drill && fail "a drill whose restore failed reported success"
[ "$(code drill)" = OFFHOST_DRILL_RESTORE_FAILED ] || fail "a failed restore was not recorded as such"
ok "a changed copy fails authentication, and a failed restore fails the drill"

# 8. SFTP: host keys are pinned, the copy goes through the batch client, and Status sees the public key only.
fixture
run configure sftp backup.hospital.test 2222 lospor lospor-backups || fail "configuring SFTP failed"
grep -q 'ssh-ed25519' "$home/secrets/backup/offhost-known-hosts" || fail "the server host key was not pinned"
[ -s "$home/secrets/backup/offhost-ssh-key" ] && grep -q '^ssh-ed25519 ' "$home/secrets/backup/offhost-ssh-key.pub" || fail "no SSH key was generated"
run run || fail "copying over SFTP failed"
[ -s "$work/sftp-root/lospor-backups/$object.lospor-offhost.meta" ] || fail "the SFTP copy is not on the server"
grep -q '^sftp lospor@backup.hospital.test$' "$work/calls" || fail "SFTP did not connect as the configured user"
run drill || fail "the SFTP drill failed"
python3 - "$home/.data/runtime/update/state/offhost.v1.json" "$home/secrets/backup" <<'PY' || fail "the off-host projection is wrong or carries a secret"
import json, pathlib, sys
raw = pathlib.Path(sys.argv[1]).read_text()
value = json.loads(raw)
assert value["destination"] == {"type": "sftp", "host": "backup.hospital.test", "port": 2222, "user": "lospor", "directory": "lospor-backups"}, value
assert value["sshPublicKey"].startswith("ssh-ed25519 "), value
assert value["lastRun"]["result"] == "OFFHOST_COPY_ACKNOWLEDGED" and value["lastDrill"]["result"] == "OFFHOST_DRILL_PASSED", value
secrets = pathlib.Path(sys.argv[2])
for line in (secrets / "offhost-encryption.key").read_text().split():
    assert line not in raw, "an encryption secret reached the projection"
assert "PRIVATE KEY" not in raw
PY
ok "SFTP pins the host key, copies through the batch client, and projects only public identities"

# 9. An unreachable server fails the run without acknowledging anything.
rm -f "$home/backups/.last-offhost-verified.v1"
set +e; SFTP_DOWN=1 run run; result=$?; set -e
[ "$result" = 1 ] && [ ! -e "$home/backups/.last-offhost-verified.v1" ] && [ "$(code run)" = OFFHOST_COPY_FAILED ] \
  || fail "an unreachable server was acknowledged or not reported"
ok "an unreachable server fails the run and acknowledges nothing"

# 10. A custom off-host script and this adapter never both copy: setup is refused,
#     and a script plugged in after setup stops the timer's copies.
fixture
printf '#!/bin/sh\n# the hospital'"'"'s own transfer\nexit 0\n' > "$home/secrets/backup/offhost-copy"
set +e; run configure mount "$work/share"; result=$?; set -e
[ "$result" = 3 ] && grep -Fq 'already has its own off-host script' "$work/out" || fail "setup beside a custom script was not refused (exit $result)"
[ ! -e "$home/secrets/backup/offhost.v1.conf" ] || fail "a refused setup still wrote a configuration"
cp "$source_root/infra/postgres/offhost-deferred.sh" "$home/secrets/backup/offhost-copy"
run configure mount "$work/share" || fail "setup failed once the custom script was removed"
printf '#!/bin/sh\nexit 0\n' > "$home/secrets/backup/offhost-copy"
set +e; run run; result=$?; set -e
[ "$result" = 3 ] && [ "$(code run)" = OFFHOST_CUSTOM_HOOK_CONFLICT ] && [ -z "$(ls -A "$work/share")" ] \
  || fail "a custom script plugged in after setup did not stop the adapter (exit $result)"
ok "a custom off-host script and this adapter are never both used"

# 11. No secret is ever handed to a command line, where any local user could read it.
! grep -Eq 'openssl enc[^#]* -(K|iv|k) |hexkey:|-pass pass:' "$source_root/scripts/offhost-copy.sh" \
  || fail "a secret is passed on a command line"
ok "encryption secrets are read from files, never passed as arguments"

echo "offhost copy tests passed ($tests)"
