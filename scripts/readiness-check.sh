#!/bin/sh
set -eu

root="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"
. "$root/scripts/ehr-transport-seal-key.sh"
. "$root/scripts/external-ai-seal-key.sh"
. "$root/scripts/mfa-encryption-key.sh"
. "$root/scripts/readiness-lib.sh"

# Configuration lives in the appliance home, which is not the release root.
#
# A release tree reaches it through the .lospor-home symlink that both
# activation and losporctl-install.sh drop beside it -- the same idiom
# generate-secrets.sh, site-config.sh and ensure-backup-configuration.sh use.
# Reading "$root/.env" directly worked only for an already-activated release
# that happened to have one. On a resumed install the bootstrap tree has no
# .env, so every lookup returned empty and the network boundaries were reported
# as unsafe when they were merely unread:
#   FAIL HOSPITAL_RESEARCH_ALLOWED_CIDRS is not a safe exact network boundary
# which made --resume impossible to get past.
if [ -d "$root/.lospor-home" ]; then
  config_home="$(CDPATH= cd -- "$root/.lospor-home" && pwd -P)"
else
  config_home="$root"
fi
config_env="$config_home/.env"
[ -f "$config_env" ] || config_env="$root/.env"

configured_locale="$(sed -n 's/^LOSPOR_DEFAULT_LOCALE=//p' "$config_env" 2>/dev/null | tail -n 1 | tr -d '\r\"')"
readiness_locale="${LOSPOR_DEFAULT_LOCALE:-$configured_locale}"
case "$readiness_locale" in bg|en) ;; *) readiness_locale=bg ;; esac
pick() {
  if [ "$readiness_locale" = bg ]; then printf '%s' "$2"; else printf '%s' "$1"; fi
}

strict=false
preinstall=false
while [ "$#" -gt 0 ]; do
  case "$1" in
    --strict) strict=true ;;
    --preinstall) preinstall=true ;;
    *) echo "$(pick 'Usage: scripts/readiness-check.sh [--strict] [--preinstall]' 'Употреба: scripts/readiness-check.sh [--strict] [--preinstall]')" >&2; exit 2 ;;
  esac
  shift
done

failures=0
warnings=0
pass() { printf '%s  %s\n' "$(pick PASS УСПЕХ)" "$1"; }
fail() { failures=$((failures + 1)); printf '%s  %s\n' "$(pick FAIL ГРЕШКА)" "$1" >&2; }
warn() { warnings=$((warnings + 1)); printf '%s  %s\n' "$(pick WARN ВНИМАНИЕ)" "$1" >&2; }

require_command() {
  if command -v "$1" >/dev/null 2>&1; then
    pass "$(pick "$1 is installed" "Командата $1 е налична")"
  else
    fail "$(pick "$1 is required" "Командата $1 е задължителна")"
  fi
}

echo "$(pick 'LOSPOR Hospital host readiness (read-only)' 'Готовност на сървъра за LOSPOR Hospital (само проверка)')"
for command_name in docker openssl curl sshd getent ss systemctl timedatectl python3 flock \
  sha256sum gzip tar
do
  require_command "$command_name"
done

if [ -r /usr/share/zoneinfo/UTC ]; then
  pass "$(pick 'system time-zone database is available' 'Системната база с часови зони е налична')"
else
  fail "$(pick 'system time-zone database is missing' 'Липсва системната база с часови зони')"
fi

os_id=""
os_version=""
if [ -r /etc/os-release ]; then
  # /etc/os-release is an operating-system-owned data file. Extract only the
  # two literal fields needed here; do not source it as shell code.
  os_id="$(sed -n 's/^ID=//p' /etc/os-release | tail -n 1 | tr -d '"\r')"
  os_version="$(sed -n 's/^VERSION_ID=//p' /etc/os-release | tail -n 1 | tr -d '"\r')"
fi
host_arch="$(uname -m 2>/dev/null || true)"
if readiness_supported_os "$os_id" "$os_version" "$host_arch"; then
  pass "$(pick 'host is Ubuntu 24.04 LTS amd64' 'сървърът е Ubuntu 24.04 LTS amd64')"
else
  fail "$(pick 'host must be Ubuntu 24.04 LTS amd64 (Windows Server hosts it in Hyper-V)' 'сървърът трябва да бъде Ubuntu 24.04 LTS amd64 (под Windows Server се използва Hyper-V)')"
fi

if command -v docker >/dev/null 2>&1; then
  if docker_info="$(docker info --format '{{.OSType}}|{{.Architecture}}|{{.NCPU}}|{{.MemTotal}}|{{.DockerRootDir}}' 2>/dev/null)"; then
    old_ifs="$IFS"; IFS='|'; set -- $docker_info; IFS="$old_ifs"
    docker_os="${1:-}"; docker_arch="${2:-}"; docker_cpus="${3:-0}"
    docker_memory="${4:-0}"; docker_root="${5:-}"
    if [ "$docker_os" = linux ] && { [ "$docker_arch" = x86_64 ] || [ "$docker_arch" = amd64 ]; }; then
      pass "$(pick 'Docker Engine runs Linux amd64 containers' 'Docker Engine изпълнява Linux amd64 контейнери')"
    else
      fail "$(pick 'Docker Engine must run Linux amd64 containers' 'Docker Engine трябва да изпълнява Linux amd64 контейнери')"
    fi
    if readiness_at_least "$docker_cpus" 8; then
      pass "$(pick 'Docker has at least 8 CPU cores' 'Docker разполага с поне 8 процесорни ядра')"
    else
      fail "$(pick "Docker needs at least 8 CPU cores (reported ${docker_cpus:-unknown})" "Docker изисква поне 8 процесорни ядра (отчетени ${docker_cpus:-неизвестно})")"
    fi
    if readiness_memory_enough "$docker_memory"; then
      pass "$(pick 'Docker has the 16 GB of RAM it needs' 'Docker разполага с нужните 16 GB RAM')"
    else
      fail "$(pick "Docker needs a server with 16 GB of RAM (reported ${docker_memory:-unknown} bytes)" "Docker изисква сървър с 16 GB RAM (отчетени ${docker_memory:-неизвестно} байта)")"
    fi
  else
    docker_root=""
    fail "$(pick 'Docker Engine is not reachable by this operator' 'Този оператор няма достъп до Docker Engine')"
  fi

  compose_version="$(docker compose version --short 2>/dev/null || true)"
  if readiness_compose_supported "$compose_version"; then
    pass "$(pick "Docker Compose 2.19.0 or newer is available ($compose_version)" "Наличен е Docker Compose 2.19.0 или по-нов ($compose_version)")"
  else
    fail "$(pick 'Docker Compose 2.19.0 or newer is required' 'Необходим е Docker Compose 2.19.0 или по-нов')"
  fi
fi

check_free_space() {
  label="$1"; path="$2"
  available_kib="$(df -Pk "$path" 2>/dev/null | awk 'NR == 2 { print $4 }')"
  if readiness_at_least "$available_kib" 209715200; then
    pass "$(pick "$label has at least 200 GiB free" "$label разполага с поне 200 GiB свободно място")"
  else
    fail "$(pick "$label needs at least 200 GiB free" "$label изисква поне 200 GiB свободно място")"
  fi
}
check_free_space "$(pick 'appliance filesystem' 'Файловата система на appliance')" "$root"
if [ -n "${docker_root:-}" ] && [ "$docker_root" != "$root" ]; then
  check_free_space "$(pick 'Docker storage filesystem' 'Файловата система на Docker')" "$docker_root"
fi

if command -v timedatectl >/dev/null 2>&1; then
  synchronized="$(timedatectl show --property=NTPSynchronized --value 2>/dev/null || true)"
  if [ "$synchronized" = yes ]; then
    pass "$(pick 'system clock is synchronized' 'системният часовник е синхронизиран')"
  else
    fail "$(pick 'system clock is not confirmed synchronized; TLS and clinical timestamps depend on it' 'синхронизацията на системния часовник не е потвърдена; TLS и клиничните времена зависят от нея')"
  fi
fi
if command -v systemctl >/dev/null 2>&1 && command -v sshd >/dev/null 2>&1; then
  # ssh.socket counts. Ubuntu 24.04 socket-activates OpenSSH, so ssh.service
  # reads "inactive" until the first connection arrives and ssh.socket is the
  # unit actually listening. Checking only ssh.service failed a server whose
  # recovery tunnel was perfectly available -- and failed it hardest at first
  # boot, before anyone had connected even once.
  if systemctl is-active --quiet ssh 2>/dev/null \
    || systemctl is-active --quiet ssh.socket 2>/dev/null \
    || systemctl is-active --quiet sshd 2>/dev/null; then
    pass "$(pick 'OpenSSH Server is active for the Status recovery tunnel' 'OpenSSH Server е активен за резервния тунел към Status')"
  else
    fail "$(pick 'OpenSSH Server is not active; the Status recovery tunnel would be unavailable' 'OpenSSH Server не е активен; резервният тунел към Status няма да бъде достъпен')"
  fi
fi

env_value() {
  key="$1"
  eval "inherited_set=\${$key+x}"
  if [ "${inherited_set:-}" = x ]; then
    eval "inherited_value=\${$key-}"
    printf '%s\n' "$inherited_value"
    return 0
  fi
  sed -n "s/^${key}=//p" "$config_env" 2>/dev/null \
    | tail -n 1 | tr -d '\r' | sed 's/^"//; s/"$//'
}

configuration_available=false
using_preinstall_environment=false
if [ "$preinstall" = true ] && [ -n "${HOSPITAL_CLINICAL_DOMAIN:-}" ] \
    && [ -n "${HOSPITAL_RESEARCH_DOMAIN:-}" ] \
    && [ -n "${HOSPITAL_TLS_MODE:-}" ]; then
  configuration_available=true
  using_preinstall_environment=true
elif [ -f "$config_env" ]; then
  configuration_available=true
elif [ "$preinstall" = true ] && [ -n "$(env_value HOSPITAL_CLINICAL_DOMAIN)" ] \
    && [ -n "$(env_value HOSPITAL_RESEARCH_DOMAIN)" ] \
    && [ -n "$(env_value HOSPITAL_TLS_MODE)" ]; then
  configuration_available=true
fi

if [ "$configuration_available" = true ]; then
  clinical_domain="$(env_value HOSPITAL_CLINICAL_DOMAIN)"
  research_domain="$(env_value HOSPITAL_RESEARCH_DOMAIN)"
  if [ -n "$clinical_domain" ] && [ "$clinical_domain" = "$research_domain" ]; then
    fail "$(pick 'clinical and Research must use different hostnames so their network boundaries cannot collapse' 'Clinical и Research трябва да използват различни имена, за да не се слеят мрежовите им граници')"
  fi
  for domain in "$clinical_domain" "$research_domain"; do
    if readiness_hostname "$domain" && getent ahosts "$domain" >/dev/null 2>&1; then
      pass "$(pick "DNS resolves $domain" "DNS намира $domain")"
    else
      fail "$(pick "configured domain does not resolve: ${domain:-missing}" "Конфигурираният адрес не се намира в DNS: ${domain:-липсва}")"
    fi
  done

  network_override="$(env_value HOSPITAL_NETWORK_ALLOW_ALL_PRIVATE)"
  case "$network_override" in
    "") network_override_argument="" ;;
    confirmed) network_override_argument="--allow-all-rfc1918" ;;
    *)
      network_override_argument=""
      fail "$(pick 'HOSPITAL_NETWORK_ALLOW_ALL_PRIVATE must be empty or exactly confirmed' 'HOSPITAL_NETWORK_ALLOW_ALL_PRIVATE трябва да бъде празно или точно confirmed')"
      ;;
  esac
  for boundary_key in HOSPITAL_RESEARCH_ALLOWED_CIDRS HOSPITAL_STATUS_ALLOWED_CIDRS; do
    boundary_value="$(env_value "$boundary_key")"
    set +e
    boundary_canonical="$(python3 "$root/scripts/network-boundaries.py" --locale "$readiness_locale" $network_override_argument "$boundary_value")"
    boundary_result=$?
    set -e
    if [ "$boundary_result" -ne 0 ]; then
      fail "$(pick "$boundary_key is not a safe exact network boundary" "$boundary_key не задава безопасна и точна мрежова граница")"
    elif [ "$boundary_value" != "$boundary_canonical" ]; then
      fail "$(pick "$boundary_key is not canonical; set it to: $boundary_canonical" "$boundary_key не е в каноничен вид; задайте: $boundary_canonical")"
    else
      pass "$(pick "$boundary_key is an exact canonical boundary: $boundary_canonical" "$boundary_key е точна канонична граница: $boundary_canonical")"
    fi
  done

  # An operator-supplied certificate is checked here rather than discovered by
  # a clinician meeting a browser warning, or by the health gate failing after
  # an update has already restarted the appliance.
  tls_mode="$(env_value HOSPITAL_TLS_MODE)"
  compose_profiles="$(env_value COMPOSE_PROFILES)"
  if readiness_tls_profile_matches "$tls_mode" "$compose_profiles"; then
    pass "$(pick "TLS mode $tls_mode selects the matching Compose exposure" "TLS режимът $tls_mode избира съответното публикуване в Compose")"
  else
    fail "$(pick "TLS mode/profile mismatch: HOSPITAL_TLS_MODE=$tls_mode requires COMPOSE_PROFILES=tls-acme only for acme" "Несъответствие между TLS режима и профила: HOSPITAL_TLS_MODE=$tls_mode изисква COMPOSE_PROFILES=tls-acme само при acme")"
  fi
  if [ -n "$(env_value HOSPITAL_CADDY_GLOBAL_EXTRA)" ] || [ -n "$(env_value HOSPITAL_CADDY_SITE_EXTRA)" ]; then
    fail "$(pick 'legacy free-form Caddy TLS settings are forbidden; HOSPITAL_TLS_MODE is authoritative' 'Старите свободни Caddy TLS настройки са забранени; HOSPITAL_TLS_MODE е единственият избор')"
  fi
  case "$tls_mode" in
    acme)
      if [ -n "$(env_value ACME_EMAIL)" ]; then
        pass "$(pick 'ACME certificate-notice address is configured' 'Зададен е адрес за известия за ACME сертификата')"
      else
        fail "$(pick 'ACME mode requires ACME_EMAIL' 'ACME режимът изисква ACME_EMAIL')"
      fi
      ;;
    local)
      warn "$(pick 'local TLS is for a bench only; managed devices do not trust its private authority by default' 'Локалният TLS е само за тест; управляваните устройства не се доверяват автоматично на частния му CA')"
      ;;
    operator)
      tls_cert="$root/secrets/tls/fullchain.pem"
      tls_key="$root/secrets/tls/private.key"
      tls_ca="$(env_value HOSPITAL_TLS_VERIFY_CA)"
      case "$tls_ca" in /*) ;; "") ;; *) tls_ca="$root/$tls_ca" ;; esac
      if [ ! -r "$tls_cert" ] || [ ! -s "$tls_cert" ] || [ ! -r "$tls_key" ] || [ ! -s "$tls_key" ]; then
        fail "$(pick 'operator TLS certificate/key are missing, empty, or unreadable in secrets/tls' 'TLS сертификатът/ключът от болницата липсват, празни са или не могат да се прочетат в secrets/tls')"
      elif [ -z "$tls_ca" ] || [ ! -r "$tls_ca" ] || [ ! -s "$tls_ca" ]; then
        fail "$(pick 'operator TLS requires a readable non-empty HOSPITAL_TLS_VERIFY_CA' 'TLS от болницата изисква четим и непразен HOSPITAL_TLS_VERIFY_CA')"
      else
        key_mode="$(stat -c '%a' "$tls_key" 2>/dev/null || echo unknown)"
        case "$key_mode" in
          600|400) pass "$(pick "private key is not readable by other accounts ($key_mode)" "Частният ключ не е четим от други акаунти ($key_mode)")" ;;
          unknown) warn "$(pick 'could not read the private key mode on this filesystem' 'Режимът на частния ключ не може да бъде прочетен на тази файлова система')" ;;
          *) fail "$(pick "private key is mode $key_mode; it must be 600" "Частният ключ е с режим $key_mode; трябва да бъде 600")" ;;
        esac
        certificate_report="$(sh "$root/scripts/tls-certificate-check.sh" \
          "$tls_cert" "$tls_key" "$tls_ca" "$clinical_domain" "$research_domain" 2592000)" || {
          fail "$(pick 'certificate inspection could not run' 'Проверката на сертификата не може да се изпълни')"
          certificate_report=""
        }
        certificate_value() {
          printf '%s\n' "$certificate_report" \
            | awk -F '\t' -v field="$1" '$1 == field { print $2; exit }'
        }
        if [ "$(certificate_value LEAF_PRESENT)" != 1 ]; then
          fail "$(pick 'fullchain.pem does not contain a valid PEM leaf certificate' 'fullchain.pem не съдържа валиден PEM краен сертификат')"
        fi
        if [ "$(certificate_value KEY_MATCH)" = 1 ]; then
          pass "$(pick 'certificate matches its private key' 'Сертификатът съответства на частния си ключ')"
        else
          fail "$(pick 'certificate and private key do not match' 'Сертификатът и частният ключ не съвпадат')"
        fi
        for certificate_host_spec in \
          "CLINICAL_HOST:$clinical_domain" \
          "RESEARCH_HOST:$research_domain"
        do
          certificate_host_field="${certificate_host_spec%%:*}"
          certificate_host="${certificate_host_spec#*:}"
          if [ "$(certificate_value "$certificate_host_field")" = 1 ]; then
            pass "$(pick "certificate covers $certificate_host" "Сертификатът покрива $certificate_host")"
          else
            fail "$(pick "certificate does not cover $certificate_host" "Сертификатът не покрива $certificate_host")"
          fi
        done
        if [ "$(certificate_value SERVER_PURPOSE)" = 1 ]; then
          pass "$(pick 'certificate is suitable for TLS server use' 'Сертификатът е подходящ за TLS сървър')"
        else
          fail "$(pick 'certificate is not suitable for TLS server use (EKU/purpose)' 'Сертификатът не е подходящ за TLS сървър (EKU/purpose)')"
        fi
        for certificate_verify_spec in \
          "CLINICAL_VERIFY:$clinical_domain" \
          "RESEARCH_VERIFY:$research_domain"
        do
          certificate_verify_field="${certificate_verify_spec%%:*}"
          certificate_host="${certificate_verify_spec#*:}"
          if [ "$(certificate_value "$certificate_verify_field")" = 1 ]; then
            pass "$(pick "certificate chain, dates, CA and server identity verify for $certificate_host" "Веригата, срокът, CA и идентичността са валидни за $certificate_host")"
          else
            fail "$(pick "certificate verification failed for $certificate_host" "Проверката на сертификата е неуспешна за $certificate_host")"
          fi
        done
        certificate_end="$(certificate_value END_DATE)"
        if [ "$(certificate_value CHECKEND)" = 1 ]; then
          pass "$(pick "certificate expires $certificate_end" "Сертификатът изтича на $certificate_end")"
        else
          fail "$(pick "certificate expires in less than 30 days or is already expired: $certificate_end" "Сертификатът изтича след по-малко от 30 дни или вече е изтекъл: $certificate_end")"
        fi
      fi
      ;;
    *)
      fail "$(pick "HOSPITAL_TLS_MODE must be acme, local or operator; got '$tls_mode'" "HOSPITAL_TLS_MODE трябва да бъде acme, local или operator; получено е '$tls_mode'")"
      ;;
  esac

  for guidance_key in HOSPITAL_ADULT_GUIDANCE_DEFAULT HOSPITAL_PEDIATRIC_GUIDANCE_DEFAULT HOSPITAL_EXTERNAL_AI_DEFAULT; do
    guidance_value="$(env_value "$guidance_key")"
    [ -n "$guidance_value" ] || guidance_value=true
    case "$guidance_value" in
      true|false)
        pass "$(pick "$guidance_key is explicitly $guidance_value" "$guidance_key е изрично зададено на $guidance_value")"
        ;;
      *)
        fail "$(pick "$guidance_key must be true or false" "$guidance_key трябва да бъде true или false")"
        ;;
    esac
  done

  update_supply_mode="$(env_value HOSPITAL_UPDATE_SUPPLY_MODE)"
  [ -n "$update_supply_mode" ] || update_supply_mode=connected
  case "$update_supply_mode" in
    offline)
      pass "$(pick 'offline update supply is selected; releases come from verified USB media' 'избрано е офлайн предоставяне на обновявания; версиите идват от проверен USB носител')"
      ;;
    connected)
      pass "$(pick 'connected update supply uses the public GitHub release and ghcr.io images; no credentials are needed' 'свързаното обновяване използва публичните версии в GitHub и образите в ghcr.io; не са нужни данни за достъп')"
      ;;
    *)
      fail "$(pick 'HOSPITAL_UPDATE_SUPPLY_MODE must be connected or offline' 'HOSPITAL_UPDATE_SUPPLY_MODE трябва да бъде connected или offline')"
      ;;
  esac

# Which authority the appliance trusts when it dials *out*.
#
# Reported rather than assumed. A hospital signs its internal servers with its
# own authority, so an EHR connection that fails for want of recognising a
# certificate looks identical to a network fault -- and somebody spends an
# afternoon on firewall rules for a trust problem. Saying which file is in use,
# or that none is, points at the right thing straight away.
outbound_ca="$root/secrets/api/hospital-ca.pem"
if [ -s "$outbound_ca" ]; then
  pass "$(pick 'outbound connections trust the hospital certificate authority' 'Изходящите връзки се доверяват на удостоверяващия орган на болницата')"
elif [ -f "$outbound_ca" ]; then
  # Empty is correct for a site with no private authority: its EHR presents a
  # publicly trusted certificate and Node's built-in roots already cover it.
  # Said out loud anyway, because it is also what an unconfigured site looks
  # like, and the two are worth telling apart before an integration is blamed.
  pass "$(pick 'no private certificate authority needed for outbound connections' 'Не е необходим частен удостоверяващ орган за изходящи връзки')"
else
  warn "$(pick 'outbound certificate authority file is missing; run scripts/ensure-api-secrets-layout.sh' 'Липсва файлът с удостоверяващия орган за изходящи връзки; изпълнете scripts/ensure-api-secrets-layout.sh')"
fi

  interval="$(env_value HOSPITAL_BACKUP_INTERVAL_SECONDS)"
  retry="$(env_value HOSPITAL_BACKUP_RETRY_SECONDS)"
  keep_all="$(env_value HOSPITAL_BACKUP_KEEP_ALL_SECONDS)"
  daily_points="$(env_value HOSPITAL_BACKUP_DAILY_POINTS)"
  manifest_key="$(env_value HOSPITAL_BACKUP_MANIFEST_HMAC_KEY)"
  [ -n "$interval" ] || interval=14400
  [ -n "$retry" ] || retry=300
  [ -n "$keep_all" ] || keep_all=172800
  [ -n "$daily_points" ] || daily_points=14
  if readiness_backup_config "$interval" "$retry" "$keep_all" "$daily_points"; then
    pass "$(pick 'backup schedule meets the four-hour/48-hour/14-day policy' 'Графикът за архивиране покрива политиката за 4 часа/48 часа/14 дни')"
  else
    fail "$(pick 'backup interval must be at most four hours, retry positive, all copies kept 48 hours, and at least 14 daily points retained' 'Интервалът за архивиране трябва да е най-много 4 часа, повторният опит да е положителен, всички копия да се пазят 48 часа и да има поне 14 дневни точки')"
  fi
  if [ "$using_preinstall_environment" = true ]; then
    pass "$(pick 'backup manifest authentication and local escrow will be generated after readiness passes' 'Удостоверяването на архивите и локалното аварийно копие ще се създадат след успешната проверка')"
  elif [ "${#manifest_key}" -ge 32 ] && [ -s "$root/secrets/backup/manifest-hmac-key" ]; then
    pass "$(pick 'backup manifests have protected authentication material' 'Манифестите на архивите имат защитен материал за удостоверяване')"
  else
    fail "$(pick 'backup manifest authentication or its local recovery escrow is missing' 'Липсва удостоверяване на манифестите на архивите или локалното му аварийно копие')"
  fi

  if [ "$using_preinstall_environment" = true ]; then
    pass "$(pick 'the OMOP pseudonym salt will be generated and bound to authenticated backups after readiness passes' 'Солта за OMOP псевдоними ще бъде създадена и обвързана с удостоверените архиви след успешната проверка')"
  else
    omop_pseudonym_salt="$(env_value OMOP_PSEUDONYM_SALT)"
    expected_omop_salt_fp="$(env_value HOSPITAL_OMOP_PSEUDONYM_SALT_FINGERPRINT)"
    if printf '%s\n' "$omop_pseudonym_salt" | grep -Eq '^[0-9a-f]{64}$' \
        && [ "$expected_omop_salt_fp" = "sha256:$(printf '%s' "$omop_pseudonym_salt" | sha256sum | awk '{ print $1 }')" ]; then
      pass "$(pick 'the OMOP pseudonym salt matches this appliance backup identity' 'Солта за OMOP псевдоними съответства на идентичността за архивиране на тази система')"
    else
      fail "$(pick 'the OMOP pseudonym salt is missing, invalid, or does not match this appliance backup identity' 'Солта за OMOP псевдоними липсва, невалидна е или не съответства на идентичността за архивиране на тази система')"
    fi
  fi

  if [ "$using_preinstall_environment" = true ]; then
    pass "$(pick 'the administrator MFA encryption key will be generated and escrowed after readiness passes' 'Ключът за защита на администраторската MFA ще бъде създаден и архивиран след успешната проверка')"
  else
    expected_mfa_fp="$(env_value HOSPITAL_MFA_ENCRYPTION_KEY_FINGERPRINT)"
    actual_mfa_fp="$(mfa_encryption_key_fingerprint "$root/secrets/api/mfa-encryption-key" 2>/dev/null || true)"
    if [ -n "$actual_mfa_fp" ] && [ "$actual_mfa_fp" = "$expected_mfa_fp" ]; then
      pass "$(pick 'administrator TOTP seeds have a valid appliance encryption key' 'TOTP тайните на администраторите имат валиден ключ за защита на системата')"
    else
      fail "$(pick 'the administrator MFA encryption key is missing, invalid, or does not match this appliance' 'Ключът за защита на администраторската MFA липсва, невалиден е или не съответства на системата')"
    fi
  fi

  if [ "$using_preinstall_environment" = true ]; then
    pass "$(pick 'the external-AI credential seal key will be generated and escrowed after readiness passes' 'Ключът за защита на данните за външния AI ще бъде създаден и архивиран след успешната проверка')"
  else
    expected_external_ai_fp="$(env_value HOSPITAL_EXTERNAL_AI_SEAL_KEY_FINGERPRINT)"
    actual_external_ai_fp="$(external_ai_seal_key_fingerprint "$root/secrets/api/external-ai-seal-key" 2>/dev/null || true)"
    if [ -n "$actual_external_ai_fp" ] && [ "$actual_external_ai_fp" = "$expected_external_ai_fp" ]; then
      pass "$(pick 'external-AI provider credentials have a valid appliance seal key' 'Данните за достъп до външния AI имат валиден ключ за защита на системата')"
    else
      fail "$(pick 'the external-AI seal key is missing, invalid, or does not match this appliance' 'Ключът за защита на външния AI липсва, невалиден е или не съответства на системата')"
    fi
  fi

  # The EHR adapter seal key, against its recorded fingerprint where one exists.
  # A key that is merely present and well-formed is not enough: the transport
  # credentials in the database are sealed with a particular key, so a different
  # valid key is exactly as unusable as none, and silently so.
  expected_ehr_transport_fp="$(env_value HOSPITAL_EHR_TRANSPORT_SEAL_KEY_FINGERPRINT)"
  if [ "$using_preinstall_environment" = true ]; then
    pass "$(pick 'the EHR adapter seal key will be generated and escrowed after readiness passes' 'Ключът за защита на данните за ЕЗД ще бъде създаден и архивиран след успешната проверка')"
  elif [ -n "$expected_ehr_transport_fp" ] \
    && [ "$(ehr_transport_seal_key_fingerprint "$root/secrets/api/ehr-transport-seal-key" 2>/dev/null || true)" != "$expected_ehr_transport_fp" ]; then
    fail "$(pick 'the EHR adapter seal key does not match the one this appliance recorded; sealed transport credentials cannot be read' 'Ключът за защита на ЕЗД не съвпада със записания от тази система; запечатаните данни за транспорт не могат да бъдат прочетени')"
  elif ehr_transport_seal_key_fingerprint "$root/secrets/api/ehr-transport-seal-key" >/dev/null 2>&1; then
    pass "$(pick 'the EHR adapter has a valid appliance seal key' 'Адаптерът за ЕЗД има валиден ключ за защита на системата')"
  else
    fail "$(pick 'the EHR adapter seal key is missing or invalid; run scripts/ensure-api-secrets-layout.sh' 'Ключът за защита на ЕЗД липсва или е невалиден; изпълнете scripts/ensure-api-secrets-layout.sh')"
  fi

  if [ "$using_preinstall_environment" = true ]; then
    pass "$(pick 'the resolved Compose model will be validated after protected secrets are generated' 'Разрешеният Compose модел ще се провери след създаването на защитените тайни')"
  elif docker compose config --quiet >/dev/null 2>&1; then
    pass "$(pick 'Docker Compose configuration resolves' 'Конфигурацията на Docker Compose се разрешава успешно')"
  else
    fail "$(pick 'Docker Compose configuration is invalid' 'Конфигурацията на Docker Compose е невалидна')"
  fi
else
  fail "$(pick '.env is missing and no complete pre-install configuration was supplied' 'Липсва .env и не е подадена пълна предварителна конфигурация')"
fi

if [ -d "$root/backups" ] && [ -w "$root/backups" ]; then
  pass "$(pick 'local backup directory exists and is writable' 'Локалната папка за архиви съществува и е достъпна за запис')"
else
  fail "$(pick 'local backup directory is missing or not writable' 'Локалната папка за архиви липсва или не е достъпна за запис')"
fi
warn "$(pick 'Hospital IT must configure and monitor a separate encrypted off-host backup copy' 'Болничният ИТ екип трябва да настрои и наблюдава отделно шифровано копие извън сървъра')"
warn "$(pick 'Hospital policy must separately verify disk encryption, UPS, firewall, and external port reachability' 'Болничната политика трябва отделно да провери шифроването на диска, UPS, защитната стена и достъпа до външните портове')"

if command -v ss >/dev/null 2>&1; then
  # The configured ports, not the defaults, as host:container:service. The two
  # can differ now, and `docker compose port` takes the container port --
  # asking it about the host port would find no mapping and report the
  # appliance's own listener as a foreign one. See readiness_port_specs.
  for port_spec in $(readiness_port_specs \
    "$(env_value HOSPITAL_HTTPS_PORT)" \
    "$(env_value HOSPITAL_STATUS_PORT)" \
    "$(env_value HOSPITAL_TLS_MODE)"); do
    port="${port_spec%%:*}"
    rest="${port_spec#*:}"
    container_port="${rest%%:*}"
    owner_service="${rest#*:}"
    listeners="$(ss -H -ltn "sport = :$port" 2>/dev/null || true)"
    if [ -z "$listeners" ]; then
      pass "$(pick "TCP port $port is available" "TCP порт $port е свободен")"
    elif [ -f "$root/.env" ] \
      && [ -n "$(cd "$root" && docker compose port "$owner_service" "$container_port" 2>/dev/null || true)" ]; then
      pass "$(pick "TCP port $port is already owned by this appliance's $owner_service service" "TCP порт $port вече се използва от услугата $owner_service на тази система")"
    else
      fail "$(pick "TCP port $port is already in use" "TCP порт $port вече се използва")"
    fi
  done
fi

if [ "$readiness_locale" = bg ]; then
  printf 'Резултат от проверката: %s грешка(и), %s предупреждение(я).\n' "$failures" "$warnings"
else
  printf 'Readiness result: %s failure(s), %s warning(s).\n' "$failures" "$warnings"
fi
if [ "$strict" = true ] && [ "$failures" -ne 0 ]; then
  exit 1
fi
exit 0
