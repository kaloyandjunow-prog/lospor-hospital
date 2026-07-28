#!/bin/sh
set -eu

root="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"
cd "$root"

if [ -f .env ]; then
  echo ".env already exists; refusing to replace Hospital secrets." >&2
  exit 1
fi

prompt() {
  label="$1"
  default="$2"
  printf "%s [%s]: " "$label" "$default" >&2
  read -r value
  printf "%s" "${value:-$default}"
}

acme_email="$(prompt "ACME email" "it@example-hospital.org")"
web_domain="$(prompt "Clinical web domain" "lospor.example-hospital.org")"
pwa_domain="$(prompt "PWA domain" "lospor-pwa.example-hospital.org")"
api_domain="$(prompt "Mobile API domain" "lospor-api.example-hospital.org")"
research_domain="$(prompt "Research Browser domain" "lospor-research.example-hospital.org")"

random_hex() {
  openssl rand -hex "$1"
}

random_base64_32() {
  openssl rand -base64 32 | tr -d '\n'
}

umask 077
cat > .env <<EOF
ACME_EMAIL=$acme_email
HOSPITAL_WEB_DOMAIN=$web_domain
HOSPITAL_PWA_DOMAIN=$pwa_domain
HOSPITAL_API_DOMAIN=$api_domain
HOSPITAL_RESEARCH_DOMAIN=$research_domain
HOSPITAL_RESEARCH_ALLOWED_CIDRS="10.0.0.0/8 172.16.0.0/12 192.168.0.0/16"
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
HOSPITAL_BACKUP_RETENTION_DAYS=30
RESEARCH_EXPORT_RETENTION_DAYS=30
BREVO_API_KEY=
AUTH_EMAIL_FROM=no-reply@lospor.org
AUTH_EMAIL_FROM_NAME=LOSPOR
EOF
chmod 600 .env

mkdir -p secrets backups reference-data
chmod 700 secrets backups

openssl genpkey -algorithm ED25519 -out secrets/site-signing-private.pem
openssl pkey \
  -in secrets/site-signing-private.pem \
  -pubout \
  -out secrets/site-signing-public.pem
openssl req \
  -new \
  -newkey rsa:3072 \
  -nodes \
  -keyout secrets/site-client-key.pem \
  -out secrets/site-client.csr \
  -subj "/CN=LOSPOR-HOSPITAL"

# Placeholders let the appliance start before Central enrollment. Replace both
# with the Central-issued client certificate and trusted Central CA.
openssl x509 \
  -req \
  -in secrets/site-client.csr \
  -signkey secrets/site-client-key.pem \
  -out secrets/site-client-cert.pem \
  -days 30 \
  -sha256
cp secrets/site-client-cert.pem secrets/central-ca.pem
chmod 600 secrets/*-private.pem secrets/*-key.pem

echo "Hospital configuration created."
echo "Before Central enrollment, have Central sign secrets/site-client.csr."
