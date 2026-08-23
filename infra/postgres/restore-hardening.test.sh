#!/bin/sh
set -eu

root="$(CDPATH= cd -- "$(dirname "$0")/../.." && pwd)"
test_root="$(mktemp -d "${TMPDIR:-/tmp}/lospor-restore-hardening.XXXXXX")"
cleanup() { rm -rf -- "$test_root"; }
trap cleanup EXIT HUP INT TERM

tests=0
ok() { tests=$((tests + 1)); printf 'ok %s - %s\n' "$tests" "$1"; }
fail() { printf 'FAIL: %s\n' "$1" >&2; exit 1; }

auth_key=0123456789abcdef0123456789abcdef0123456789abcdef
fp_a=sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
fp_b=sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
fp_c=sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc
fp_d=sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd
fp_e=sha256:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee
fp_f=sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff
fp_g=sha256:1212121212121212121212121212121212121212121212121212121212121212
backup_dir="$test_root/backups"
mkdir -p "$backup_dir"

migrations="$test_root/migrations"
printf '%s\n' '20260801000000_alpha:aaa' '20260802000000_beta:bbb' > "$migrations"
migration_sha="$(sha256sum "$migrations" | awk '{ print $1 }')"
completed_epoch=1787400000
completed_at="$(date -u -d "@$completed_epoch" +%Y-%m-%dT%H:%M:%SZ)"
created_epoch=$((completed_epoch - 10))
created_at="$(date -u -d "@$created_epoch" +%Y-%m-%dT%H:%M:%SZ)"
stamp="$(printf '%s' "$completed_at" | tr -d ':-')"
object="$backup_dir/lospor-${stamp}-abcdefgh.backup"
mkdir "$object"
printf '%s\n' 'fixture custom archive' > "$object/database.dump"
dump_bytes="$(wc -c < "$object/database.dump" | tr -d '[:space:]')"
dump_sha="$(sha256sum "$object/database.dump" | awk '{ print $1 }')"
unsigned="$test_root/unsigned.json"
cat > "$unsigned" <<EOF
{
  "schemaVersion":1,
  "objectType":"lospor-postgresql-logical-backup",
  "toolVersion":"1.2.0",
  "runId":"${stamp}-abcdefgh",
  "kind":"scheduled",
  "siteId":"site-fixture",
  "applianceId":"appliance-fixture",
  "hospitalRelease":"1.2.0",
  "exchangeContractVersion":"2.2.0",
  "dataDictionaryVersion":"2.2.0",
  "postgresMajor":17,
  "migrationCount":2,
  "migrationFingerprint":"sha256:$migration_sha",
  "schemaFingerprint":"$fp_b",
  "patientHmacKeyFingerprint":"$fp_a",
  "patientEncryptionKeyFingerprint":"$fp_b",
  "exportPseudonymKeyFingerprint":"$fp_c",
  "omopPseudonymSaltFingerprint":"$fp_g",
  "siteSigningKeyFingerprint":"$fp_d",
  "externalAiSealKeyFingerprint":"$fp_e",
  "administratorMfaKeyFingerprint":"$fp_f",
  "manifestAuthKeyFingerprint":"sha256:$(printf '%s' "$auth_key" | sha256sum | awk '{ print $1 }')",
  "createdAt":"$created_at",
  "createdAtEpoch":$created_epoch,
  "completedAt":"$completed_at",
  "completedAtEpoch":$completed_epoch,
  "dumpFile":"database.dump",
  "sourceDatabaseBytes":1000,
  "dumpBytes":$dump_bytes,
  "dumpSha256":"$dump_sha"
}
EOF
manifest_hmac="$(openssl dgst -sha256 -hmac "$auth_key" "$unsigned" | awk '{ print $NF }')"
sed '$d' "$unsigned" | sed '$s/$/,/' > "$object/manifest.json"
printf '  "manifestHmacSha256":"%s"\n}\n' "$manifest_hmac" >> "$object/manifest.json"
rm -f -- "$unsigned"

# The emergency switch requires a second, freshly authenticated backup of the
# current live database. Model that independent recovery object and marker;
# ordinary verify/temporary operations do not consume this proof.
safety_object="$backup_dir/lospor-${stamp}-safety01.backup"
cp -R "$object" "$safety_object"
safety_unsigned="$test_root/safety-unsigned.json"
manifest_lines="$(wc -l < "$safety_object/manifest.json" | tr -d '[:space:]')"
awk -v hmac_line="$((manifest_lines - 1))" -v previous_line="$((manifest_lines - 2))" '
  NR == hmac_line { next }
  NR == previous_line { sub(/,$/, "") }
  { print }
' "$safety_object/manifest.json" \
  | sed 's/"kind":"scheduled"/"kind":"pre-restore"/' > "$safety_unsigned"
safety_hmac="$(openssl dgst -sha256 -hmac "$auth_key" "$safety_unsigned" | awk '{ print $NF }')"
sed '$d' "$safety_unsigned" | sed '$s/$/,/' > "$safety_object/manifest.json"
printf '  "manifestHmacSha256":"%s"\n}\n' "$safety_hmac" >> "$safety_object/manifest.json"
rm -f -- "$safety_unsigned"
printf 'schemaVersion=1\nkind=pre-restore\nrequestedAtEpoch=%s\n' "$completed_epoch" \
  > "$safety_object/.retain-pre-restore"
safety_manifest_sha="$(sha256sum "$safety_object/manifest.json" | awk '{ print $1 }')"
printf 'schemaVersion=1\ncompletedAtEpoch=%s\nobjectName=%s\nmanifestSha256=%s\n' \
  "$completed_epoch" "$(basename "$safety_object")" "$safety_manifest_sha" \
  > "$backup_dir/.last-verified.v1"

mock_dir="$test_root/mocks"
calls="$test_root/calls"
mkdir "$mock_dir"
: > "$calls"
cat > "$mock_dir/pg_restore" <<'MOCK'
#!/bin/sh
case "$*" in
  *--list*) exit "${MOCK_LIST_EXIT:-0}" ;;
esac
printf 'pg_restore %s\n' "$*" >> "$MOCK_CALLS"
exit "${MOCK_RESTORE_EXIT:-0}"
MOCK
cat > "$mock_dir/pg_dump" <<'MOCK'
#!/bin/sh
output=""
for argument in "$@"; do case "$argument" in --file=*) output="${argument#--file=}" ;; esac; done
[ -n "$output" ] || exit 2
printf '%s\n' 'CREATE TABLE fixture(id integer);' > "$output"
MOCK
cat > "$mock_dir/psql" <<'MOCK'
#!/bin/sh
case "$*" in
  *server_version_num*) printf '%s\n' "${MOCK_POSTGRES_VERSION_NUM:-170011}" ;;
  *migration_name*) printf '%s\n' '20260801000000_alpha:aaa' '20260802000000_beta:bbb' ;;
  *"SELECT 1 FROM pg_database"*)
    case "$*" in
      *lospor_restore_*) [ "${MOCK_TARGET_EXISTS:-0}" -eq 1 ] && printf '%s\n' 1 ;;
      *lospor_previous_*) [ "${MOCK_PREVIOUS_EXISTS:-0}" -eq 1 ] && printf '%s\n' 1 ;;
    esac
    true
    ;;
  *"ALTER DATABASE"*)
    printf 'psql %s\n' "$*" >> "$MOCK_CALLS"
    case "$*" in
      *"lospor_restore_"*"RENAME TO \"lospor\""*) [ "${MOCK_SWITCH_RENAME_FAIL:-0}" -eq 0 ] || exit 1 ;;
    esac
    ;;
  *pg_terminate_backend*) printf 'psql terminate\n' >> "$MOCK_CALLS" ;;
  *) printf '%s\n' 1 ;;
esac
MOCK
cat > "$mock_dir/createdb" <<'MOCK'
#!/bin/sh
printf 'createdb %s\n' "$*" >> "$MOCK_CALLS"
MOCK
cat > "$mock_dir/dropdb" <<'MOCK'
#!/bin/sh
printf 'dropdb %s\n' "$*" >> "$MOCK_CALLS"
MOCK
chmod +x "$mock_dir"/*

run_restore() {
  env PATH="$mock_dir:$PATH" MOCK_CALLS="$calls" \
    HOSPITAL_BACKUP_DIR="$backup_dir" \
    HOSPITAL_BACKUP_OBJECT_LIB="$root/infra/postgres/backup-object-lib.sh" \
    HOSPITAL_BACKUP_MANIFEST_HMAC_KEY="${HOSPITAL_BACKUP_MANIFEST_HMAC_KEY:-$auth_key}" \
    HOSPITAL_BACKUP_SITE_ID="${HOSPITAL_BACKUP_SITE_ID:-site-fixture}" \
    HOSPITAL_BACKUP_APPLIANCE_ID="${HOSPITAL_BACKUP_APPLIANCE_ID:-appliance-fixture}" \
    HOSPITAL_APPLIANCE_RELEASE="${HOSPITAL_APPLIANCE_RELEASE:-1.2.0}" \
    HOSPITAL_EXCHANGE_CONTRACT_VERSION="${HOSPITAL_EXCHANGE_CONTRACT_VERSION:-2.2.0}" \
    HOSPITAL_DATA_DICTIONARY_VERSION="${HOSPITAL_DATA_DICTIONARY_VERSION:-2.2.0}" \
    HOSPITAL_PATIENT_HMAC_KEY_FINGERPRINT="${HOSPITAL_PATIENT_HMAC_KEY_FINGERPRINT:-$fp_a}" \
    HOSPITAL_PATIENT_ENCRYPTION_KEY_FINGERPRINT="${HOSPITAL_PATIENT_ENCRYPTION_KEY_FINGERPRINT:-$fp_b}" \
    HOSPITAL_EXPORT_PSEUDONYM_KEY_FINGERPRINT="${HOSPITAL_EXPORT_PSEUDONYM_KEY_FINGERPRINT:-$fp_c}" \
    HOSPITAL_OMOP_PSEUDONYM_SALT_FINGERPRINT="${HOSPITAL_OMOP_PSEUDONYM_SALT_FINGERPRINT:-$fp_g}" \
    HOSPITAL_SITE_SIGNING_KEY_FINGERPRINT="${HOSPITAL_SITE_SIGNING_KEY_FINGERPRINT:-$fp_d}" \
    HOSPITAL_EXTERNAL_AI_SEAL_KEY_FINGERPRINT="${HOSPITAL_EXTERNAL_AI_SEAL_KEY_FINGERPRINT:-$fp_e}" \
    HOSPITAL_MFA_ENCRYPTION_KEY_FINGERPRINT="${HOSPITAL_MFA_ENCRYPTION_KEY_FINGERPRINT:-$fp_f}" \
    LOSPOR_RESTORE_CONFIRM="${LOSPOR_RESTORE_CONFIRM:-}" \
    LOSPOR_RESTORE_DESTRUCTIVE_BOUNDARY_ACK="${LOSPOR_RESTORE_DESTRUCTIVE_BOUNDARY_ACK:-}" \
    LOSPOR_RESTORE_SAFETY_SNAPSHOT_MANIFEST_SHA256="${LOSPOR_RESTORE_SAFETY_SNAPSHOT_MANIFEST_SHA256:-$safety_manifest_sha}" \
    HOSPITAL_RESTORE_SAFETY_SNAPSHOT_MAX_AGE_SECONDS="${HOSPITAL_RESTORE_SAFETY_SNAPSHOT_MAX_AGE_SECONDS:-999999999}" \
    LOSPOR_RESTORE_BOUNDARY_MARKER="${LOSPOR_RESTORE_BOUNDARY_MARKER:-$backup_dir/.restore-boundary-111111111111111111111111.started}" \
    MOCK_POSTGRES_VERSION_NUM="${MOCK_POSTGRES_VERSION_NUM:-170011}" \
    MOCK_RESTORE_EXIT="${MOCK_RESTORE_EXIT:-0}" \
    MOCK_TARGET_EXISTS="${MOCK_TARGET_EXISTS:-0}" \
    MOCK_PREVIOUS_EXISTS="${MOCK_PREVIOUS_EXISTS:-0}" \
    MOCK_SWITCH_RENAME_FAIL="${MOCK_SWITCH_RENAME_FAIL:-0}" \
    POSTGRES_USER=lospor POSTGRES_DB=lospor \
    sh "$root/infra/postgres/restore.sh" "$@"
}

verify_output="$(run_restore verify "$object")" || fail "valid restore preflight failed"
printf '%s\n' "$verify_output" | grep -Fxq RESTORE_PREFLIGHT_OK \
  && printf '%s\n' "$verify_output" | grep -Fxq RESTORE_SITE_ID=site-fixture \
  && printf '%s\n' "$verify_output" | grep -Eq '^RESTORE_MANIFEST_SHA256=[0-9a-f]{64}$' \
  || fail "valid preflight did not return privacy-safe proof"
[ ! -s "$calls" ] || fail "read-only preflight invoked a mutating database command"
ok "valid object passes full integrity, catalog, compatibility, site, and key preflight without mutation"

if run_restore verify "$backup_dir/lospor-20260822T120000Z-missing1.backup" >/dev/null 2>&1; then
  fail "missing recovery object passed preflight"
fi
[ ! -s "$calls" ] || fail "missing-object preflight mutated a database"
ok "missing recovery object fails before any database mutation"

if HOSPITAL_BACKUP_SITE_ID=wrong-site run_restore verify "$object" >/dev/null 2>&1; then
  fail "wrong-site object passed preflight"
fi
[ ! -s "$calls" ] || fail "wrong-site preflight mutated a database"
ok "wrong site fails before any database mutation"

if HOSPITAL_PATIENT_ENCRYPTION_KEY_FINGERPRINT="$fp_c" run_restore verify "$object" >/dev/null 2>&1; then
  fail "wrong encryption key set passed preflight"
fi
[ ! -s "$calls" ] || fail "wrong-key preflight mutated a database"
ok "wrong clinical key fingerprint fails before any database mutation"

: > "$calls"
omop_mismatch_error="$test_root/omop-mismatch.error"
if HOSPITAL_OMOP_PSEUDONYM_SALT_FINGERPRINT="$fp_a" \
    run_restore verify "$object" >/dev/null 2>"$omop_mismatch_error"; then
  fail "wrong OMOP pseudonym salt passed preflight"
fi
grep -Fxq RESTORE_OMOP_PSEUDONYM_SALT_MISMATCH "$omop_mismatch_error" \
  || fail "wrong OMOP pseudonym salt did not return its stable refusal code"
[ ! -s "$calls" ] || fail "wrong OMOP pseudonym salt preflight mutated a database"
ok "wrong OMOP pseudonym salt fingerprint fails with a stable code before any database mutation"

if HOSPITAL_EXTERNAL_AI_SEAL_KEY_FINGERPRINT="$fp_d" run_restore verify "$object" >/dev/null 2>&1; then
  fail "wrong external-AI seal key passed preflight"
fi
[ ! -s "$calls" ] || fail "wrong external-AI key preflight mutated a database"
ok "wrong external-AI seal-key fingerprint fails before any database mutation"

if HOSPITAL_MFA_ENCRYPTION_KEY_FINGERPRINT="$fp_e" run_restore verify "$object" >/dev/null 2>&1; then
  fail "restore accepted an administrator MFA key mismatch"
fi
[ ! -s "$calls" ] || fail "wrong administrator MFA key preflight mutated a database"
ok "wrong administrator MFA key fingerprint fails before any database mutation"

if MOCK_POSTGRES_VERSION_NUM=160011 run_restore verify "$object" >/dev/null 2>&1; then
  fail "unsupported PostgreSQL major passed preflight"
fi
[ ! -s "$calls" ] || fail "PostgreSQL compatibility failure mutated a database"
ok "unsupported PostgreSQL major fails before any database mutation"

newer_object="$backup_dir/lospor-20260822T120000Z-newer001.backup"
cp -R "$object" "$newer_object"
newer_unsigned="$test_root/newer-unsigned.json"
manifest_lines="$(wc -l < "$newer_object/manifest.json" | tr -d '[:space:]')"
awk -v hmac_line="$((manifest_lines - 1))" -v previous_line="$((manifest_lines - 2))" '
  NR == hmac_line { next }
  NR == previous_line { sub(/,$/, "") }
  { print }
' "$newer_object/manifest.json" \
  | sed 's/"migrationCount":2/"migrationCount":3/' > "$newer_unsigned"
newer_hmac="$(openssl dgst -sha256 -hmac "$auth_key" "$newer_unsigned" | awk '{ print $NF }')"
sed '$d' "$newer_unsigned" | sed '$s/$/,/' > "$newer_object/manifest.json"
printf '  "manifestHmacSha256":"%s"\n}\n' "$newer_hmac" >> "$newer_object/manifest.json"
if run_restore verify "$newer_object" >/dev/null 2>&1; then
  fail "authenticated newer-schema backup passed preflight"
fi
[ ! -s "$calls" ] || fail "newer-schema preflight mutated a database"
ok "newer schema generation is refused before any database mutation"

cp "$object/database.dump" "$test_root/original.dump"
printf tampered >> "$object/database.dump"
if run_restore verify "$object" >/dev/null 2>&1; then fail "corrupt dump passed preflight"; fi
[ ! -s "$calls" ] || fail "corrupt-object preflight mutated a database"
mv "$test_root/original.dump" "$object/database.dump"
ok "corrupt dump fails before any database mutation"

ln -s "$object" "$backup_dir/lospor-20260822T120000Z-symlink1.backup"
if [ -L "$backup_dir/lospor-20260822T120000Z-symlink1.backup" ]; then
  if run_restore verify "$backup_dir/lospor-20260822T120000Z-symlink1.backup" >/dev/null 2>&1; then
    fail "symlinked object passed path preflight"
  fi
fi
mkdir "$backup_dir/nested"
cp -R "$object" "$backup_dir/nested/lospor-20260822T120000Z-nested01.backup"
if run_restore verify "$backup_dir/nested/lospor-20260822T120000Z-nested01.backup" >/dev/null 2>&1; then
  fail "nested non-canonical object passed path preflight"
fi
ok "symlink and non-canonical object paths are refused"

temporary_name=lospor_restore_fixture01
: > "$calls"
if LOSPOR_RESTORE_CONFIRM="WRONG" run_restore temporary "$object" "$temporary_name" >/dev/null 2>&1; then
  fail "temporary restore accepted a wrong typed confirmation"
fi
[ ! -s "$calls" ] || fail "wrong confirmation crossed the create boundary"
ok "temporary restore requires the exact site and timestamp confirmation"

: > "$calls"
LOSPOR_RESTORE_CONFIRM="TEMPORARY RESTORE site-fixture $completed_at" \
  run_restore temporary "$object" "$temporary_name" >/dev/null \
  || fail "confirmed temporary restore failed"
grep -Fq "createdb --host=postgres --username=lospor $temporary_name" "$calls" \
  && grep -Fq "pg_restore --host=postgres --username=lospor --dbname=$temporary_name" "$calls" \
  && ! grep -Fq 'ALTER DATABASE' "$calls" \
  || fail "temporary path did not remain isolated from the live database"
ok "default restore creates only a separate temporary database"

: > "$calls"
if MOCK_RESTORE_EXIT=1 LOSPOR_RESTORE_CONFIRM="TEMPORARY RESTORE site-fixture $completed_at" \
    run_restore temporary "$object" lospor_restore_fixture02 >/dev/null 2>&1; then
  fail "failed pg_restore returned success"
fi
grep -Fq 'createdb --host=postgres --username=lospor lospor_restore_fixture02' "$calls" \
  && grep -Fq 'dropdb --host=postgres --username=lospor --if-exists lospor_restore_fixture02' "$calls" \
  && ! grep -Fq 'ALTER DATABASE' "$calls" \
  || fail "failed temporary restore did not clean only its temporary database"
ok "temporary restore failure removes only its isolated database"

: > "$calls"
if MOCK_TARGET_EXISTS=1 LOSPOR_RESTORE_CONFIRM="EMERGENCY RESTORE site-fixture $completed_at" \
    run_restore switch "$object" "$temporary_name" lospor_previous_fixture01 >/dev/null 2>&1; then
  fail "switch crossed its boundary without the explicit acknowledgement"
fi
[ ! -s "$calls" ] || fail "missing boundary acknowledgement renamed a database"
ok "emergency switch requires a second explicit destructive-boundary acknowledgement"

: > "$calls"
if MOCK_TARGET_EXISTS=1 LOSPOR_RESTORE_DESTRUCTIVE_BOUNDARY_ACK=1 \
    LOSPOR_RESTORE_SAFETY_SNAPSHOT_MANIFEST_SHA256=0000000000000000000000000000000000000000000000000000000000000000 \
    LOSPOR_RESTORE_CONFIRM="EMERGENCY RESTORE site-fixture $completed_at" \
    run_restore switch "$object" "$temporary_name" lospor_previous_fixture01 >/dev/null 2>&1; then
  fail "switch accepted an unproven pre-restore safety snapshot"
fi
[ ! -s "$calls" ] || fail "invalid safety-snapshot proof renamed a database"
ok "emergency switch requires the authenticated fresh pre-restore snapshot proof"

: > "$calls"
preboundary_marker="$backup_dir/.restore-boundary-222222222222222222222222.started"
if LOSPOR_RESTORE_DESTRUCTIVE_BOUNDARY_ACK=1 \
    LOSPOR_RESTORE_BOUNDARY_MARKER="$preboundary_marker" \
    LOSPOR_RESTORE_CONFIRM="EMERGENCY RESTORE site-fixture $completed_at" \
    run_restore switch "$object" "$temporary_name" lospor_previous_fixture01 >/dev/null 2>&1; then
  fail "invalid database state returned success"
fi
[ ! -e "$preboundary_marker" ] && ! grep -Fq 'ALTER DATABASE' "$calls" \
  || fail "read-only switch refusal crossed the durable destructive boundary"
ok "failure immediately before the destructive boundary leaves an explicit reopen proof"

: > "$calls"
MOCK_TARGET_EXISTS=1 LOSPOR_RESTORE_DESTRUCTIVE_BOUNDARY_ACK=1 \
  LOSPOR_RESTORE_CONFIRM="EMERGENCY RESTORE site-fixture $completed_at" \
  run_restore switch "$object" "$temporary_name" lospor_previous_fixture01 >/dev/null \
  || fail "fully confirmed emergency switch failed"
grep -Fq 'ALTER DATABASE "lospor" RENAME TO "lospor_previous_fixture01"' "$calls" \
  && grep -Fq 'ALTER DATABASE "lospor_restore_fixture01" RENAME TO "lospor"' "$calls" \
  && ! grep -Fq 'dropdb' "$calls" \
  && [ -f "$backup_dir/.restore-boundary-111111111111111111111111.started/state" ] \
  || fail "emergency switch did not retain the previous database"
ok "emergency switch renames the live database aside and never drops it"

: > "$calls"
if MOCK_TARGET_EXISTS=1 MOCK_SWITCH_RENAME_FAIL=1 \
    LOSPOR_RESTORE_DESTRUCTIVE_BOUNDARY_ACK=1 \
    LOSPOR_RESTORE_BOUNDARY_MARKER="$backup_dir/.restore-boundary-333333333333333333333333.started" \
    LOSPOR_RESTORE_CONFIRM="EMERGENCY RESTORE site-fixture $completed_at" \
    run_restore switch "$object" "$temporary_name" lospor_previous_fixture02 >/dev/null 2>&1; then
  fail "failed second rename returned success"
fi
grep -Fq 'ALTER DATABASE "lospor_previous_fixture02" RENAME TO "lospor"' "$calls" \
  || fail "failed switch did not attempt the unambiguous name rollback"
ok "failed second rename attempts to restore the original live name and returns failure"

wrapper="$root/scripts/restore-backup.sh"
line_of() { grep -n -F "$1" "$wrapper" | head -n 1 | cut -d: -f1; }
assert_order() {
  first="$(line_of "$1")"; second="$(line_of "$2")"
  [ -n "$first" ] && [ -n "$second" ] && [ "$first" -lt "$second" ] \
    || fail "wrapper order is unsafe: $1 must precede $2"
}
assert_order 'restore_tool verify "$artifact_container"' 'docker compose stop caddy api delivery-worker web pwa browser backup'
assert_order 'HOSPITAL_RESTORE_DATABASE_RESERVE_BYTES="${HOSPITAL_RESTORE_DATABASE_RESERVE_BYTES:-5368709120}"' 'restore_tool temporary "$artifact_container" "$temporary_database"'
assert_order 'restore_tool validate "$artifact_container" "$temporary_database"' 'sh scripts/backup-now.sh --kind pre-restore'
assert_order 'sh scripts/backup-now.sh --kind pre-restore' 'journal QUIESCE STARTED'
assert_order 'safety_preflight="$(restore_tool verify "/backups/$safety_object_name")"' 'journal QUIESCE STARTED'
assert_order 'journal QUIESCE PASSED' 'restore_tool switch "$artifact_container" "$temporary_database" "$previous_database"'
switch_line="$(line_of 'restore_tool switch "$artifact_container" "$temporary_database" "$previous_database"')"
boundary_assignment_line="$(grep -n -E '^destructive_started=1$' "$wrapper" | cut -d: -f1)"
[ -n "$switch_line" ] && [ -n "$boundary_assignment_line" ] \
  && [ "$switch_line" -lt "$boundary_assignment_line" ] \
  || fail "wrapper marks the destructive boundary before the inner durable proof returns"
assert_order "journal HEALTH INTERNAL_PASSED" 'docker compose up -d caddy'
assert_order './scripts/doctor.sh --restore-preopen' 'docker compose up -d caddy'
traffic_line="$(line_of 'traffic_closed=1')"
quiesce_stop_line="$(grep -n -F 'docker compose stop caddy api delivery-worker web pwa browser backup' "$wrapper" | tail -n 1 | cut -d: -f1)"
internal_up_line="$(grep -n -E '^docker compose up -d api delivery-worker web pwa browser backup$' "$wrapper" | cut -d: -f1)"
caddy_up_line="$(grep -n -E '^docker compose up -d caddy$' "$wrapper" | cut -d: -f1)"
[ "$traffic_line" -lt "$quiesce_stop_line" ] && [ "$internal_up_line" -lt "$caddy_up_line" ] \
  || fail "wrapper does not close intent before quiesce or health-check before Caddy"
grep -Fq 'NEEDS_OPERATOR: the database switch began, so clinical traffic remains closed.' "$wrapper" \
  && grep -Fq 'if [ "$destructive_started" -eq 0 ]' "$wrapper" \
  && grep -Fq 'docker compose up -d api delivery-worker web pwa browser backup caddy' "$wrapper" \
  && grep -Fq 'docker compose stop caddy api delivery-worker web pwa browser backup' "$wrapper" \
  && grep -Fq '[ -e "$boundary_marker_host" ]' "$wrapper" \
  || fail "wrapper lacks post-boundary fail-closed handling"
ok "outer wrapper proves preflight/temporary/snapshot ordering and fail-closed post-boundary handling"

echo "restore hardening tests passed ($tests)"
