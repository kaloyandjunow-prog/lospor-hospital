#!/bin/sh
set -eu
set +x

# First installation of a LOSPOR Hospital appliance, with nothing to type.
#
#   online:   sudo sh losporctl-install.sh [--version X.Y.Z]
#   offline:  sudo sh /media/usb/losporctl-install.sh [--media DIR]
#
# After a first installation that did not finish, running it again says what
# the attempt left behind and offers two ways on:
#   --resume              continue with the attempt's settings and databases
#   --discard-unfinished  remove what the attempt left, then install afresh
#
# This file is the trust anchor, so it cannot use any script from the release
# it is about to verify. It carries the maintainer's release signing public key
# itself. A release is installed only when its lock carries a valid Ed25519
# signature from that key, and every payload matches the signed lock.
#
# Online, the key must also match the fingerprint published at lospor.org, which
# is served from Cloudflare rather than GitHub. A forged release would therefore
# need control of GitHub, of lospor.org and of the offline private key. An
# unreachable or different fingerprint stops the install rather than falling
# back to trusting one channel. Offline, the USB's physical custody is the
# second channel and the fingerprint is printed for the record.
#
# The script itself is fetched over HTTPS before anything verifies it -- the
# same model as most vendor installers. It is small enough to read, and its
# SHA-256 is published at lospor.org for anyone who wants to check it by hand.

LOSPOR_RELEASE_SIGNING_PUBLIC_KEY='-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAC77xph3WBOG8btXtjOOxKoEn8lInVMWibhi55/LMTPU=
-----END PUBLIC KEY-----'
repository=kaloyandjunow-prog/lospor-hospital
key_url=https://lospor.org/.well-known/lospor-release-key.txt
api_origin=https://api.github.com
download_origin=https://github.com
appliance_home=/opt/lospor-hospital
systemd_dir=/etc/systemd/system
launcher_dir=/usr/local/bin
host_config_dir=/etc/lospor-hospital
compose_project=lospor-hospital
proto='=https'

test_only="${HOSPITAL_BOOTSTRAP_TEST_ONLY:-0}"
if [ "$test_only" = 1 ]; then
  key_url="${LOSPOR_BOOTSTRAP_KEY_URL:-$key_url}"
  api_origin="${LOSPOR_BOOTSTRAP_API_ORIGIN:-$api_origin}"
  download_origin="${LOSPOR_BOOTSTRAP_DOWNLOAD_ORIGIN:-$download_origin}"
  appliance_home="${LOSPOR_BOOTSTRAP_HOME:-$appliance_home}"
  systemd_dir="${LOSPOR_BOOTSTRAP_SYSTEMD_DIR:-$systemd_dir}"
  launcher_dir="${LOSPOR_BOOTSTRAP_LAUNCHER_DIR:-$launcher_dir}"
  host_config_dir="${LOSPOR_BOOTSTRAP_HOST_CONFIG_DIR:-$host_config_dir}"
  [ -z "${LOSPOR_BOOTSTRAP_PUBLIC_KEY_FILE:-}" ] \
    || LOSPOR_RELEASE_SIGNING_PUBLIC_KEY="$(cat "$LOSPOR_BOOTSTRAP_PUBLIC_KEY_FILE")"
  proto='=http,https'
fi

say() { printf '%s\n%s\n' "$1" "$2" >&2; }
die() { printf '\n' >&2; say "$1" "$2"; exit "${3:-1}"; }

usage() {
  die "Употреба: sudo sh losporctl-install.sh [--version X.Y.Z] [--media ДИРЕКТОРИЯ] [--resume]
       sudo sh losporctl-install.sh --discard-unfinished [--yes]" \
      "Usage: sudo sh losporctl-install.sh [--version X.Y.Z] [--media DIRECTORY] [--resume]
       sudo sh losporctl-install.sh --discard-unfinished [--yes]" 2
}

version=""
media=""
resume=0
discard=0
assume_yes=0
while [ "$#" -gt 0 ]; do
  case "$1" in
    --version) [ "$#" -ge 2 ] || usage; version="$2"; shift 2 ;;
    --media) [ "$#" -ge 2 ] || usage; media="$2"; shift 2 ;;
    --resume) resume=1; shift ;;
    --discard-unfinished) discard=1; shift ;;
    --yes) assume_yes=1; shift ;;
    *) usage ;;
  esac
done
[ "$resume" -eq 0 ] || [ "$discard" -eq 0 ] || usage
[ "$discard" -eq 0 ] || { [ -z "$version" ] && [ -z "$media" ]; } || usage
[ "$assume_yes" -eq 0 ] || [ "$discard" -eq 1 ] || usage
if [ -n "$version" ]; then
  printf '%s\n' "$version" | grep -Eq '^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$' || usage
fi

if [ "$test_only" != 1 ] && [ "$(id -u)" -ne 0 ]; then
  die "Стартирайте с sudo: инсталацията създава системни услуги." \
      "Run with sudo: the installation creates system services." 4
fi
for command_name in openssl sha256sum awk tar gzip wc tr grep sed head mktemp cmp install ln chown id basename dirname; do
  command -v "$command_name" >/dev/null 2>&1 \
    || die "Липсва задължителна команда: $command_name" "A required command is missing: $command_name"
done

# ── An installation, or what an unfinished one left behind ──────────────────
# Installed means activation recorded the release. Anything else under the
# appliance home -- settings, secrets, an activation lock, containers, volumes,
# host services -- is the remains of a first installation that never finished,
# which nobody can have used: the installer printed no address.
installed_state="$appliance_home/.data/installed-release.tsv"
if [ -e "$installed_state" ]; then
  die "LOSPOR вече е инсталиран в $appliance_home. Тази команда е само за нова инсталация; за обновяване използвайте Status или конзолните команди за обновяване." \
      "LOSPOR is already installed in $appliance_home. This command only installs a new appliance; to update, use Status or the console update commands." 3
fi

docker_objects() {
  command -v docker >/dev/null 2>&1 || return 0
  case "$1" in
    containers) docker ps -aq --filter "label=com.docker.compose.project=$compose_project" 2>/dev/null || true ;;
    volumes) docker volume ls -q --filter "label=com.docker.compose.project=$compose_project" 2>/dev/null || true ;;
    networks) docker network ls -q --filter "label=com.docker.compose.project=$compose_project" 2>/dev/null || true ;;
  esac
}
host_units() {
  for unit in "$systemd_dir"/lospor-*.service "$systemd_dir"/lospor-*.timer; do
    [ ! -e "$unit" ] || printf '%s\n' "$unit"
  done
}
count_lines() { if [ -z "$1" ]; then echo 0; else printf '%s\n' "$1" | wc -l | tr -d ' '; fi; }

activation_lock="$appliance_home/.data/release-activation.lock"
containers="$(docker_objects containers)"
volumes="$(docker_objects volumes)"
units="$(host_units)"
settings=0
for path in "$appliance_home/site.env" "$appliance_home/.env" "$appliance_home/secrets/appliance.env"; do
  [ ! -e "$path" ] || settings=1
done
leftovers=""
leftover() { leftovers="$leftovers  - $1
"; }
[ "$settings" -eq 0 ] || leftover "settings and generated secrets / настройки и генерирани тайни ($appliance_home/site.env, secrets/)"
[ ! -e "$activation_lock" ] || leftover "an activation that did not finish / недовършено активиране (.data/release-activation.lock)"
[ ! -L "$appliance_home/current" ] || leftover "a link to a release that was never activated / връзка към неактивирана версия (current)"
[ -z "$containers" ] || leftover "$(count_lines "$containers") containers / контейнера"
[ -z "$volumes" ] || leftover "$(count_lines "$volumes") data volumes, including the databases / тома с данни, включително базите данни"
[ -z "$units" ] || leftover "$(count_lines "$units") system services / системни услуги (lospor-*)"

# An installer still running holds the activation lock with its own process.
if [ -f "$activation_lock/journal.v1.tsv" ]; then
  lock_pid="$(awk -F '\t' 'NR == 1 { print $5 }' "$activation_lock/journal.v1.tsv" 2>/dev/null || true)"
  if printf '%s\n' "$lock_pid" | grep -Eq '^[1-9][0-9]*$' && [ "$lock_pid" != "$$" ] && kill -0 "$lock_pid" 2>/dev/null; then
    die "В момента върви друга инсталация (процес $lock_pid). Изчакайте я да завърши." \
        "Another installation is running right now (process $lock_pid). Wait for it to finish." 3
  fi
fi

if [ "$discard" -eq 1 ]; then
  if [ -z "$leftovers" ] && [ ! -d "$appliance_home" ]; then
    say "Няма нищо за премахване." "There is nothing to discard."
    exit 0
  fi
  say "Ще бъде премахнато всичко, оставено от недовършената инсталация в $appliance_home:" \
      "This removes everything the unfinished installation left in $appliance_home:"
  printf '%s' "${leftovers:-  - (only verified extractions / само проверени разархивирани файлове)
}" >&2
  say "Изтеглените файлове на изданието и заредените образи остават; те се проверяват отново при следващата инсталация." \
      "Downloaded release files and loaded images stay; the next installation verifies them again."
  if [ "$assume_yes" -ne 1 ]; then
    [ -t 0 ] || die "Потвърдете с --yes, когато няма терминал." "Confirm with --yes when there is no terminal." 2
    printf 'Напишете DISCARD, за да продължите / Type DISCARD to continue: ' >&2
    read -r discard_answer || discard_answer=""
    [ "$discard_answer" = DISCARD ] || die "Нищо не е премахнато." "Nothing was removed." 1
  fi
  for id in $containers; do docker rm -f "$id" >/dev/null; done
  for id in $volumes; do docker volume rm "$id" >/dev/null; done
  for id in $(docker_objects networks); do docker network rm "$id" >/dev/null 2>&1 || true; done
  for unit in $units; do
    if command -v systemctl >/dev/null 2>&1; then systemctl disable --now "$(basename "$unit")" >/dev/null 2>&1 || true; fi
    rm -f "$unit"
  done
  if [ -n "$units" ] && command -v systemctl >/dev/null 2>&1; then systemctl daemon-reload >/dev/null 2>&1 || true; fi
  # Only the launcher LOSPOR itself installs, recognised by what it runs.
  if [ -f "$launcher_dir/losporctl" ] && grep -Fq "lospor-hospital/current" "$launcher_dir/losporctl"; then
    rm -f "$launcher_dir/losporctl"
  fi
  rm -rf "$host_config_dir"
  if [ -d "$appliance_home" ]; then
    find "$appliance_home" -mindepth 1 -maxdepth 1 ! -name downloads -exec rm -rf {} +
  fi
  say "Недовършената инсталация е премахната. Стартирайте отново без --discard-unfinished, за да инсталирате." \
      "The unfinished installation is removed. Run this again without --discard-unfinished to install."
  exit 0
fi

if [ -n "$leftovers" ] && [ "$resume" -ne 1 ]; then
  say "Намерена е недовършена първа инсталация в $appliance_home. Тя остави:" \
      "An unfinished first installation was found in $appliance_home. It left:"
  printf '%s' "$leftovers" >&2
  die "Продължете я с нейните настройки и бази данни:   sudo sh $0 --resume
Или я премахнете и инсталирайте наново:           sudo sh $0 --discard-unfinished" \
      "Continue it with its settings and databases:  sudo sh $0 --resume
Or remove it and install afresh:               sudo sh $0 --discard-unfinished" 3
fi

if [ "$resume" -eq 1 ] && [ -n "$leftovers" ]; then
  # Its databases can only be reopened with the secrets that created them.
  if [ ! -s "$appliance_home/site.env" ] || [ ! -s "$appliance_home/secrets/appliance.env" ] \
    || [ ! -s "$appliance_home/.env" ] || [ ! -s "$appliance_home/secrets/api/site-signing-private.pem" ]; then
    die "Предишният опит спря, докато създаваше настройките си, и не може да бъде продължен. Премахнете го: sudo sh $0 --discard-unfinished" \
        "The earlier attempt stopped while creating its settings, so it cannot be continued. Remove it: sudo sh $0 --discard-unfinished" 3
  fi
  say "Продължаване на недовършената инсталация с нейните настройки." \
      "Continuing the unfinished installation with its settings."
fi

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT HUP INT TERM

key_file="$work/release-signing-public.pem"
printf '%s\n' "$LOSPOR_RELEASE_SIGNING_PUBLIC_KEY" > "$key_file"
fingerprint="SHA256:$(openssl pkey -pubin -in "$key_file" -outform DER 2>/dev/null \
  | openssl dgst -sha256 -binary | openssl base64 | tr -d '\r\n=')"
[ "$fingerprint" != "SHA256:" ] \
  || die "Вграденият ключ за подписване не може да бъде прочетен." "The built-in signing key cannot be read."

fetch() {
  curl --fail --silent --show-error --location --proto "$proto" --proto-redir "$proto" \
    --tlsv1.2 --max-time "$2" --output "$3" "$1"
}

# ── Where the release comes from ────────────────────────────────────────────
script_directory="$(CDPATH= cd -- "$(dirname "$0")" && pwd -P)"
if [ -z "$media" ]; then
  set -- "$script_directory"/lospor-hospital-*-release.lock
  if [ -e "$1" ] && [ "$#" -eq 1 ]; then media="$script_directory"; fi
fi

if [ -n "$media" ]; then
  mode=offline
  media="$(CDPATH= cd -- "$media" 2>/dev/null && pwd -P)" \
    || die "Директорията с файловете не съществува." "The release directory does not exist."
  set -- "$media"/lospor-hospital-*-release.lock
  [ -e "$1" ] && [ "$#" -eq 1 ] \
    || die "Директорията трябва да съдържа точно един release.lock." "The directory must contain exactly one release.lock."
  found_version="$(basename "$1" | sed -n 's/^lospor-hospital-\([0-9][0-9.]*\)-release\.lock$/\1/p')"
  [ -n "$found_version" ] || die "Непознато име на release.lock." "Unrecognised release.lock name."
  [ -z "$version" ] || [ "$version" = "$found_version" ] \
    || die "Носителят съдържа версия $found_version, а не $version." "The media holds version $found_version, not $version."
  version="$found_version"
  say "Инсталиране без мрежа от $media. Отпечатък на доверения ключ: $fingerprint" \
      "Installing offline from $media. Trusted key fingerprint: $fingerprint"
else
  mode=online
  command -v curl >/dev/null 2>&1 || die "Необходим е curl." "curl is required."
  fetch "$key_url" 30 "$work/published-key.txt" \
    || die "lospor.org не е достъпен, затова ключът за подписване не може да бъде потвърден. Нищо не е инсталирано. Опитайте отново или инсталирайте от USB." \
           "lospor.org is unreachable, so the signing key cannot be confirmed. Nothing was installed. Try again, or install from USB."
  published="$(tr -d '\r' < "$work/published-key.txt" | grep -E '^SHA256:[A-Za-z0-9+/]{43}$' | head -n 1 || true)"
  [ "$published" = "$fingerprint" ] \
    || die "КЛЮЧЪТ ЗА ПОДПИСВАНЕ НЕ СЪВПАДА С ПУБЛИКУВАНИЯ В lospor.org. Спрете и се свържете с издателя.
  вграден      $fingerprint
  публикуван   ${published:-(няма)}" \
           "THE SIGNING KEY DOES NOT MATCH THE ONE PUBLISHED AT lospor.org. Stop and contact the publisher.
  built in     $fingerprint
  published    ${published:-(none)}"
  if [ -z "$version" ]; then
    fetch "$api_origin/repos/$repository/releases/latest" 60 "$work/latest.json" \
      || die "Последната версия не може да бъде определена от GitHub." "The latest release cannot be determined from GitHub."
    version="$(tr -d '\n' < "$work/latest.json" \
      | sed -n 's/.*"tag_name"[[:space:]]*:[[:space:]]*"hospital-\([0-9][0-9]*\.[0-9][0-9]*\.[0-9][0-9]*\)".*/\1/p')"
    [ -n "$version" ] || die "GitHub не върна валидна версия." "GitHub returned no valid release version."
  fi
fi

prefix="lospor-hospital-$version"
lock_name="$prefix-release.lock"

# ── The appliance home ──────────────────────────────────────────────────────
owner="${SUDO_USER:-}"
if [ -z "$owner" ] || ! id -u "$owner" >/dev/null 2>&1; then owner="$(id -un)"; fi
owner_group="$(id -gn "$owner")"
install -d -m 0750 -o "$owner" -g "$owner_group" "$appliance_home"

if [ "$mode" = online ]; then
  media="$appliance_home/downloads/$prefix"
  rm -rf "$media"
  install -d -m 0700 "$appliance_home/downloads" "$media"
  say "Изтегляне на версия $version от GitHub..." "Downloading release $version from GitHub..."
  for suffix in release.lock release.lock.sha256 release.lock.sig deployment.tar.gz manifest.json security-evidence.tar.gz; do
    fetch "$download_origin/$repository/releases/download/hospital-$version/$prefix-$suffix" 1800 "$media/$prefix-$suffix" \
      || die "Файлът $prefix-$suffix не можа да бъде изтеглен." "Could not download $prefix-$suffix."
  done
fi

lock="$media/$lock_name"
sidecar="$lock.sha256"
signature="$lock.sig"

# ── Signature, sidecar, and every byte the bootstrap is about to run ─────────
for required in "$lock" "$sidecar" "$signature" "$media/$prefix-deployment.tar.gz"; do
  [ -f "$required" ] && [ ! -L "$required" ] \
    || die "Липсва файл от изданието: $(basename "$required")" "A release file is missing: $(basename "$required")"
done
[ "$(wc -c < "$signature" | tr -d '[:space:]')" = 64 ] \
  || die "Подписът на изданието е невалиден." "The release signature is malformed."
openssl pkeyutl -verify -pubin -inkey "$key_file" -rawin -in "$lock" -sigfile "$signature" >/dev/null 2>&1 \
  || die "ПОДПИСЪТ НА ИЗДАНИЕТО НЕ Е ВАЛИДЕН. Не инсталирайте тези файлове." \
         "THE RELEASE SIGNATURE DOES NOT VERIFY. Do not install these files."
lock_sha="$(sha256sum "$lock" | awk '{print $1}')"
printf '%s  %s\n' "$lock_sha" "$lock_name" | cmp -s - "$sidecar" \
  || die "Придружаващият SHA-256 файл не съответства на release.lock." "The SHA-256 sidecar does not match release.lock."
[ "$(head -n 1 "$lock")" = LOSPOR-HOSPITAL-RELEASE-LOCK-V2 ] \
  || die "Непознат формат на release.lock." "Unrecognised release.lock format."
[ "$(awk -F '\t' '$1 == "release" { count += 1; identity = $2 "\t" $3 } END { if (count == 1) print identity }' "$lock")" \
  = "$version$(printf '\t')hospital-$version" ] \
  || die "release.lock не описва версия $version." "release.lock does not describe release $version."

deployment="$media/$prefix-deployment.tar.gz"
record="$(awk -F '\t' -v file="$prefix-deployment.tar.gz" '
  $1 == "artifact" && $2 == "deployment" && $4 == file { count += 1; value = $5 " " $6 }
  END { if (count == 1) print value }' "$lock")"
printf '%s\n' "$record" | grep -Eq '^[1-9][0-9]* [a-f0-9]{64}$' \
  || die "release.lock няма точно един запис за инсталационния архив." "release.lock does not have exactly one deployment record."
expected_bytes="${record% *}"
expected_sha="${record#* }"
[ "$(wc -c < "$deployment" | tr -d '[:space:]')" = "$expected_bytes" ] \
  && [ "$(sha256sum "$deployment" | awk '{print $1}')" = "$expected_sha" ] \
  || die "Инсталационният архив не съвпада с подписания release.lock." "The deployment archive does not match the signed release.lock."

tar -tzf "$deployment" > "$work/entries" \
  || die "Инсталационният архив е повреден." "The deployment archive is damaged."
awk -v prefix="$prefix/" '
  index($0, prefix) != 1 { bad = 1 }
  $0 ~ /(^|\/)\.\.?($|\/)/ { bad = 1 }
  END { exit bad }' "$work/entries" \
  || die "Инсталационният архив съдържа небезопасни пътища." "The deployment archive contains unsafe paths."
tar -tvzf "$deployment" | awk 'substr($0, 1, 1) != "-" && substr($0, 1, 1) != "d" { bad = 1 } END { exit bad }' \
  || die "Инсталационният архив съдържа връзки или специални файлове." "The deployment archive contains links or special files."

# ── Extract, pin the key, and hand over to the guided installer ─────────────
# A bootstrap directory without an installation is only a verified extraction
# from an interrupted attempt, so it is replaced rather than blocking a retry.
bootstrap_parent="$appliance_home/bootstrap-$version"
rm -rf "$bootstrap_parent"
install -d -m 0700 "$bootstrap_parent"
# Extract under 022, not whatever the caller left behind.
#
# --no-same-permissions applies the umask to every extracted file, and the
# first-boot installer runs the whole installation under `umask 077` because it
# handles the administrator password and the TLS private key. Inheriting that
# here turned the release payload owner-only: 100644 became 0600 and 100755
# became 0700, all owned by the appliance user. compose.yaml bind-mounts eleven
# of these scripts into containers that run as other users -- Postgres is 999,
# the curl worker 100 -- so the install died on the first one it reached with
# "cannot open /usr/local/bin/create-status-probe.sh: Permission denied" and
# rolled back before the activation commit.
#
# The release payload is a public, signed artifact; nothing in it is a secret.
# The secrets this installer goes on to create set their own 077 (see
# generate-secrets.sh and ensure-*-secrets.sh), so tightening is not lost.
(umask 022; tar -xzf "$deployment" --no-same-owner --no-same-permissions -C "$bootstrap_parent")
chown -R "$owner:$owner_group" "$bootstrap_parent"
bootstrap_root="$bootstrap_parent/$prefix"
[ -f "$bootstrap_root/scripts/install-guided.sh" ] && [ -f "$bootstrap_root/scripts/verify-release.sh" ] \
  || die "Инсталационният архив е непълен." "The deployment archive is incomplete."
ln -s "$appliance_home" "$bootstrap_root/.lospor-home"
# The same placeholder swap activation makes in every release: the guided
# installer's readiness check reads secrets/tls from the release it runs in, so
# a hospital certificate placed in the appliance home before installing is
# found there rather than failing as missing.
if [ -d "$bootstrap_root/secrets" ] && [ ! -L "$bootstrap_root/secrets" ] \
  && [ -z "$(find "$bootstrap_root/secrets" -mindepth 1 -maxdepth 1 ! -name .gitkeep -print -quit)" ]; then
  rm -rf "$bootstrap_root/secrets"
  install -d -m 0700 -o "$owner" -g "$owner_group" "$appliance_home/secrets"
  ln -s "$appliance_home/secrets" "$bootstrap_root/secrets"
fi

HOSPITAL_RELEASE_SIGNING_FINGERPRINT="$fingerprint" \
  sh "$bootstrap_root/scripts/pin-release-signing-key.sh" "$bootstrap_root/infra/release-signing/release-signing-public.pem" \
  || die "Ключът в изданието не съвпада с доверения ключ. Нищо не е инсталирано." \
         "The key inside the release does not match the trusted key. Nothing was installed."

scope=all
[ "$mode" = offline ] || scope=deployment
sh "$bootstrap_root/scripts/verify-release.sh" "$lock" "$sidecar" "$media" "$scope" >&2

# ── The release dossier: what this release is, in one verdict ───────────────
# It is inside the security evidence, so that archive is matched to the signed
# lock first; the dossier must then describe the same release.
evidence="$media/$prefix-security-evidence.tar.gz"
evidence_record="$(awk -F '\t' -v file="$prefix-security-evidence.tar.gz" '
  $1 == "artifact" && $2 == "security-evidence" && $4 == file { count += 1; value = $5 " " $6 }
  END { if (count == 1) print value }' "$lock")"
[ -f "$evidence" ] && [ ! -L "$evidence" ] && [ -n "$evidence_record" ] \
  && [ "$(wc -c < "$evidence" | tr -d '[:space:]')" = "${evidence_record% *}" ] \
  && [ "$(sha256sum "$evidence" | awk '{print $1}')" = "${evidence_record#* }" ] \
  || die "Архивът с доказателства за сигурност не съвпада с подписания release.lock." \
         "The security evidence does not match the signed release.lock."
command -v python3 >/dev/null 2>&1 \
  || die "Липсва python3. Инсталирайте го (sudo apt-get install python3) и опитайте отново." \
         "python3 is missing. Install it (sudo apt-get install python3) and try again."
state_dir="$appliance_home/.data/runtime/update/state"
mkdir -p "$state_dir"
say "Досие на изданието:" "Release dossier:"
dossier_result=0
if [ ! -f "$bootstrap_root/scripts/release-dossier.py" ]; then
  # A release from before 1.4.0 carries neither a dossier nor the tool that
  # reads one. The signature above already covers everything it does carry.
  dossier_result=3
else
  LOSPOR_OPERATOR_LOCALE=bg python3 "$bootstrap_root/scripts/release-dossier.py" project "$evidence" "$lock" "$state_dir" >&2 \
    || dossier_result=$?
  [ "$dossier_result" -ne 0 ] \
    || LOSPOR_OPERATOR_LOCALE=en python3 "$bootstrap_root/scripts/release-dossier.py" summary "$evidence" "$lock" >&2 \
    || dossier_result=$?
fi
case "$dossier_result" in
  0) ;;
  3) say "  (това издание е публикувано преди досиетата, въведени с 1.4.0)" "  (this release was published before release dossiers were introduced in 1.4.0)" ;;
  *) die "Досието на изданието не описва подписаното издание. Нищо не е инсталирано." \
         "The release dossier does not describe the signed release. Nothing was installed." ;;
esac

# ── Resuming: clear what would stop the verified release from activating ────
# The link and the lock are the two things a first installation leaves that
# the next activation refuses to pass. The lock is cleared by the release's own
# recovery, which accepts it only as the lock of a release never installed.
if [ "$resume" -eq 1 ]; then
  if [ -L "$appliance_home/current" ] && [ ! -e "$installed_state" ]; then
    rm -f "$appliance_home/current"
  fi
  if [ -e "$activation_lock" ]; then
    sh "$bootstrap_root/scripts/recover-release-activation.sh" verify-and-clear --confirm-clear >&2 \
      || die "Заключването от предишния опит не може да бъде изчистено. Премахнете опита: sudo sh $0 --discard-unfinished" \
             "The lock left by the earlier attempt cannot be cleared. Remove the attempt: sudo sh $0 --discard-unfinished"
  fi
fi

say "Версия $version е проверена по подпис. Стартиране на водената инсталация." \
    "Release $version is verified by signature. Starting the guided installation."
trap - EXIT HUP INT TERM
rm -rf "$work"
exec sh "$bootstrap_root/scripts/install-guided.sh" "$lock" "$sidecar" "$media"
