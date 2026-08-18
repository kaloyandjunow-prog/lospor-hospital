#!/bin/sh
set -eu

root="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"
cd "$root"

if [ -f .env ]; then
  echo ".env already exists; refusing to replace Hospital secrets." >&2
  exit 1
fi

# Environment first, then the prompt.
#
# Without this the three values could only be typed at a keyboard, so anything
# driving the install non-interactively had to feed them positionally into
# stdin -- and got them out of step the moment .env already existed, writing a
# password into a domain field with no error at all. install.sh has honoured
# its own variables all along; secrets generation now behaves the same way.
prompt() {
  variable="$1"
  label="$2"
  default="$3"
  eval "current=\${$variable:-}"
  if [ -n "${current:-}" ]; then printf '%s' "$current"; return 0; fi
  printf "%s [%s]: " "$label" "$default" >&2
  read -r value
  printf "%s" "${value:-$default}"
}

# Two names, not four. The clinical one carries the web app, the phone app at
# /app and the API at /v1; research keeps its own name because it keeps its own
# network boundary.
acme_email="$(prompt ACME_EMAIL "ACME email" "it@example-hospital.org")"
clinical_domain="$(prompt HOSPITAL_CLINICAL_DOMAIN "Clinical domain (web, phone app, API)" "lospor.example-hospital.org")"
research_domain="$(prompt HOSPITAL_RESEARCH_DOMAIN "Research Browser domain" "lospor-research.example-hospital.org")"

random_hex() {
  openssl rand -hex "$1"
}

random_base64_32() {
  openssl rand -base64 32 | tr -d '\n'
}

umask 077
cat > .env <<EOF
ACME_EMAIL=$acme_email
HOSPITAL_CLINICAL_DOMAIN=$clinical_domain
HOSPITAL_RESEARCH_DOMAIN=$research_domain
HOSPITAL_RESEARCH_ALLOWED_CIDRS="10.0.0.0/8 172.16.0.0/12 192.168.0.0/16"
HOSPITAL_STATUS_ALLOWED_CIDRS="10.0.0.0/8 172.16.0.0/12 192.168.0.0/16"
HOSPITAL_POSTGRES_PASSWORD=$(random_hex 32)
LOSPOR_AUTH_SECRET=$(random_hex 48)
HOSPITAL_PATIENT_HMAC_KEY=$(random_base64_32)
HOSPITAL_PATIENT_ENCRYPTION_KEY=$(random_base64_32)
HOSPITAL_EXPORT_PSEUDONYM_KEY=$(random_base64_32)
HOSPITAL_WORKER_TOKEN=$(random_hex 32)
RESEARCH_EXPORT_WORKER_SECRET=$(random_hex 32)
OMOP_PSEUDONYM_SALT=$(random_hex 32)
CRON_SECRET=$(random_hex 32)
OPTION_LIBRARY_SNAPSHOT_SECRET=$(random_hex 32)
HOSPITAL_EXPORT_BATCH_CASE_LIMIT=500
HOSPITAL_EXPORT_RETAIN_ACCEPTED_DAYS=7
HOSPITAL_BACKUP_INTERVAL_SECONDS=86400
HOSPITAL_BACKUP_RETRY_SECONDS=300
HOSPITAL_BACKUP_RETENTION_DAYS=30
RESEARCH_EXPORT_RETENTION_DAYS=30
BREVO_API_KEY=
AUTH_EMAIL_FROM=no-reply@lospor.org
AUTH_EMAIL_FROM_NAME=LOSPOR
EOF
chmod 600 .env

mkdir -p secrets/api secrets/status backups reference-data
chmod 700 secrets secrets/api secrets/status backups
sh scripts/ensure-status-secrets.sh

openssl genpkey -algorithm ED25519 -out secrets/api/site-signing-private.pem
openssl pkey \
  -in secrets/api/site-signing-private.pem \
  -pubout \
  -out secrets/api/site-signing-public.pem
openssl req \
  -new \
  -newkey rsa:3072 \
  -nodes \
  -keyout secrets/api/site-client-key.pem \
  -out secrets/api/site-client.csr \
  -subj "/CN=LOSPOR-HOSPITAL"

# No client certificate or Central CA is created here. This used to emit a
# 30-day self-signed certificate and copy it over central-ca.pem so the
# appliance would start before enrollment. That worked, but it left every
# standalone installation holding a certificate that expires silently and a
# "Central CA" that trusts nothing but itself — an installation could not tell
# whether it was enrolled by looking at its own secrets.
#
# The client credentials are optional now, so a standalone installation simply
# does not have them. Whether a site is enrolled is answered by
# HospitalInstallation.centralEnabled in the database, which only a real
# enrollment sets, and never by the presence of a file.
chmod 600 secrets/api/*-private.pem secrets/api/*-key.pem

echo "Hospital configuration created."
echo "This installation runs standalone; clinical data stays local."
echo "To connect it to Central later, have Central sign secrets/api/site-client.csr,"
echo "place the certificate and CA in secrets/api/, then run scripts/enroll-central.sh."
