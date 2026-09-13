#!/bin/sh
set -eu
set +x

# First installation of a LOSPOR Hospital appliance, with nothing to type.
#
#   online:   sudo sh losporctl-install.sh [--version X.Y.Z]
#   offline:  sudo sh /media/usb/losporctl-install.sh [--media DIR]
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
proto='=https'

test_only="${HOSPITAL_BOOTSTRAP_TEST_ONLY:-0}"
if [ "$test_only" = 1 ]; then
  key_url="${LOSPOR_BOOTSTRAP_KEY_URL:-$key_url}"
  api_origin="${LOSPOR_BOOTSTRAP_API_ORIGIN:-$api_origin}"
  download_origin="${LOSPOR_BOOTSTRAP_DOWNLOAD_ORIGIN:-$download_origin}"
  appliance_home="${LOSPOR_BOOTSTRAP_HOME:-$appliance_home}"
  [ -z "${LOSPOR_BOOTSTRAP_PUBLIC_KEY_FILE:-}" ] \
    || LOSPOR_RELEASE_SIGNING_PUBLIC_KEY="$(cat "$LOSPOR_BOOTSTRAP_PUBLIC_KEY_FILE")"
  proto='=http,https'
fi

say() { printf '%s\n%s\n' "$1" "$2" >&2; }
die() { printf '\n' >&2; say "$1" "$2"; exit "${3:-1}"; }

usage() {
  die "Употреба: sudo sh losporctl-install.sh [--version X.Y.Z] [--media ДИРЕКТОРИЯ]" \
      "Usage: sudo sh losporctl-install.sh [--version X.Y.Z] [--media DIRECTORY]" 2
}

version=""
media=""
while [ "$#" -gt 0 ]; do
  case "$1" in
    --version) [ "$#" -ge 2 ] || usage; version="$2"; shift 2 ;;
    --media) [ "$#" -ge 2 ] || usage; media="$2"; shift 2 ;;
    *) usage ;;
  esac
done
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

# ── The appliance home, refusing an existing installation ───────────────────
if [ -e "$appliance_home/current" ] || [ -e "$appliance_home/.data/installed-release.tsv" ]; then
  die "LOSPOR вече е инсталиран в $appliance_home. Тази команда е само за нова инсталация; за обновяване използвайте Status или конзолните команди за обновяване." \
      "LOSPOR is already installed in $appliance_home. This command only installs a new appliance; to update, use Status or the console update commands." 3
fi
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
tar -xzf "$deployment" --no-same-owner --no-same-permissions -C "$bootstrap_parent"
chown -R "$owner:$owner_group" "$bootstrap_parent"
bootstrap_root="$bootstrap_parent/$prefix"
[ -f "$bootstrap_root/scripts/install-guided.sh" ] && [ -f "$bootstrap_root/scripts/verify-release.sh" ] \
  || die "Инсталационният архив е непълен." "The deployment archive is incomplete."
ln -s "$appliance_home" "$bootstrap_root/.lospor-home"

HOSPITAL_RELEASE_SIGNING_FINGERPRINT="$fingerprint" \
  sh "$bootstrap_root/scripts/pin-release-signing-key.sh" "$bootstrap_root/infra/release-signing/release-signing-public.pem" \
  || die "Ключът в изданието не съвпада с доверения ключ. Нищо не е инсталирано." \
         "The key inside the release does not match the trusted key. Nothing was installed."

scope=all
[ "$mode" = offline ] || scope=deployment
sh "$bootstrap_root/scripts/verify-release.sh" "$lock" "$sidecar" "$media" "$scope" >&2

say "Версия $version е проверена по подпис. Стартиране на водената инсталация." \
    "Release $version is verified by signature. Starting the guided installation."
trap - EXIT HUP INT TERM
rm -rf "$work"
exec sh "$bootstrap_root/scripts/install-guided.sh" "$lock" "$sidecar" "$media"
