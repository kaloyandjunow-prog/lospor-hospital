#!/bin/sh
set -eu

root="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"
test_root="$(mktemp -d "${TMPDIR:-/tmp}/lospor-restore-wrapper.XXXXXX")"
cleanup() { rm -rf -- "$test_root"; }
trap cleanup EXIT HUP INT TERM

tests=0
ok() { tests=$((tests + 1)); printf 'ok %s - %s\n' "$tests" "$1"; }
fail() { printf 'FAIL: %s\n' "$1" >&2; exit 1; }

artifact_name=lospor-20260822T120000Z-source01.backup
confirmation='EMERGENCY RESTORE site-fixture 2026-08-22T12:00:00Z'

make_fixture() {
  fixture_name="$1"
  fixture="$test_root/$fixture_name"
  mkdir -p "$fixture/scripts" "$fixture/secrets/api" "$fixture/backups" "$fixture/mocks"
  cp "$root/scripts/restore-backup.sh" "$fixture/scripts/restore-backup.sh"
  cp "$root/scripts/ehr-transport-seal-key.sh" "$fixture/scripts/ehr-transport-seal-key.sh"
  cp "$root/scripts/external-ai-seal-key.sh" "$fixture/scripts/external-ai-seal-key.sh"
  cp "$root/scripts/mfa-encryption-key.sh" "$fixture/scripts/mfa-encryption-key.sh"
  cp "$root/scripts/operator-locale.sh" "$fixture/scripts/operator-locale.sh"
  cp "$root/infra/release-signing/release-signing-public.pem" \
    "$fixture/secrets/api/site-signing-public.pem"
  mkdir "$fixture/backups/$artifact_name"
  printf '{"fixture":"source-manifest"}\n' > "$fixture/backups/$artifact_name/manifest.json"

  cat > "$fixture/package.json" <<'EOF'
{
  "version": "1.2.0",
  "private": true
}
EOF
  cat > "$fixture/UPSTREAM_VERSIONS.json" <<'EOF'
{
  "exchangeContract": {
    "version": "2.2.0"
  }
}
EOF
  cat > "$fixture/.env" <<'EOF'
HOSPITAL_BACKUP_MANIFEST_HMAC_KEY=0123456789abcdef0123456789abcdef0123456789abcdef
LOSPOR_DEFAULT_LOCALE=en
HOSPITAL_PATIENT_HMAC_KEY=patient-hmac-fixture
HOSPITAL_PATIENT_ENCRYPTION_KEY=patient-encryption-fixture
HOSPITAL_EXPORT_PSEUDONYM_KEY=export-pseudonym-fixture
OMOP_PSEUDONYM_SALT=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef
HOSPITAL_OMOP_PSEUDONYM_SALT_FINGERPRINT=sha256:a8ae6e6ee929abea3afcfc5258c8ccd6f85273e0d4626d26c7279f3250f77c8e
HOSPITAL_POSTGRES_PASSWORD=postgres-fixture
HOSPITAL_CLINICAL_DOMAIN=clinical.fixture
HOSPITAL_BACKUP_SITE_ID=site-fixture
HOSPITAL_BACKUP_APPLIANCE_ID=appliance-fixture
HOSPITAL_RELEASE=1.2.0
HOSPITAL_EXCHANGE_CONTRACT_VERSION=2.2.0
HOSPITAL_DATA_DICTIONARY_VERSION=2.2.0
HOSPITAL_RESTORE_DATABASE_RESERVE_BYTES=1
HOSPITAL_RESTORE_SPACE_MULTIPLIER_PERCENT=100
EOF
  printf '%s\n' AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA= > "$fixture/secrets/api/ehr-transport-seal-key"
  printf '%s\n' AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA= > "$fixture/secrets/api/external-ai-seal-key"
  printf '%s\n' AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE= > "$fixture/secrets/api/mfa-encryption-key"
  cat > "$fixture/scripts/installed-release-state.sh" <<'STUB'
release_state_appliance_home() { printf '%s\n' "$1"; }
release_state_apply() { return 10; }
release_state_assert_verified_transition() { :; }
STUB
  cat > "$fixture/scripts/backup-now.sh" <<'STUB'
#!/bin/sh
set -eu
[ "$*" = '--kind pre-restore' ] || exit 2
object="$MOCK_REPO/backups/lospor-20260822T130000Z-safety99.backup"
mkdir "$object"
printf '{"fixture":"authenticated-by-mocked-inner-preflight"}\n' > "$object/manifest.json"
printf 'schemaVersion=1\nkind=pre-restore\n' > "$object/.retain-pre-restore"
manifest_sha="$(sha256sum "$object/manifest.json" | awk '{ print $1 }')"
printf 'schemaVersion=1\ncompletedAtEpoch=1787403600\nobjectName=%s\nmanifestSha256=%s\n' \
  "$(basename "$object")" "$manifest_sha" > "$MOCK_REPO/backups/.last-verified.v1"
STUB
  cat > "$fixture/scripts/postgres-update-gate.sh" <<'STUB'
#!/bin/sh
printf 'postgres-gate %s\n' "$*" >> "$MOCK_LOG"
STUB
  cat > "$fixture/scripts/appliance-operator.sh" <<'STUB'
#!/bin/sh
printf 'appliance-operator %s\n' "$*" >> "$MOCK_LOG"
STUB
  cat > "$fixture/scripts/doctor.sh" <<'STUB'
#!/bin/sh
if [ "${1:-}" = --restore-preopen ]; then
  printf '%s\n' 'doctor preopen' >> "$MOCK_LOG"
  printf '%s\n' RESTORE_PREOPEN_OK
  exit "${MOCK_PREOPEN_DOCTOR_EXIT:-0}"
fi
printf '%s\n' 'doctor ordinary' >> "$MOCK_LOG"
exit "${MOCK_DOCTOR_EXIT:-0}"
STUB
  cat > "$fixture/mocks/docker" <<'MOCK'
#!/bin/sh
set -eu
printf 'docker %s\n' "$*" >> "$MOCK_LOG"
case " $* " in
  *" --entrypoint /usr/local/bin/restore.sh backup verify "*)
    for verify_argument in "$@"; do verify_last="$verify_argument"; done
    verify_name="${verify_last#/backups/}"
    verify_manifest_sha="$(sha256sum "$MOCK_REPO/backups/$verify_name/manifest.json" | awk '{ print $1 }')"
    printf '%s\n' \
      RESTORE_PREFLIGHT_OK \
      RESTORE_SITE_ID=site-fixture \
      RESTORE_COMPLETED_AT=2026-08-22T12:00:00Z \
      RESTORE_COMPLETED_EPOCH=1787400000 \
      RESTORE_SOURCE_DATABASE_BYTES=1000 \
      RESTORE_MIGRATION_COUNT=2 \
      RESTORE_MANIFEST_SHA256="$verify_manifest_sha"
    ;;
  *" --entrypoint /usr/local/bin/restore.sh backup switch "*)
    if [ "${MOCK_SWITCH_BOUNDARY:-1}" -eq 1 ]; then
      case "${LOSPOR_RESTORE_BOUNDARY_MARKER:-}" in
        /backups/.restore-boundary-*.started)
          marker="$MOCK_REPO/backups/${LOSPOR_RESTORE_BOUNDARY_MARKER#/backups/}"
          mkdir "$marker"
          printf 'schemaVersion=1\n' > "$marker/state"
          ;;
        *) exit 2 ;;
      esac
    fi
    exit "${MOCK_SWITCH_EXIT:-0}"
    ;;
  *" compose stop caddy api delivery-worker web pwa browser backup "*)
    exit "${MOCK_QUIESCE_EXIT:-0}"
    ;;
esac
exit 0
MOCK
  chmod +x "$fixture/scripts/backup-now.sh" "$fixture/scripts/postgres-update-gate.sh" \
    "$fixture/scripts/appliance-operator.sh" "$fixture/scripts/doctor.sh" "$fixture/mocks/docker"
  fixture_log="$fixture/calls.log"
  : > "$fixture_log"
}

run_wrapper() {
  set +e
  PATH="$fixture/mocks:$PATH" MOCK_REPO="$fixture" MOCK_LOG="$fixture_log" \
    MOCK_QUIESCE_EXIT="${MOCK_QUIESCE_EXIT:-0}" \
    MOCK_SWITCH_BOUNDARY="${MOCK_SWITCH_BOUNDARY:-1}" \
    MOCK_SWITCH_EXIT="${MOCK_SWITCH_EXIT:-0}" \
    LOSPOR_RESTORE_CONFIRM_INPUT="$confirmation" \
    sh "$fixture/scripts/restore-backup.sh" --in-place "backups/$artifact_name" \
      > "$fixture/stdout" 2> "$fixture/stderr"
  wrapper_result=$?
  set -e
}

make_fixture omop_drift
sed 's/^OMOP_PSEUDONYM_SALT=0/OMOP_PSEUDONYM_SALT=1/' "$fixture/.env" > "$fixture/.env.changed"
mv "$fixture/.env.changed" "$fixture/.env"
run_wrapper
[ "$wrapper_result" -ne 0 ] || fail "restore wrapper accepted an OMOP pseudonym salt that differed from persisted installation identity"
[ ! -s "$fixture_log" ] \
  && grep -Fq 'restore was not started' "$fixture/stderr" \
  || fail "OMOP pseudonym salt drift reached Docker or lacked a truthful refusal"
ok "outer wrapper refuses OMOP pseudonym salt drift before Docker or database mutation"

make_fixture preboundary
MOCK_QUIESCE_EXIT=1 MOCK_SWITCH_BOUNDARY=0 run_wrapper
[ "$wrapper_result" -ne 0 ] || fail "quiesce failure returned success"
grep -Fq 'docker compose stop caddy api delivery-worker web pwa browser backup' "$fixture_log" \
  && grep -Fq 'docker compose up -d api delivery-worker web pwa browser backup caddy' "$fixture_log" \
  && grep -Rq 'phase=DESTRUCTIVE_RESTORE result=REFUSED_PRE_BOUNDARY_REOPENED' "$fixture/backups/.restore-journal" \
  && grep -Fq 'discard-temporary' "$fixture_log" \
  || fail "pre-boundary failure did not restart and journal the unchanged stack"
ok "outer wrapper reopens the unchanged stack after a real pre-boundary failure"

make_fixture switch_preboundary
MOCK_SWITCH_BOUNDARY=0 MOCK_SWITCH_EXIT=1 run_wrapper
[ "$wrapper_result" -ne 0 ] || fail "inner pre-boundary refusal returned success"
grep -Fq 'docker compose stop caddy api delivery-worker web pwa browser backup' "$fixture_log" \
  && grep -Fq 'docker compose up -d api delivery-worker web pwa browser backup caddy' "$fixture_log" \
  && grep -Rq 'phase=DESTRUCTIVE_RESTORE result=REFUSED_PRE_BOUNDARY_REOPENED' "$fixture/backups/.restore-journal" \
  && ! find "$fixture/backups" -mindepth 1 -maxdepth 1 -type d -name '.restore-boundary-*.started' | grep -q . \
  && grep -Fq 'discard-temporary' "$fixture_log" \
  || fail "inner read-only refusal did not reopen with the boundary demonstrably uncrossed"
ok "outer wrapper reopens after inner switch validation refuses before its durable boundary"

make_fixture postboundary
MOCK_SWITCH_EXIT=1 run_wrapper
[ "$wrapper_result" -ne 0 ] || fail "post-boundary switch failure returned success"
grep -Fq 'NEEDS_OPERATOR: the database switch began, so clinical traffic remains closed.' "$fixture/stderr" \
  && grep -Rq 'phase=NEEDS_OPERATOR result=SWITCH_OR_HEALTH_FAILED' "$fixture/backups/.restore-journal" \
  && [ "$(grep -c 'docker compose stop caddy api delivery-worker web pwa browser backup' "$fixture_log")" -ge 2 ] \
  && ! grep -Fq 'docker compose up -d api delivery-worker web pwa browser backup caddy' "$fixture_log" \
  && ! grep -Fq 'discard-temporary' "$fixture_log" \
  || fail "post-boundary failure did not remain closed and inspectable"
ok "outer wrapper leaves traffic closed after a durable destructive-boundary failure"
# The boundary marker is the only trustworthy signal, so the same trap must
# drop the copy while it is absent and never touch a database once it exists.
ok "post-boundary failure leaves both databases for the operator, dropping neither"

make_fixture success
run_wrapper
[ "$wrapper_result" -eq 0 ] || {
  sed -n '1,160p' "$fixture/stderr" >&2
  fail "valid mocked emergency restore failed"
}
preopen_line="$(grep -n -F 'doctor preopen' "$fixture_log" | cut -d: -f1)"
caddy_line="$(grep -n -F 'docker compose up -d caddy' "$fixture_log" | cut -d: -f1)"
ordinary_line="$(grep -n -F 'doctor ordinary' "$fixture_log" | cut -d: -f1)"
[ -n "$preopen_line" ] && [ -n "$caddy_line" ] && [ -n "$ordinary_line" ] \
  && [ "$preopen_line" -lt "$caddy_line" ] && [ "$caddy_line" -lt "$ordinary_line" ] \
  && grep -Rq 'phase=COMPLETE result=PASSED' "$fixture/backups/.restore-journal" \
  && grep -Fq "objectName=$artifact_name" "$fixture/backups/.last-verified.v1" \
  || fail "valid wrapper did not prove pre-open doctor, public open, ordinary doctor, and completion order"
ok "valid outer restore passes pre-open doctor before Caddy and ordinary doctor afterwards"

echo "restore wrapper tests passed ($tests)"
