#!/bin/sh
set -eu

root="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"
cd "$root"
. "$root/scripts/site-config.sh"
if [ -d "$root/.lospor-home" ]; then home="$(CDPATH= cd -- "$root/.lospor-home" && pwd -P)"; else home="$root"; fi

if [ -f .env ] || [ -e "$home/site.env" ] || [ -e "$home/secrets/appliance.env" ]; then
  echo "Hospital configuration already exists; refusing to replace Hospital secrets." >&2
  exit 1
fi

# Environment first, and a terminal or nothing.
#
# Values used to be readable only from a keyboard, so anything driving the
# install non-interactively fed them positionally into stdin -- and got them out
# of step the moment the list changed, writing a password into a domain field
# with no error at all.
#
# Honouring the environment fixed that for the values that existed then, and
# adding a fourth one brought it straight back: install.sh runs this script and
# then reads the administrator's password from the same standard input, so a
# prompt with nothing in the environment consumed that password and wrote it
# into the field it was asking about. Silently, and permanently, because a
# second run finds .env present and skips generation entirely.
#
# So this never reads from a pipe. A non-interactive install supplies every
# value in the environment, and a missing one names itself and stops. Reading
# whatever happens to be on standard input is what makes the whole class of bug
# possible, and no amount of keeping the list in step removes it.
prompt() {
  variable="$1"
  label="$2"
  default="$3"
  eval "current=\${$variable:-}"
  if [ -n "${current:-}" ]; then printf '%s' "$current"; return 0; fi
  if [ ! -t 0 ]; then
    printf '%s is not set.\n' "$variable" >&2
    printf 'A non-interactive install must supply every value in the environment; this script will not read them from standard input.\n' >&2
    exit 1
  fi
  printf "%s [%s]: " "$label" "$default" >&2
  if ! read -r value; then
    printf '\nNo value for %s.\n' "$variable" >&2
    exit 1
  fi
  printf "%s" "${value:-$default}"
}

# The default language is an appliance setting, not a user preference. An
# explicit login choice is stored on the account later; this value is only the
# first unauthenticated language for a new browser or phone.
default_locale="$(prompt LOSPOR_DEFAULT_LOCALE "Език по подразбиране / Default language (bg/en)" "bg")"
case "$default_locale" in
  bg|en) ;;
  *) echo "LOSPOR_DEFAULT_LOCALE трябва да бъде bg или en / must be bg or en." >&2; exit 1 ;;
esac

command -v python3 >/dev/null 2>&1 || {
  if [ "$default_locale" = bg ]; then
    echo "Необходим е Python 3 за безопасна проверка на мрежовите CIDR граници." >&2
  else
    echo "Python 3 is required to validate network CIDR boundaries safely." >&2
  fi
  exit 1
}

if [ "$default_locale" = bg ]; then
  acme_label="Имейл за ACME"
  clinical_label="Клиничен адрес (уеб, мобилно приложение, API)"
  research_label="Адрес на Research Browser"
  tls_label="TLS режим (operator/acme/local)"
  tls_ca_label="Път до доверения CA сертификат на болницата"
  research_cidrs_label="Точни Research/VPN мрежи (CIDR, разделени с интервал)"
  status_cidrs_label="Точни мрежи за ИТ управление (CIDR, разделени с интервал)"
  sender_label="Адрес на подателя за служебните писма"
  adult_guidance_label="Включване на вграденото предварително изчислено насочване за по-бързо въвеждане при възрастни (да/не)"
  pediatric_guidance_label="Включване на вграденото предварително изчислено насочване за по-бързо въвеждане при деца (да/не)"
  external_ai_label="Включване на външен AI за предоперативен съветник и разпознаване на изображения (да/не)"
  guidance_default="да"
else
  acme_label="ACME email"
  clinical_label="Clinical domain (web, phone app, API)"
  research_label="Research Browser domain"
  tls_label="TLS mode (operator/acme/local)"
  tls_ca_label="Path to the hospital's trusted CA certificate"
  research_cidrs_label="Exact Research/VPN networks (space-separated CIDRs)"
  status_cidrs_label="Exact IT management networks (space-separated CIDRs)"
  sender_label="Sender address for account email"
  adult_guidance_label="Enable bundled pre-calculated guidance for faster adult data entry (yes/no)"
  pediatric_guidance_label="Enable bundled pre-calculated guidance for faster pediatric data entry (yes/no)"
  external_ai_label="Enable external AI for the pre-operative advisor and image recognition (yes/no)"
  guidance_default="yes"
fi

# Two names, not four. The clinical one carries the web app, the phone app at
# /app and the API at /v1; research keeps its own name because it keeps its own
# network boundary.
acme_email="$(prompt ACME_EMAIL "$acme_label" "it@example-hospital.org")"
clinical_domain="$(prompt HOSPITAL_CLINICAL_DOMAIN "$clinical_label" "lospor.example-hospital.org")"
research_domain="$(prompt HOSPITAL_RESEARCH_DOMAIN "$research_label" "lospor-research.example-hospital.org")"
tls_mode="$(prompt HOSPITAL_TLS_MODE "$tls_label" "operator")"
case "$tls_mode" in
  acme|local|operator) ;;
  *)
    if [ "$default_locale" = bg ]; then
      echo "HOSPITAL_TLS_MODE трябва да бъде operator, acme или local." >&2
    else
      echo "HOSPITAL_TLS_MODE must be operator, acme or local." >&2
    fi
    exit 1
    ;;
esac
tls_verify_ca=""
if [ "$tls_mode" = operator ]; then
  tls_verify_ca="$(prompt HOSPITAL_TLS_VERIFY_CA "$tls_ca_label" "/etc/ssl/certs/hospital-ca.crt")"
fi

research_cidrs_raw="$(prompt HOSPITAL_RESEARCH_ALLOWED_CIDRS "$research_cidrs_label" "")"
status_cidrs_raw="$(prompt HOSPITAL_STATUS_ALLOWED_CIDRS "$status_cidrs_label" "")"
network_override=""
if [ "${HOSPITAL_NETWORK_ALLOW_ALL_PRIVATE:-}" = confirmed ]; then
  network_override="--allow-all-rfc1918"
fi
research_cidrs="$(python3 scripts/network-boundaries.py --locale "$default_locale" $network_override "$research_cidrs_raw")" || exit 1
status_cidrs="$(python3 scripts/network-boundaries.py --locale "$default_locale" $network_override "$status_cidrs_raw")" || exit 1

if [ "$tls_mode" = acme ]; then compose_profiles=tls-acme; else compose_profiles=""; fi

# The sender address for account email. It used to be fixed at
# no-reply@lospor.org: a hospital sending its own password-reset mail as the
# public project domain fails SPF and DKIM, because the hospital cannot sign
# for lospor.org, and tells the recipient the message came from someone it did
# not. The default is derived from this site's own name instead.
auth_email_from="$(prompt AUTH_EMAIL_FROM "$sender_label" "no-reply@${clinical_domain}")"
support_url="$(python3 scripts/support-url.py --locale "$default_locale" "${HOSPITAL_SUPPORT_URL:-}")" || exit 1

normalize_guidance_choice() {
  case "$1" in
    true|TRUE|yes|YES|y|Y|1|да|Да|ДА|д|Д) printf '%s' true ;;
    false|FALSE|no|NO|n|N|0|не|Не|НЕ|н|Н) printf '%s' false ;;
    *) return 1 ;;
  esac
}
adult_guidance_raw="$(prompt HOSPITAL_ADULT_GUIDANCE_DEFAULT "$adult_guidance_label" "$guidance_default")"
adult_guidance="$(normalize_guidance_choice "$adult_guidance_raw")" || {
  echo "Невалиден избор за насочване при възрастни (yes/no). / Invalid adult-guidance choice (yes/no)." >&2
  exit 1
}
pediatric_guidance_raw="$(prompt HOSPITAL_PEDIATRIC_GUIDANCE_DEFAULT "$pediatric_guidance_label" "$guidance_default")"
pediatric_guidance="$(normalize_guidance_choice "$pediatric_guidance_raw")" || {
  echo "Невалиден избор за насочване при деца (yes/no). / Invalid pediatric-guidance choice (yes/no)." >&2
  exit 1
}
external_ai_raw="$(prompt HOSPITAL_EXTERNAL_AI_DEFAULT "$external_ai_label" "$guidance_default")"
external_ai="$(normalize_guidance_choice "$external_ai_raw")" || {
  echo "Невалиден избор за външен AI (yes/no). / Invalid external-AI choice (yes/no)." >&2
  exit 1
}

update_supply_mode="${HOSPITAL_UPDATE_SUPPLY_MODE:-connected}"
case "$update_supply_mode" in
  connected|offline) ;;
  *)
    echo "HOSPITAL_UPDATE_SUPPLY_MODE трябва да бъде connected или offline. / HOSPITAL_UPDATE_SUPPLY_MODE must be connected or offline." >&2
    exit 1
    ;;
esac

offhost_hook_source="${HOSPITAL_BACKUP_OFFHOST_HOOK_SOURCE:-}"
if [ -n "$offhost_hook_source" ]; then
  case "$offhost_hook_source" in
    /*) ;;
    *)
      echo "HOSPITAL_BACKUP_OFFHOST_HOOK_SOURCE трябва да бъде абсолютен път / must be an absolute path." >&2
      exit 1
      ;;
  esac
  [ -f "$offhost_hook_source" ] && [ ! -L "$offhost_hook_source" ] && [ -x "$offhost_hook_source" ] || {
    echo "Файлът за външно архивиране трябва да е обикновен изпълним файл, а не символна връзка. / The off-host backup hook must be a regular executable, not a symlink." >&2
    exit 1
  }
fi

random_hex() {
  openssl rand -hex "$1"
}

random_base64_32() {
  openssl rand -base64 32 | tr -d '\n'
}

umask 077
# What hospital IT owns goes to site.env; everything generated goes to the
# root-only secrets/appliance.env. .env is compiled from both and never edited.
mkdir -p "$home/secrets"
chmod 700 "$home/secrets"
cat > "$home/site.env" <<EOF
LOSPOR_DEFAULT_LOCALE=$default_locale
ACME_EMAIL=$acme_email
HOSPITAL_CLINICAL_DOMAIN=$clinical_domain
HOSPITAL_RESEARCH_DOMAIN=$research_domain
HOSPITAL_SUPPORT_URL=$support_url
HOSPITAL_TLS_MODE=$tls_mode
HOSPITAL_TLS_VERIFY_CA=$tls_verify_ca
HOSPITAL_NETWORK_ALLOW_ALL_PRIVATE=${HOSPITAL_NETWORK_ALLOW_ALL_PRIVATE:-}
HOSPITAL_RESEARCH_ALLOWED_CIDRS="$research_cidrs"
HOSPITAL_STATUS_ALLOWED_CIDRS="$status_cidrs"
HOSPITAL_UPDATE_SUPPLY_MODE=$update_supply_mode
AUTH_EMAIL_FROM=$auth_email_from
AUTH_EMAIL_FROM_NAME=LOSPOR
EOF
cat > "$home/secrets/appliance.env" <<EOF
HOSPITAL_POSTGRES_PASSWORD=$(random_hex 32)
LOSPOR_AUTH_SECRET=$(random_hex 48)
HOSPITAL_OPERATIONAL_SECRET_GENERATION=1
HOSPITAL_PATIENT_HMAC_KEY=$(random_base64_32)
HOSPITAL_PATIENT_ENCRYPTION_KEY=$(random_base64_32)
HOSPITAL_EXPORT_PSEUDONYM_KEY=$(random_base64_32)
HOSPITAL_WORKER_TOKEN=$(random_hex 32)
RESEARCH_EXPORT_WORKER_SECRET=$(random_hex 32)
OMOP_PSEUDONYM_SALT=$(random_hex 32)
CRON_SECRET=$(random_hex 32)
OPTION_LIBRARY_SNAPSHOT_SECRET=$(random_hex 32)
HOSPITAL_ADULT_GUIDANCE_DEFAULT=$adult_guidance
HOSPITAL_PEDIATRIC_GUIDANCE_DEFAULT=$pediatric_guidance
HOSPITAL_EXTERNAL_AI_DEFAULT=$external_ai
HOSPITAL_EXPORT_BATCH_CASE_LIMIT=500
HOSPITAL_EXPORT_RETAIN_ACCEPTED_DAYS=7
HOSPITAL_BACKUP_MANIFEST_HMAC_KEY=$(random_hex 32)
HOSPITAL_BACKUP_INTERVAL_SECONDS=14400
HOSPITAL_BACKUP_RETRY_SECONDS=300
HOSPITAL_BACKUP_KEEP_ALL_SECONDS=172800
HOSPITAL_BACKUP_DAILY_POINTS=14
RESEARCH_EXPORT_RETENTION_DAYS=30
BREVO_API_KEY=
EOF
chmod 600 "$home/site.env" "$home/secrets/appliance.env"
site_config_compile "$home"

# secrets/tls holds an operator-supplied certificate when the hospital issues
# one from its own authority. Created empty so the mount exists and the
# directory has the right mode before anything is dropped into it.
mkdir -p secrets/api secrets/status secrets/tls secrets/backup backups reference-data
chmod 700 secrets secrets/api secrets/status secrets/tls secrets/backup backups
sh scripts/ensure-status-secrets.sh

# A dedicated, non-reused key seals the write-only external-AI provider
# credential stored in PostgreSQL. It is escrowed with the complete secrets/
# directory and never enters .env, Compose metadata, logs, or backup manifests.
printf '%s\n' "$(random_base64_32)" > secrets/api/external-ai-seal-key
chmod 600 secrets/api/external-ai-seal-key

# The same again for the EHR adapter credential, and deliberately a separate
# key rather than the external-AI one. Two integrations a site can enable
# independently should not share a secret: rotating or removing one must not be
# able to break the other, and an operator revoking AI access should not have
# to think about whether they have just disabled the hospital interface too.
printf '%s\n' "$(random_base64_32)" > secrets/api/ehr-transport-seal-key
chmod 600 secrets/api/ehr-transport-seal-key

# Clinical administrators enroll an offline TOTP factor on first sign-in. The
# seed is encrypted in PostgreSQL with this API-only key; the key itself is
# escrowed with the appliance secrets and never enters .env or Status.
printf '%s\n' "$(random_base64_32)" > secrets/api/mfa-encryption-key
chmod 600 secrets/api/mfa-encryption-key

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

# Persist the stable backup identity, compatibility-key fingerprints, local
# manifest-key escrow, and safe deferred off-host hook only after the signing
# public key exists. Updates call the same validator and never replace them.
sh scripts/ensure-backup-configuration.sh
if [ -n "$offhost_hook_source" ]; then
  hook_temporary="secrets/backup/.offhost-copy.tmp.$$"
  cp "$offhost_hook_source" "$hook_temporary"
  chmod 700 "$hook_temporary"
  mv "$hook_temporary" secrets/backup/offhost-copy
fi

if [ "$default_locale" = bg ]; then
  echo "Конфигурацията на Hospital е създадена."
  echo "Тази инсталация работи самостоятелно; клиничните данни остават локални."
  echo "За по-късно свързване с Central изпратете secrets/api/site-client.csr за подписване,"
  echo "поставете сертификата и CA в secrets/api/ и стартирайте scripts/enroll-central.sh."
else
  echo "Hospital configuration created."
  echo "This installation runs standalone; clinical data stays local."
  echo "To connect it to Central later, have Central sign secrets/api/site-client.csr,"
  echo "place the certificate and CA in secrets/api/, then run scripts/enroll-central.sh."
fi
