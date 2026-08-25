#!/bin/sh
set -eu

root="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd -P)"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT HUP INT TERM
site="$work/site"
home="$site/.lospor-home"
bin="$work/bin"
mkdir -p "$site/scripts" "$home/.data" "$home/backups" "$home/docker" "$bin"
cp "$root/scripts/installed-release-state.sh" "$root/scripts/update-capacity.sh" "$site/scripts/"

cat > "$bin/docker" <<'STUB'
#!/bin/sh
if [ "${1:-}" = info ]; then printf '%s\n' "$TEST_DOCKER_ROOT"; exit 0; fi
printf 'unexpected docker operation: %s\n' "$*" >&2
exit 90
STUB
cat > "$bin/df" <<'STUB'
#!/bin/sh
path="${2:-}"
case "$path" in
  "$TEST_DOCKER_ROOT") available="$TEST_DOCKER_KIB" ;;
  "$TEST_HOME/.data") available="$TEST_DATA_KIB" ;;
  "$TEST_HOME/backups") available="$TEST_BACKUP_KIB" ;;
  *) exit 91 ;;
esac
printf 'Filesystem 1024-blocks Used Available Capacity Mounted on\n'
printf 'fixture 999999 1 %s 1%% %s\n' "$available" "$path"
STUB
chmod +x "$bin/docker" "$bin/df"

tests=0
ok() { tests=$((tests + 1)); printf 'ok %s - %s\n' "$tests" "$1"; }
fail() { printf 'FAIL: %s\n' "$1" >&2; [ ! -f "$work/out" ] || sed 's/^/    /' "$work/out" >&2; exit 1; }
run_capacity() {
  PATH="$bin:$PATH" TEST_DOCKER_ROOT="$home/docker" TEST_HOME="$home" \
    TEST_DOCKER_KIB="${TEST_DOCKER_KIB:-100}" TEST_DATA_KIB="${TEST_DATA_KIB:-100}" \
    TEST_BACKUP_KIB="${TEST_BACKUP_KIB:-100}" \
    HOSPITAL_UPDATE_IMAGE_UPPER_BOUND_BYTES="${HOSPITAL_UPDATE_IMAGE_UPPER_BOUND_BYTES:-1024}" \
    HOSPITAL_UPDATE_DOCKER_RESERVE_BYTES="${HOSPITAL_UPDATE_DOCKER_RESERVE_BYTES:-1024}" \
    HOSPITAL_UPDATE_DATA_RESERVE_BYTES="${HOSPITAL_UPDATE_DATA_RESERVE_BYTES:-1024}" \
    HOSPITAL_UPDATE_BACKUP_RESERVE_BYTES="${HOSPITAL_UPDATE_BACKUP_RESERVE_BYTES:-1024}" \
    sh "$site/scripts/update-capacity.sh" "$@" > "$work/out" 2>&1
}

TEST_DOCKER_KIB=1 TEST_DATA_KIB=100 TEST_BACKUP_KIB=100
if run_capacity prepare 1024; then fail "low Docker capacity was accepted"; fi
grep -Fxq UPDATE_DOCKER_CAPACITY_REFUSED "$work/out" || fail "wrong low-Docker refusal"
ok "low Docker capacity is refused"

TEST_DOCKER_KIB=100 TEST_DATA_KIB=1 TEST_BACKUP_KIB=100
if run_capacity prepare 1024; then fail "low staging capacity was accepted"; fi
grep -Fxq UPDATE_DATA_CAPACITY_REFUSED "$work/out" || fail "wrong low-data refusal"
ok "low staging capacity is refused"

TEST_DOCKER_KIB=100 TEST_DATA_KIB=100 TEST_BACKUP_KIB=0
if run_capacity apply 0; then fail "low backup capacity was accepted"; fi
grep -Fxq UPDATE_BACKUP_CAPACITY_REFUSED "$work/out" || fail "wrong low-backup refusal"
ok "apply rechecks backup capacity"

TEST_DOCKER_KIB=100 TEST_DATA_KIB=100 TEST_BACKUP_KIB=100
run_capacity prepare 1024 || fail "adequate capacity was refused"
grep -q '^UPDATE_CAPACITY_OK' "$work/out" || fail "success was not explicit"
ok "adequate capacity is accepted"

if HOSPITAL_UPDATE_IMAGE_UPPER_BOUND_BYTES=not-a-number run_capacity prepare 0; then
  fail "invalid capacity policy was accepted"
fi
grep -Fxq UPDATE_CAPACITY_POLICY_INVALID "$work/out" || fail "invalid policy had the wrong result"
if HOSPITAL_UPDATE_IMAGE_UPPER_BOUND_BYTES=999999999999999999999999 run_capacity prepare 0; then
  fail "overflowing capacity policy was accepted"
fi
grep -Fxq UPDATE_CAPACITY_POLICY_INVALID "$work/out" || fail "overflowing policy had the wrong result"
ok "malformed capacity policy fails closed"

mv "$home/backups" "$home/backups-missing"
if run_capacity prepare 0; then fail "a missing backup filesystem was silently created"; fi
grep -Fxq UPDATE_BACKUP_CAPACITY_UNKNOWN "$work/out" || fail "missing backup storage had the wrong result"
[ ! -e "$home/backups" ] || fail "capacity checking mutated a missing backup path"
mv "$home/backups-missing" "$home/backups"
ok "capacity checking is read-only and fails closed on a missing filesystem"

capacity_line="$(grep -n 'update-capacity.sh.*prepare' "$root/scripts/prepare-verified-release.sh" | head -1 | cut -d: -f1)"
download_line="$(grep -n 'download_asset.*prefix' "$root/scripts/prepare-verified-release.sh" | head -1 | cut -d: -f1)"
pull_line="$(grep -n 'run-online-release.sh.*--fetch-only' "$root/scripts/prepare-verified-release.sh" | head -1 | cut -d: -f1)"
[ -n "$capacity_line" ] && [ "$capacity_line" -lt "$download_line" ] && [ "$capacity_line" -lt "$pull_line" ] \
  || fail "capacity is not checked before download and pull"
ok "prepare checks capacity before the first asset download or image pull"

grep -q 'image_is_protected' "$root/scripts/prepare-verified-release.sh" \
  || fail "prepared-release pruning has no current/rollback protection"
if grep -Eq 'docker[[:space:]]+(image|system)[[:space:]]+prune' "$root/scripts/prepare-verified-release.sh"; then
  fail "prepared-release cleanup uses a broad Docker prune"
fi
ok "retention protects current/rollback references and forbids broad pruning"

printf 'update capacity tests passed (%s)\n' "$tests"
