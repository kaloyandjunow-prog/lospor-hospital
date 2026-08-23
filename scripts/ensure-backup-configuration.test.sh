#!/bin/sh
set -eu

root="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"
work="$(mktemp -d)"
trap 'rm -rf -- "$work"' EXIT HUP INT TERM
mkdir -p "$work/scripts" "$work/infra/postgres" "$work/secrets/api"
cp "$root/scripts/ensure-backup-configuration.sh" "$work/scripts/"
cp "$root/scripts/mfa-encryption-key.sh" "$work/scripts/"
cp "$root/scripts/operator-locale.sh" "$work/scripts/"
cp "$root/infra/postgres/offhost-deferred.sh" "$work/infra/postgres/"

cat > "$work/.env" <<'EOF'
HOSPITAL_CLINICAL_DOMAIN=clinical.fixture.invalid
HOSPITAL_PATIENT_HMAC_KEY=patient-hmac-fixture
HOSPITAL_PATIENT_ENCRYPTION_KEY=patient-encryption-fixture
HOSPITAL_EXPORT_PSEUDONYM_KEY=export-pseudonym-fixture
OMOP_PSEUDONYM_SALT=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef
EOF
openssl genpkey -algorithm ED25519 -out "$work/secrets/api/site-signing-private.pem" >/dev/null 2>&1
openssl pkey -in "$work/secrets/api/site-signing-private.pem" -pubout \
  -out "$work/secrets/api/site-signing-public.pem" >/dev/null 2>&1
openssl rand -base64 32 | tr -d '\n' > "$work/secrets/api/external-ai-seal-key"
printf '\n' >> "$work/secrets/api/external-ai-seal-key"
openssl rand -base64 32 | tr -d '\n' > "$work/secrets/api/mfa-encryption-key"
printf '\n' >> "$work/secrets/api/mfa-encryption-key"

run_ensure() { sh "$work/scripts/ensure-backup-configuration.sh" >/dev/null; }
env_value() { sed -n "s/^$1=//p" "$work/.env" | tail -n 1; }

run_ensure
manifest_key="$(env_value HOSPITAL_BACKUP_MANIFEST_HMAC_KEY)"
[ "${#manifest_key}" -ge 32 ]
[ "$(tr -d '\r\n' < "$work/secrets/backup/manifest-hmac-key")" = "$manifest_key" ]
[ "$(env_value HOSPITAL_BACKUP_SITE_ID)" = clinical.fixture.invalid ]
printf '%s\n' "$(env_value HOSPITAL_BACKUP_APPLIANCE_ID)" | grep -Eq '^appliance-[0-9a-f]{24}$'
for key in HOSPITAL_PATIENT_HMAC_KEY_FINGERPRINT \
  HOSPITAL_PATIENT_ENCRYPTION_KEY_FINGERPRINT \
  HOSPITAL_EXPORT_PSEUDONYM_KEY_FINGERPRINT \
  HOSPITAL_OMOP_PSEUDONYM_SALT_FINGERPRINT \
  HOSPITAL_SITE_SIGNING_KEY_FINGERPRINT \
  HOSPITAL_EXTERNAL_AI_SEAL_KEY_FINGERPRINT \
  HOSPITAL_MFA_ENCRYPTION_KEY_FINGERPRINT
do
  printf '%s\n' "$(env_value "$key")" | grep -Eq '^sha256:[0-9a-f]{64}$'
done
expected_omop_fp="sha256:$(printf '%s' '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef' | sha256sum | awk '{ print $1 }')"
[ "$(env_value HOSPITAL_OMOP_PSEUDONYM_SALT_FINGERPRINT)" = "$expected_omop_fp" ]
set +e
sh "$work/secrets/backup/offhost-copy" ignored
hook_result=$?
set -e
[ "$hook_result" -eq 75 ]
printf 'ok 1 - fresh configuration persists authenticated identity and a deferred off-host hook\n'

before="$(sha256sum "$work/.env" | awk '{ print $1 }')"
run_ensure
after="$(sha256sum "$work/.env" | awk '{ print $1 }')"
[ "$before" = "$after" ]
for key in HOSPITAL_BACKUP_MANIFEST_HMAC_KEY HOSPITAL_BACKUP_SITE_ID HOSPITAL_BACKUP_APPLIANCE_ID
do
  [ "$(grep -c "^$key=" "$work/.env")" -eq 1 ]
done
printf 'ok 2 - validation is idempotent and never churns stable recovery identity\n'

sed 's/^OMOP_PSEUDONYM_SALT=.*/OMOP_PSEUDONYM_SALT=1123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef/' \
  "$work/.env" > "$work/.env.changed"
mv "$work/.env.changed" "$work/.env"
if run_ensure 2>/dev/null; then
  echo 'not ok 3 - changed OMOP pseudonym salt was silently rebound' >&2
  exit 1
fi
[ "$(env_value HOSPITAL_OMOP_PSEUDONYM_SALT_FINGERPRINT)" = "$expected_omop_fp" ]
sed 's/^OMOP_PSEUDONYM_SALT=.*/OMOP_PSEUDONYM_SALT=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef/' \
  "$work/.env" > "$work/.env.restored"
mv "$work/.env.restored" "$work/.env"
printf 'ok 3 - a changed OMOP pseudonym salt fails closed without rebinding backup identity\n'

printf '%s\n' different-key-material-with-at-least-32-characters > "$work/secrets/backup/manifest-hmac-key"
if run_ensure 2>/dev/null; then
  echo 'not ok 4 - mismatched escrow was silently replaced' >&2
  exit 1
fi
[ "$(env_value HOSPITAL_BACKUP_MANIFEST_HMAC_KEY)" = "$manifest_key" ]
printf 'ok 4 - mismatched manifest escrow fails closed without replacing either identity\n'

echo 'backup configuration tests passed (4)'
