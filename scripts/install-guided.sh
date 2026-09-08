#!/bin/sh
set -eu

# The PeriOp Laboratories mark, plain ASCII. Printed once, unconditionally,
# before the language prompt below -- it is brand identity, not a message,
# so it does not need a bg/en translation and should not wait on choosing one.
cat <<'BANNER' >&2

######  ####### ######  #######  #####  ######
##   ## ##      ##   ##   ###   ##   ## ##   ##
##   ## ##      ##   ##   ###   ##   ## ##   ##
######  ######  ######    ###   ##   ## ######
##      ##      ## ##     ###   ##   ## ##
##      ##      ##  ##    ###   ##   ## ##
##      ##      ##   ##   ###   ##   ## ##
##      ####### ##   ## #######  #####  ##

            L A B O R A T O R I E S

BANNER

# A guided front end for the supported install. It collects what the install
# needs, shows what the checks found, and then runs the ordinary scripts.
#
# It is a front end and nothing more. run-online-release.sh still verifies the
# lock, still pulls every image by digest, still refuses a mismatch; install.sh
# still creates the secrets and the first administrator. Nothing here can
# approve anything on the operator's behalf, and every failure below ends the
# run rather than offering to continue -- an installer whose checks can be
# clicked past is worse than no installer, because it looks like assurance.
#
# whiptail ships with Ubuntu Server. Without it, or without a terminal, this
# falls back to the plain prompts rather than requiring anything to be
# installed on a clinical host.

root="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"
cd "$root"

usage() {
  echo "Употреба / Usage: sh scripts/install-guided.sh <release.lock> <release.lock.sha256> <artifact-directory>" >&2
  exit 2
}
lock="${1:-}"; sidecar="${2:-}"; media="${3:-}"
[ -n "$lock" ] && [ -n "$sidecar" ] && [ -n "$media" ] || usage

have_ui=0
if command -v whiptail >/dev/null 2>&1 && [ -t 0 ] && [ -t 2 ]; then have_ui=1; fi

configured_locale=""
if [ -f .env ]; then
  configured_locale="$(sed -n 's/^LOSPOR_DEFAULT_LOCALE=//p' .env | tail -n 1 | tr -d '\r"')"
fi
requested_locale="${LOSPOR_DEFAULT_LOCALE:-$configured_locale}"
if [ -n "$requested_locale" ]; then
  case "$requested_locale" in
    bg|en) LOSPOR_DEFAULT_LOCALE="$requested_locale" ;;
    *) echo "LOSPOR_DEFAULT_LOCALE трябва да бъде bg или en / must be bg or en." >&2; exit 1 ;;
  esac
elif [ "$have_ui" -eq 1 ]; then
  LOSPOR_DEFAULT_LOCALE="$(whiptail --title "Език / Language" \
    --radiolist "Изберете език за инсталацията и приложенията.\nChoose the installation and application default language." \
    14 78 2 \
    bg "Български (по подразбиране / default)" ON \
    en "English" OFF \
    3>&1 1>&2 2>&3)" || {
      echo "Инсталирането е отменено. / Installation cancelled." >&2
      exit 1
    }
else
  printf '\nЕзик за инсталацията и приложенията / Installation and application language\n' >&2
  printf '  1) Български [по подразбиране / default]\n  2) English\n' >&2
  printf 'Избор / Choice [1]: ' >&2
  read -r language_choice || language_choice=""
  case "$language_choice" in
    ""|1|bg|BG|бг|БГ) LOSPOR_DEFAULT_LOCALE=bg ;;
    2|en|EN) LOSPOR_DEFAULT_LOCALE=en ;;
    *) echo "Невалиден избор. Въведете 1/bg или 2/en. / Invalid choice. Enter 1/bg or 2/en." >&2; exit 1 ;;
  esac
fi
export LOSPOR_DEFAULT_LOCALE

msg() {
  key="$1"
  case "$LOSPOR_DEFAULT_LOCALE:$key" in
    bg:title) printf '%s' "Инсталиране на LOSPOR Hospital" ;;
    bg:stopped) printf '%s' "прекратено" ;;
    bg:cancelled) printf '%s' "Инсталирането е отменено." ;;
    bg:password_empty) printf '%s' "Паролата на администратора не може да бъде празна." ;;
    bg:password_mismatch) printf '%s' "Паролите на администратора не съвпадат. Нищо не е променено." ;;
    bg:expected_digest) printf '%s' "Очакван SHA-256 на release.lock (от отделния ви запис)" ;;
    bg:invalid_digest) printf '%s' "Това не е SHA-256. Очакват се 64 шестнадесетични знака." ;;
    bg:fingerprint) printf '%s' "Отпечатък на ключа за подписване (от известието за инсталация; оставете празно, за да пропуснете)" ;;
    bg:acme_email) printf '%s' "Адрес за известия за сертификата" ;;
    bg:clinical_domain) printf '%s' "Клиничен адрес (уеб, мобилно приложение, API)" ;;
    bg:research_domain) printf '%s' "Адрес на Research Browser" ;;
    bg:supply_mode) printf '%s' "Откъде да бъдат взети образите на изданието?" ;;
    bg:supply_offline_missing) printf '%s' "Избрано е инсталиране без мрежа, но носителят не съдържа всички offline части, изброени в lock." ;;
    bg:supply_registry_missing) printf '%s' "Избрано е инсталиране с мрежа, но липсват данни за GHCR. Добавете ги с provision-update-credentials.sh и стартирайте отново." ;;
    bg:tls_mode) printf '%s' "Как болницата ще осигури HTTPS сертификат?" ;;
    bg:tls_ca) printf '%s' "Път до доверения CA сертификат на болницата" ;;
    bg:research_cidrs) printf '%s' "Точни Research/VPN мрежи (CIDR, разделени с интервал)" ;;
    bg:status_cidrs) printf '%s' "Точни мрежи за ИТ управление (CIDR, разделени с интервал)" ;;
    bg:email_from) printf '%s' "Адрес на подателя за служебните писма" ;;
    bg:support_url) printf '%s' "Вътрешен HTTPS адрес или mailto: имейл за поддръжка (по избор; празно = местният администратор)" ;;
    bg:offhost_hook) printf '%s' "Изпълним файл за шифровано външно архивиране (по избор; празно = настройване по-късно)" ;;
    bg:adult_guidance) printf '%s' "Включване на вграденото предварително изчислено насочване за по-бързо въвеждане при възрастни?" ;;
    bg:pediatric_guidance) printf '%s' "Включване на вграденото предварително изчислено насочване за по-бързо въвеждане при деца?" ;;
    bg:external_ai) printf '%s' "Включване на външен ИИ за предоперативен съветник и разпознаване на изображения?" ;;
    bg:external_ai_key) printf '%s' "Mistral API ключ (по избор; оставете празно и го добавете по-късно от Status)" ;;
    bg:hospital_name) printf '%s' "Име на болницата" ;;
    bg:city) printf '%s' "Град" ;;
    bg:country) printf '%s' "Държава" ;;
    bg:admin_email) printf '%s' "Имейл за вход на системния администратор в Status" ;;
    bg:admin_username) printf '%s' "Потребителско име за вход на първия клиничен администратор (3–64 знака; започва с латинска буква; след това латински букви, цифри, . _ или -; без интервали, @ и наклонени черти)" ;;
    bg:admin_contact_email) printf '%s' "Имейл за контакт на първия клиничен администратор (по желание; не се използва за вход)" ;;
    bg:admin_first) printf '%s' "Собствено име на администратора" ;;
    bg:admin_last) printf '%s' "Фамилия на администратора" ;;
    bg:admin_password) printf '%s' "Парола на администратора" ;;
    bg:admin_password_confirm) printf '%s' "Потвърдете паролата на администратора" ;;
    bg:readiness) printf '%s' "готовност на сървъра" ;;
    bg:python_required) printf '%s' "Необходим е Python 3 за безопасна проверка на мрежовите CIDR граници." ;;
    en:title) printf '%s' "LOSPOR Hospital installation" ;;
    en:stopped) printf '%s' "stopped" ;;
    en:cancelled) printf '%s' "Installation cancelled." ;;
    en:password_empty) printf '%s' "The administrator password cannot be empty." ;;
    en:password_mismatch) printf '%s' "The administrator passwords did not match. Nothing was changed." ;;
    en:expected_digest) printf '%s' "Expected release.lock SHA-256 (from your separate record)" ;;
    en:invalid_digest) printf '%s' "That is not a SHA-256 digest. Expected 64 hexadecimal characters." ;;
    en:fingerprint) printf '%s' "Release signing key fingerprint (from your install notice; leave empty to skip)" ;;
    en:acme_email) printf '%s' "Address for certificate notices" ;;
    en:clinical_domain) printf '%s' "Clinical name (web, phone app, API)" ;;
    en:research_domain) printf '%s' "Research Browser name" ;;
    en:supply_mode) printf '%s' "Where should the release images come from?" ;;
    en:supply_offline_missing) printf '%s' "Installing without a network was chosen, but the media does not contain every offline part the lock lists." ;;
    en:supply_registry_missing) printf '%s' "Installing over the network was chosen, but the GHCR credentials are missing. Add them with provision-update-credentials.sh and run this again." ;;
    en:tls_mode) printf '%s' "How will the hospital provide the HTTPS certificate?" ;;
    en:tls_ca) printf '%s' "Path to the hospital's trusted CA certificate" ;;
    en:research_cidrs) printf '%s' "Exact Research/VPN networks (space-separated CIDRs)" ;;
    en:status_cidrs) printf '%s' "Exact IT management networks (space-separated CIDRs)" ;;
    en:email_from) printf '%s' "Sender address for account email" ;;
    en:support_url) printf '%s' "Internal HTTPS support URL or mailto: email (optional; blank = local administrator)" ;;
    en:offhost_hook) printf '%s' "Executable for encrypted off-host backup (optional; blank = configure later)" ;;
    en:adult_guidance) printf '%s' "Enable bundled pre-calculated guidance for faster adult data entry?" ;;
    en:pediatric_guidance) printf '%s' "Enable bundled pre-calculated guidance for faster pediatric data entry?" ;;
    en:external_ai) printf '%s' "Enable external AI for the pre-operative advisor and image recognition?" ;;
    en:external_ai_key) printf '%s' "Mistral API key (optional; leave blank and add it later in Status)" ;;
    en:hospital_name) printf '%s' "Hospital name" ;;
    en:city) printf '%s' "City" ;;
    en:country) printf '%s' "Country" ;;
    en:admin_email) printf '%s' "Status appliance administrator sign-in email" ;;
    en:admin_username) printf '%s' "First clinical administrator login username (3–64 characters; start with a Latin letter; then Latin letters, numbers, . _ or -; no spaces, @, or slashes)" ;;
    en:admin_contact_email) printf '%s' "First clinical administrator contact email (optional; never used to sign in)" ;;
    en:admin_first) printf '%s' "Administrator's first name" ;;
    en:admin_last) printf '%s' "Administrator's last name" ;;
    en:admin_password) printf '%s' "Administrator password" ;;
    en:admin_password_confirm) printf '%s' "Confirm administrator password" ;;
    en:readiness) printf '%s' "host readiness" ;;
    en:python_required) printf '%s' "Python 3 is required to validate network CIDR boundaries safely." ;;
    *) echo "Missing installer translation: $key ($LOSPOR_DEFAULT_LOCALE)" >&2; exit 1 ;;
  esac
}

TITLE="$(msg title)"

command -v python3 >/dev/null 2>&1 || {
  printf '%s\n' "$(msg python_required)" >&2
  exit 1
}

say() {
  if [ "$have_ui" -eq 1 ]; then
    whiptail --title "$TITLE" --msgbox "$1" 16 74
  else
    printf '\n%s\n\n' "$1"
  fi
}

die() {
  if [ "$have_ui" -eq 1 ]; then
    whiptail --title "$TITLE — $(msg stopped)" --msgbox "$1" 16 74
  fi
  printf '%s\n' "$1" >&2
  exit 1
}

ask_value() {
  # variable label default
  eval "current=\${$1:-}"
  if [ -n "${current:-}" ]; then return 0; fi
  if [ "$have_ui" -eq 1 ]; then
    value="$(whiptail --title "$TITLE" --inputbox "$2" 10 74 "$3" 3>&1 1>&2 2>&3)" \
      || die "$(msg cancelled)"
  else
    printf "%s [%s]: " "$2" "$3" >&2
    read -r value || value=""
  fi
  eval "$1=\"\${value:-$3}\""
  eval "export $1"
}

ask_optional_value() {
  # Unlike ask_value, an explicitly supplied empty environment value is a
  # complete answer. This lets unattended installs choose the safe deferred
  # off-host hook without consuming a later password from standard input.
  eval "is_set=\${$1+x}"
  [ "${is_set:-}" = x ] && return 0
  if [ "$have_ui" -eq 1 ]; then
    value="$(whiptail --title "$TITLE" --inputbox "$2" 10 74 "" 3>&1 1>&2 2>&3)" \
      || die "$(msg cancelled)"
  else
    printf "%s: " "$2" >&2
    read -r value || value=""
  fi
  export "$1=$value"
}

ask_yes_no() {
  eval "current=\${$1:-}"
  if [ -n "${current:-}" ]; then
    case "$current" in true|false) return 0 ;; *) die "$2: true/false" ;; esac
  fi
  if [ "$have_ui" -eq 1 ]; then
    if whiptail --title "$TITLE" --yesno "$2" 10 74; then
      answer=true
    else
      choice_result=$?
      [ "$choice_result" -eq 1 ] || die "$(msg cancelled)"
      answer=false
    fi
  else
    if [ "$LOSPOR_DEFAULT_LOCALE" = bg ]; then
      printf "%s [Д/н]: " "$2" >&2
    else
      printf "%s [Y/n]: " "$2" >&2
    fi
    read -r raw_answer || raw_answer=""
    case "$raw_answer" in
      ""|y|Y|yes|YES|true|1|д|Д|да|Да|ДА) answer=true ;;
      n|N|no|NO|false|0|н|Н|не|Не|НЕ) answer=false ;;
      *) die "$2: yes/no" ;;
    esac
  fi
  export "$1=$answer"
}

ask_secret() {
  # Two entries, compared. Never echoed, never exported, never written to .env:
  # install.sh takes it on standard input alone.
  if [ "$have_ui" -eq 1 ]; then
    first="$(whiptail --title "$TITLE" --passwordbox "$1" 10 74 3>&1 1>&2 2>&3)" \
      || die "$(msg cancelled)"
    second="$(whiptail --title "$TITLE" --passwordbox "$2" 10 74 3>&1 1>&2 2>&3)" \
      || die "$(msg cancelled)"
  else
    printf "%s: " "$1" >&2; stty -echo 2>/dev/null || true; read -r first;  stty echo 2>/dev/null || true; printf '\n' >&2
    printf "%s: " "$2" >&2; stty -echo 2>/dev/null || true; read -r second; stty echo 2>/dev/null || true; printf '\n' >&2
  fi
  [ -n "$first" ] || die "$(msg password_empty)"
  [ "$first" = "$second" ] || die "$(msg password_mismatch)"
}

ask_optional_secret() {
  # One write-only value. Empty is valid because Status can configure or
  # replace it later. It is never exported or written to .env.
  if [ "$have_ui" -eq 1 ]; then
    optional_secret="$(whiptail --title "$TITLE" --passwordbox "$1" 10 74 3>&1 1>&2 2>&3)" \
      || die "$(msg cancelled)"
  else
    printf "%s: " "$1" >&2
    stty -echo 2>/dev/null || true
    read -r optional_secret || optional_secret=""
    stty echo 2>/dev/null || true
    printf '\n' >&2
  fi
}

# Is every offline image part the lock names actually on the media? The lock's
# artifact filenames are validated as [A-Za-z0-9][A-Za-z0-9._-]* before this
# runs, so they never contain whitespace and word splitting here is safe.
offline_media_complete() {
  offline_parts="$(awk -F'\t' '$1 == "artifact" && $2 == "offline-part" { print $4 }' "$lock")"
  [ -n "$offline_parts" ] || return 1
  for offline_part in $offline_parts; do
    [ -f "$media/$offline_part" ] || return 1
  done
  return 0
}

# Which launcher finishes the install. Both verify the same lock digest and the
# same signature -- those checks happen above, before either is chosen, and are
# not what distinguishes them. This only decides whether the images are pulled
# from GHCR or loaded from the media already in the room.
ask_supply_mode() {
  if [ -n "${HOSPITAL_INSTALL_SUPPLY_MODE:-}" ]; then
    case "$HOSPITAL_INSTALL_SUPPLY_MODE" in
      connected|offline) ;;
      *) die "$(msg supply_mode): connected or offline" ;;
    esac
  else
    # Suggest what the media supports, but never choose silently.
    if offline_media_complete; then supply_default=offline; else supply_default=connected; fi
    if [ "$have_ui" -eq 1 ]; then
      if [ "$supply_default" = offline ]; then connected_on=OFF; offline_on=ON
      else connected_on=ON; offline_on=OFF; fi
      if [ "$LOSPOR_DEFAULT_LOCALE" = bg ]; then
        HOSPITAL_INSTALL_SUPPLY_MODE="$(whiptail --title "$TITLE" --radiolist \
          "$(msg supply_mode)" 16 78 2 \
          connected "Изтегляне от GHCR; изисква мрежа и данни за достъп" "$connected_on" \
          offline "Зареждане от носителя; не изисква мрежа" "$offline_on" \
          3>&1 1>&2 2>&3)" || die "$(msg cancelled)"
      else
        HOSPITAL_INSTALL_SUPPLY_MODE="$(whiptail --title "$TITLE" --radiolist \
          "$(msg supply_mode)" 16 78 2 \
          connected "Download from GHCR; needs a network and credentials" "$connected_on" \
          offline "Load from the media; needs no network" "$offline_on" \
          3>&1 1>&2 2>&3)" || die "$(msg cancelled)"
      fi
    else
      if [ "$LOSPOR_DEFAULT_LOCALE" = bg ]; then
        printf '\n%s\n  1) connected — изтегляне от GHCR; изисква мрежа и данни за достъп\n  2) offline — зареждане от носителя; не изисква мрежа\nИзбор [%s]: ' "$(msg supply_mode)" "$supply_default" >&2
      else
        printf '\n%s\n  1) connected — download from GHCR; needs a network and credentials\n  2) offline — load from the media; needs no network\nChoice [%s]: ' "$(msg supply_mode)" "$supply_default" >&2
      fi
      read -r supply_choice || supply_choice=""
      case "$supply_choice" in
        "") HOSPITAL_INSTALL_SUPPLY_MODE="$supply_default" ;;
        1|connected) HOSPITAL_INSTALL_SUPPLY_MODE=connected ;;
        2|offline) HOSPITAL_INSTALL_SUPPLY_MODE=offline ;;
        *) die "$(msg supply_mode): connected or offline" ;;
      esac
    fi
  fi

  # Fail closed on the chosen path rather than quietly falling back to the
  # other one. Falling back would install from a source the operator did not
  # agree to, which is exactly the decision this prompt exists to record.
  if [ "$HOSPITAL_INSTALL_SUPPLY_MODE" = offline ]; then
    offline_media_complete || die "$(msg supply_offline_missing)"
  else
    # Checked here rather than several minutes later inside the launcher, so a
    # missing credential does not surface only after the administrator password
    # has already been typed twice. Resolve the appliance home the same way
    # release_state_appliance_home does, or this would look in the wrong place
    # on a staged candidate and refuse an install that was fine.
    supply_home="$root"
    if [ -d "$root/.lospor-home" ]; then
      supply_home="$(CDPATH= cd -- "$root/.lospor-home" 2>/dev/null && pwd -P)" || supply_home="$root"
    fi
    { [ -s "$supply_home/secrets/registry/ghcr-user" ] \
      && [ -s "$supply_home/secrets/registry/ghcr-token" ]; } \
      || die "$(msg supply_registry_missing)"
  fi
}

ask_tls_mode() {
  if [ -n "${HOSPITAL_TLS_MODE:-}" ]; then
    case "$HOSPITAL_TLS_MODE" in acme|local|operator) return 0 ;; esac
    die "$(msg tls_mode): operator, acme or local"
  fi
  if [ "$have_ui" -eq 1 ]; then
    if [ "$LOSPOR_DEFAULT_LOCALE" = bg ]; then
      HOSPITAL_TLS_MODE="$(whiptail --title "$TITLE" --radiolist \
        "$(msg tls_mode)" 16 78 3 \
        operator "Сертификат от болничния ИТ екип (препоръчително)" ON \
        acme "Публичен сертификат; изисква входящ порт 80" OFF \
        local "Самоподписан сертификат само за тест" OFF \
        3>&1 1>&2 2>&3)" || die "$(msg cancelled)"
    else
      HOSPITAL_TLS_MODE="$(whiptail --title "$TITLE" --radiolist \
        "$(msg tls_mode)" 16 78 3 \
        operator "Certificate from hospital IT (recommended)" ON \
        acme "Public certificate; requires inbound port 80" OFF \
        local "Self-signed certificate for testing only" OFF \
        3>&1 1>&2 2>&3)" || die "$(msg cancelled)"
    fi
  else
    if [ "$LOSPOR_DEFAULT_LOCALE" = bg ]; then
      printf '\n%s\n  1) operator — сертификат от болничния ИТ екип [по подразбиране]\n  2) acme — публичен сертификат и входящ порт 80\n  3) local — самоподписан сертификат само за тест\nИзбор [1]: ' "$(msg tls_mode)" >&2
    else
      printf '\n%s\n  1) operator — certificate from hospital IT [default]\n  2) acme — public certificate and inbound port 80\n  3) local — self-signed certificate for testing only\nChoice [1]: ' "$(msg tls_mode)" >&2
    fi
    read -r tls_choice || tls_choice=""
    case "$tls_choice" in
      ""|1|operator) HOSPITAL_TLS_MODE=operator ;;
      2|acme) HOSPITAL_TLS_MODE=acme ;;
      3|local) HOSPITAL_TLS_MODE=local ;;
      *) die "$(msg tls_mode): operator, acme or local" ;;
    esac
  fi
  export HOSPITAL_TLS_MODE
}

# ── 1. Welcome ───────────────────────────────────────────────────────────────
if [ "$LOSPOR_DEFAULT_LOCALE" = bg ]; then
  say "Това инсталира LOSPOR Hospital от проверено издание.

Преди да продължите, са необходими:
  * файловете на изданието на този сървър
  * SHA-256 на release.lock, получен отделно
  * само ако ще изтегляте образите от GHCR вместо да ги заредите от носителя:
    root данни само за четене до GitHub Releases и GHCR, добавени с
    provision-update-credentials.sh (ще бъдете попитани по-долу)

Нищо няма да бъде записано, преди всички проверки по-долу да завършат успешно."
else
  say "This installs the LOSPOR Hospital appliance from a verified release.

Before continuing you need:
  * the release files on this host
  * the release.lock SHA-256, sent to you separately
  * only if you will download images from GHCR rather than loading them from
    the media: root-owned read credentials for GitHub Releases and GHCR, added
    with provision-update-credentials.sh (you are asked which below)

Nothing is written until every check below has passed."
fi

# ── 2. The lock hash, compared against a separately carried value ────────────
# This is the root of trust. It is asked for rather than displayed, so the
# operator has to bring a value from somewhere other than the media -- a hash
# read off the same USB it is checking proves nothing.
expected=""
ask_value expected "$(msg expected_digest)" ""
printf '%s\n' "$expected" | grep -Eq '^[a-f0-9]{64}$' \
  || die "$(msg invalid_digest)"
actual="$(sha256sum "$lock" | awk '{print $1}')"
if [ "$actual" != "$expected" ]; then
  if [ "$LOSPOR_DEFAULT_LOCALE" = bg ]; then
    die "RELEASE LOCK НЕ СЪВПАДА.

  очакван  $expected
  намерен  $actual

Не инсталирайте това издание. Получете файловете отново от доверено копие и
потвърдете отпечатъка с издателя."
  else
    die "RELEASE LOCK DOES NOT MATCH.

  expected  $expected
  found     $actual

Do not install this release. Obtain the assets again from a trusted copy and
check the digest with whoever published it."
  fi
fi
if [ "$LOSPOR_DEFAULT_LOCALE" = bg ]; then
  say "Release lock е проверен.

  $actual

Всеки останал файл сега се проверява спрямо този lock."
else
  say "Release lock verified.

  $actual

Every other file is now checked against this lock."
fi

# ── 2b. The signing key, pinned once so the digest above is the last one ─────
#
# Asked here, immediately after the digest, because it is the same act of trust
# and the operator has their install notice open. Confirming this fingerprint
# once is what stops them being sent a fresh digest before every future update.
#
# The key travels with the release, which is why it is confirmed rather than
# accepted: a release able to install its own key could authenticate every
# release after it. Declining is a supported answer -- the site simply keeps
# using a per-release digest.
release_signing_key="infra/release-signing/release-signing-public.pem"
if [ -s "$release_signing_key" ]; then
  offered="SHA256:$(openssl pkey -pubin -in "$release_signing_key" -outform DER 2>/dev/null \
    | openssl dgst -sha256 -binary | openssl base64 | tr -d '\r\n=')"
  pinned_key="$(CDPATH= cd -- "$root" && pwd -P)/secrets/release-signing-public.pem"
  if [ -s "$pinned_key" ]; then
    # Already pinned. Compared, never re-asked: a prompt here would invite an
    # operator to approve a key change, which is the one thing they must not be
    # able to do from a screen the release itself produced.
    if ! sh scripts/pin-release-signing-key.sh "$release_signing_key"; then
      if [ "$LOSPOR_DEFAULT_LOCALE" = bg ]; then
        die "Това издание предлага ключ за подписване, различен от доверения от
тази система. Не го инсталирайте. Свържете се с издателя."
      else
        die "This release offers a different signing key than the one this
appliance trusts. Do not install it. Contact whoever published it."
      fi
    fi
  else
    # Asked through ask_value, so it can equally be supplied in the environment
    # like every other value here. A prompt that can only be answered by typing
    # is what made an unattended install feed answers positionally into standard
    # input, and get them out of step the moment the list changed.
    ask_value HOSPITAL_RELEASE_SIGNING_FINGERPRINT "$(msg fingerprint)" ""
    if [ -n "${HOSPITAL_RELEASE_SIGNING_FINGERPRINT:-}" ]; then
      if ! sh scripts/pin-release-signing-key.sh "$release_signing_key"; then
        if [ "$LOSPOR_DEFAULT_LOCALE" = bg ]; then
          die "КЛЮЧЪТ ЗА ПОДПИСВАНЕ НЕ СЪВПАДА С ВЪВЕДЕНИЯ ОТПЕЧАТЪК.

  въведен от вас  $HOSPITAL_RELEASE_SIGNING_FINGERPRINT
  в това издание  $offered

Спрете. Получете файловете отново от доверено копие и потвърдете с издателя."
        else
          die "THE SIGNING KEY DOES NOT MATCH THE FINGERPRINT YOU ENTERED.

  you entered  $HOSPITAL_RELEASE_SIGNING_FINGERPRINT
  this release $offered

Stop. Obtain the assets again from a trusted copy and check with whoever
published them."
        fi
      fi
      if [ "$LOSPOR_DEFAULT_LOCALE" = bg ]; then
        say "Ключът за подписване е запазен като доверен.

  $offered

Бъдещите издания ще се проверяват автоматично с този ключ. Няма да е необходим
отделен SHA-256 за всяка актуализация."
      else
        say "Signing key pinned.

  $offered

Future releases verify against this key on their own. You will not be sent a
SHA-256 for each update."
      fi
    else
      if [ "$LOSPOR_DEFAULT_LOCALE" = bg ]; then
        say "Не е запазен доверен ключ за подписване.

Системата ще продължи да проверява всяко издание спрямо отделно предоставен
SHA-256. Ключът може да бъде запазен по-късно."
      else
        say "No signing key pinned.

This appliance will keep verifying each release against a SHA-256 you are given
with it, which is how it has always worked. You can pin the key later."
      fi
    fi
  fi
fi

# ── 2c. Where the images come from ───────────────────────────────────────────
# Asked before any site configuration so that a hospital with no network is
# turned away here, in the guided flow and in its own language, rather than
# several screens later inside a launcher that assumed a registry.
ask_supply_mode

# ── 3. Site configuration ────────────────────────────────────────────────────
# Every value generate-secrets.sh asks for is collected here, because it is
# generate-secrets.sh that writes .env and it will not read from a pipe. A
# value missing from this list stops the install with that variable's name
# rather than being filled from whatever is next on standard input -- which,
# since install.sh reads the administrator's password from that same stream, was
# the password.
if [ ! -f .env ]; then
  ask_value ACME_EMAIL "$(msg acme_email)" "it@example-hospital.org"
  ask_value HOSPITAL_CLINICAL_DOMAIN "$(msg clinical_domain)" "lospor.example-hospital.org"
  ask_value HOSPITAL_RESEARCH_DOMAIN "$(msg research_domain)" "lospor-research.example-hospital.org"
  ask_tls_mode
  if [ "$HOSPITAL_TLS_MODE" = operator ]; then
    ask_value HOSPITAL_TLS_VERIFY_CA "$(msg tls_ca)" "/etc/ssl/certs/hospital-ca.crt"
  fi
  ask_value HOSPITAL_RESEARCH_ALLOWED_CIDRS "$(msg research_cidrs)" ""
  ask_value HOSPITAL_STATUS_ALLOWED_CIDRS "$(msg status_cidrs)" ""
  HOSPITAL_RESEARCH_ALLOWED_CIDRS="$(python3 scripts/network-boundaries.py --locale "$LOSPOR_DEFAULT_LOCALE" "$HOSPITAL_RESEARCH_ALLOWED_CIDRS")" \
    || die "$(msg research_cidrs)"
  HOSPITAL_STATUS_ALLOWED_CIDRS="$(python3 scripts/network-boundaries.py --locale "$LOSPOR_DEFAULT_LOCALE" "$HOSPITAL_STATUS_ALLOWED_CIDRS")" \
    || die "$(msg status_cidrs)"
  export HOSPITAL_RESEARCH_ALLOWED_CIDRS HOSPITAL_STATUS_ALLOWED_CIDRS HOSPITAL_TLS_VERIFY_CA
  ask_value AUTH_EMAIL_FROM "$(msg email_from)" "no-reply@${HOSPITAL_CLINICAL_DOMAIN}"
  ask_optional_value HOSPITAL_SUPPORT_URL "$(msg support_url)"
  HOSPITAL_SUPPORT_URL="$(python3 scripts/support-url.py --locale "$LOSPOR_DEFAULT_LOCALE" "$HOSPITAL_SUPPORT_URL")" \
    || die "$(msg support_url)"
  export HOSPITAL_SUPPORT_URL
  ask_yes_no HOSPITAL_ADULT_GUIDANCE_DEFAULT "$(msg adult_guidance)"
  ask_yes_no HOSPITAL_PEDIATRIC_GUIDANCE_DEFAULT "$(msg pediatric_guidance)"
  ask_yes_no HOSPITAL_EXTERNAL_AI_DEFAULT "$(msg external_ai)"
  external_ai_provider_key=""
  if [ "$HOSPITAL_EXTERNAL_AI_DEFAULT" = true ]; then
    ask_optional_secret "$(msg external_ai_key)"
    external_ai_provider_key="$optional_secret"
    unset optional_secret
  fi
  ask_optional_value HOSPITAL_BACKUP_OFFHOST_HOOK_SOURCE "$(msg offhost_hook)"
fi

ask_value HOSPITAL_INSTITUTION_NAME "$(msg hospital_name)" ""
ask_value HOSPITAL_INSTITUTION_CITY "$(msg city)" ""
if [ "$LOSPOR_DEFAULT_LOCALE" = bg ]; then default_country="България"; else default_country="Bulgaria"; fi
ask_value HOSPITAL_INSTITUTION_COUNTRY "$(msg country)" "$default_country"
ask_value HOSPITAL_BOOTSTRAP_ADMIN_EMAIL "$(msg admin_email)" ""
ask_value HOSPITAL_BOOTSTRAP_ADMIN_USERNAME "$(msg admin_username)" ""
if [ "${#HOSPITAL_BOOTSTRAP_ADMIN_USERNAME}" -lt 3 ] || [ "${#HOSPITAL_BOOTSTRAP_ADMIN_USERNAME}" -gt 64 ] || ! printf '%s\n' "$HOSPITAL_BOOTSTRAP_ADMIN_USERNAME" | LC_ALL=C grep -Eq '^[A-Za-z][A-Za-z0-9._-]*$'; then
  die "$(msg admin_username)"
fi
ask_optional_value HOSPITAL_BOOTSTRAP_ADMIN_CONTACT_EMAIL "$(msg admin_contact_email)"
ask_value HOSPITAL_BOOTSTRAP_ADMIN_FIRST_NAME "$(msg admin_first)" ""
ask_value HOSPITAL_BOOTSTRAP_ADMIN_LAST_NAME "$(msg admin_last)" ""
ask_secret "$(msg admin_password)" "$(msg admin_password_confirm)"

# ── 4. Readiness, reported in full ───────────────────────────────────────────
# The report is shown whether it passes or fails. A host that scrapes through
# with warnings is worth seeing before ten containers start, not afterwards.
report="$(mktemp)"
trap 'rm -f "$report"' EXIT HUP INT TERM
set +e
sh scripts/readiness-check.sh --preinstall --strict >"$report" 2>&1
readiness=$?
set -e
if [ "$have_ui" -eq 1 ]; then
  whiptail --title "$TITLE — $(msg readiness)" --scrolltext --textbox "$report" 24 78
else
  cat "$report"
fi
if [ "$readiness" -ne 0 ]; then
  if [ "$LOSPOR_DEFAULT_LOCALE" = bg ]; then
    die "Сървърът не е готов. Отстранете показаните проблеми и стартирайте инсталатора отново.

Нищо не е инсталирано."
  else
    die "This host is not ready. Correct the failures above and run the installer again.

Nothing has been installed."
  fi
fi

# ── 5. Install ───────────────────────────────────────────────────────────────
if [ "$HOSPITAL_INSTALL_SUPPLY_MODE" = offline ]; then
  if [ "$LOSPOR_DEFAULT_LOCALE" = bg ]; then
    say "Инсталиране. Образите се зареждат от носителя и се проверяват спрямо
lock, след което се създава системата. Това отнема няколко минути. Изходът се
показва в реално време."
  else
    say "Installing. The images are loaded from the media and checked against the
lock, then the appliance is created. This takes several minutes and the output
is shown as it happens."
  fi
else
  if [ "$LOSPOR_DEFAULT_LOCALE" = bg ]; then
    say "Инсталиране. Образите се изтеглят и проверяват спрямо lock, след което
се създава системата. Това отнема няколко минути. Изходът се показва в реално
време."
  else
    say "Installing. The images are downloaded and checked against the lock, then
the appliance is created. This takes several minutes and the output is shown
as it happens."
  fi
fi

# Both launchers verify the lock and the signature themselves and both end by
# handing the same stdin to activate-verified-release.sh, so the only difference
# here is where the images come from.
if [ "$HOSPITAL_INSTALL_SUPPLY_MODE" = offline ]; then
  printf '%s\n%s\n%s\n' "$first" "$first" "${external_ai_provider_key:-}" \
    | sh scripts/load-offline.sh "$lock" "$sidecar" "$media"
else
  printf '%s\n%s\n%s\n' "$first" "$first" "${external_ai_provider_key:-}" \
    | sh scripts/run-online-release.sh "$lock" "$sidecar" "$media"
fi
unset external_ai_provider_key

clinical="$(sed -n 's/^HOSPITAL_CLINICAL_DOMAIN=//p' .env | tail -n 1 | tr -d '\r' | sed 's/^"//; s/"$//')"
status_port="$(sed -n 's/^HOSPITAL_STATUS_PORT=//p' .env | tail -n 1 | tr -d '\r' | sed 's/^"//; s/"$//')"
status_port="${status_port:-3443}"
if [ "$LOSPOR_DEFAULT_LOCALE" = bg ]; then
  say "Инсталирането завърши.

  Клиницисти          https://${clinical}/
  Мобилно приложение https://${clinical}/app
  Състояние           https://${clinical}/status/

  Резервен достъп при прекъсване чрез SSH тунел:
    ssh -L ${status_port}:127.0.0.1:${status_port} <admin>@this-host
    https://localhost:${status_port}/status/

Импортирайте лицензирания пакет с референтни номенклатури преди клинична употреба."
else
  say "Installation complete.

  Clinicians      https://${clinical}/
  Phone app       https://${clinical}/app
  Appliance status https://${clinical}/status/

  Outage fallback, through an SSH tunnel:
    ssh -L ${status_port}:127.0.0.1:${status_port} <admin>@this-host
    https://localhost:${status_port}/status/

Import the licensed reference vocabulary package before clinical use."
fi
