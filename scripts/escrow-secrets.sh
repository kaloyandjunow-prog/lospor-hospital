#!/bin/sh
set -eu
set +x

# Escrow this installation's secrets in one step.
#
#   sudo losporctl secrets escrow DIRECTORY [--passphrase-file FILE]
#
# Writes site.env, .env, advanced.env (when present) and the whole secrets/
# directory, encrypted, to DIRECTORY -- a USB stick or a share mounted from
# outside this server -- then decrypts the copy and requires it to match what
# is running byte for byte, and only then records the acknowledgement Go-live
# checks.
#
# Why this is a go-live requirement: backups hold only fingerprints of these
# keys. If the server is lost and the keys exist nowhere else, every stored
# patient identity is unreadable for good, even from a good backup, and cases
# already sent to Central can never be matched to this hospital's patients.
#
# The passphrase is generated and shown once, unless the hospital supplies its
# own with --passphrase-file (read from the file, never from the command line).
# Keep the passphrase and the copy in different places: either alone opens
# nothing.
#
# To restore on a replacement server, as root in /opt/lospor-hospital:
#   openssl enc -d -aes-256-cbc -pbkdf2 -iter 600000 -md sha256 -in BUNDLE | tar -xz

root="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd -P)"
. "$root/scripts/installed-release-state.sh"
. "$root/scripts/operator-locale.sh"
. "$root/scripts/secrets-escrow-lib.sh"
home="$(release_state_appliance_home "$root")"
operator_locale_load "$home"
test_only="${HOSPITAL_ESCROW_TEST_ONLY:-0}"

say() { operator_say "$1" "$2"; }
die() { operator_error "$1" "$2"; exit "${3:-1}"; }
usage() {
  die "Usage: sudo losporctl secrets escrow DIRECTORY [--passphrase-file FILE]" \
      "Употреба: sudo losporctl secrets escrow ДИРЕКТОРИЯ [--passphrase-file ФАЙЛ]" 2
}

destination=""
passphrase_file=""
while [ "$#" -gt 0 ]; do
  case "$1" in
    --passphrase-file) [ "$#" -ge 2 ] || usage; passphrase_file="$2"; shift 2 ;;
    -*) usage ;;
    *) [ -z "$destination" ] || usage; destination="$1"; shift ;;
  esac
done
[ -n "$destination" ] || usage

if [ "$test_only" != 1 ] && [ "$(id -u)" -ne 0 ]; then
  die "Run it with sudo: the secrets are readable only by root." "Изпълнете със sudo: тайните се четат само от root." 4
fi

# ── What is escrowed ────────────────────────────────────────────────────────
escrow_entries "$home" >/dev/null \
  || die "$home/site.env, .env or secrets/ is missing, so there is nothing complete to escrow." \
         "$home/site.env, .env или secrets/ липсва, така че няма пълен набор за съхранение."

# ── Where it goes: somewhere that does not share this server's fate ─────────
case "$destination" in
  /*) ;;
  *) die "Give the full path of the USB stick or share, for example /media/usb." \
         "Дайте пълния път до USB паметта или споделената папка, например /media/usb." 2 ;;
esac
[ -d "$destination" ] && [ ! -L "$destination" ] \
  || die "$destination is not a directory. Plug in the USB stick or mount the share first." \
         "$destination не е директория. Първо поставете USB паметта или монтирайте споделената папка."
# A copy on this server's own disk is lost with the server. Refused unless the
# test suite, which has only one disk, says otherwise.
if [ "$(stat -c %d "$destination")" = "$(stat -c %d "$home")" ] \
  && [ "${HOSPITAL_ESCROW_TEST_ALLOW_SAME_DEVICE:-0}" != 1 ]; then
  die "$destination is on this server's own disk. A copy there is lost together with the server: use a USB stick or a share mounted from elsewhere." \
      "$destination е на собствения диск на сървъра. Копие там се губи заедно със сървъра: използвайте USB памет или споделена папка от друго място."
fi

# Beside the secrets themselves, root-only, and removed on every exit: the
# plaintext archive never lands anywhere the secrets were not already.
work="$(mktemp -d "$home/.escrow-work.XXXXXX")"
chmod 0700 "$work"
bundle_temporary=""
trap 'rm -rf "$work"; [ -z "$bundle_temporary" ] || rm -f "$bundle_temporary"' EXIT HUP INT TERM
umask 077

# ── The passphrase ──────────────────────────────────────────────────────────
passphrase="$work/passphrase"
generated=0
if [ -n "$passphrase_file" ]; then
  [ -f "$passphrase_file" ] && [ ! -L "$passphrase_file" ] \
    || die "The passphrase file does not exist." "Файлът с паролата не съществува." 2
  head -n 1 "$passphrase_file" | tr -d '\r\n' > "$passphrase"
  [ "$(wc -c < "$passphrase" | tr -d ' ')" -ge 16 ] \
    || die "The passphrase must be at least 16 characters." "Паролата трябва да е поне 16 знака." 2
else
  [ -t 0 ] || die "No terminal to show a new passphrase on. Run it at the console, or give --passphrase-file." \
                  "Няма терминал, на който да се покаже нова парола. Изпълнете от конзолата или задайте --passphrase-file." 2
  # The alphabet escrow_passphrase_valid accepts, in six groups of five: about 147 bits.
  raw="$(LC_ALL=C tr -dc 'abcdefghjkmnpqrstuvwxyz23456789' < /dev/urandom | head -c 30)"
  printf '%s-%s-%s-%s-%s-%s' "$(printf '%s' "$raw" | cut -c1-5)" "$(printf '%s' "$raw" | cut -c6-10)" \
    "$(printf '%s' "$raw" | cut -c11-15)" "$(printf '%s' "$raw" | cut -c16-20)" \
    "$(printf '%s' "$raw" | cut -c21-25)" "$(printf '%s' "$raw" | cut -c26-30)" > "$passphrase"
  unset raw
  generated=1
fi

# ── Write, then prove the copy opens to exactly what is running ─────────────
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
name="lospor-hospital-secrets-$stamp.tar.gz.enc"
[ ! -e "$destination/$name" ] || die "$destination/$name already exists." "$destination/$name вече съществува."
bundle_temporary="$destination/.$name.tmp"
written=0
escrow_write_bundle "$home" "$passphrase" "$bundle_temporary" "$work" || written=$?
case "$written" in
  0) ;;
  1) die "The secrets could not be read." "Тайните не могат да бъдат прочетени." ;;
  2) die "Writing to $destination failed." "Записът в $destination не бе успешен." ;;
  *) die "The copy on $destination does not decrypt to the secrets in use. Nothing was recorded; check the USB stick or share and try again." \
         "Копието в $destination не се дешифрира до използваните тайни. Нищо не е отбелязано; проверете USB паметта или споделената папка и опитайте отново." ;;
esac
mv "$bundle_temporary" "$destination/$name"
bundle_temporary=""
bundle_sha="$(sha256sum "$destination/$name" | awk '{ print $1 }')"
printf '%s  %s\n' "$bundle_sha" "$name" > "$destination/$name.sha256"
sync

escrow_record_acknowledgement "$home" "method=losporctl-secrets-escrow
escrowBundle=$name
escrowBundleSha256=$bundle_sha"

say "Escrowed and checked: $destination/$name" "Съхранено и проверено: $destination/$name"
if [ "$generated" -eq 1 ]; then
  say "Passphrase (shown only now): $(cat "$passphrase")" "Парола (показва се само сега): $(cat "$passphrase")"
  say "Store the passphrase in the hospital's password vault, and the USB stick or share copy somewhere else. Either one alone opens nothing." \
      "Съхранете паролата в хранилището за пароли на болницата, а копието на USB паметта или споделената папка другаде. Всяко от двете само по себе си не отваря нищо."
fi
say "Go-live now counts the secrets as escrowed. Run this again after any change to the secrets, such as a rotation or new off-host copies." \
    "Готовността вече отчита тайните като съхранени. Изпълнете отново след всяка промяна на тайните, например смяна или нови копия извън сървъра."
