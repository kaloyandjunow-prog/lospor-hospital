#!/bin/sh
set -eu

# Record that this installation's secrets have been escrowed off the appliance.
#
# The appliance cannot verify escrow -- it cannot see inside the hospital's safe
# -- so this records an acknowledgement, the same way off-host backup
# verification does. What it buys is that the absence of the acknowledgement is
# visible in doctor.sh rather than being a line in a document nobody read.
#
# Why it matters more than the backup acknowledgement it mirrors: a backup that
# exists only here is a setback if the machine is lost. Secrets that exist only
# here are final. Backups carry key fingerprints, never keys, so nothing can
# reconstruct .env -- and without it every stored patient identifier is
# undecryptable and every pseudonym already delivered to Central can never be
# matched to this hospital's patients again.

root="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"
cd "$root"
. "$root/scripts/operator-locale.sh"
operator_locale_load "$root"

marker=.secrets-escrowed.v1

fingerprint_of() {
  # Recorded so a later escrow can be checked against what is actually running.
  # The fingerprint is one-way and safe to keep beside the acknowledgement; the
  # key itself is never written here.
  value="$(sed -n "s/^$1=//p" .env 2>/dev/null | tail -n 1)"
  [ -n "$value" ] || { printf 'missing\n'; return 0; }
  printf 'sha256:%s\n' "$(printf '%s' "$value" | sha256sum | awk '{ print $1 }')"
}

operator_say \
  "Confirm that .env and the complete secrets/ directory have been copied into a separate encrypted, access-controlled system outside this appliance and its storage." \
  "Потвърдете, че .env и цялата директория secrets/ са копирани в отделна шифрована система с контролиран достъп извън този модул и неговото хранилище."

if [ -t 0 ]; then
  operator_say "Type ESCROWED to confirm:" "Въведете ESCROWED за потвърждение:"
  read -r answer
else
  answer="${LOSPOR_ESCROW_CONFIRM_INPUT:-}"
fi

if [ "$answer" != "ESCROWED" ]; then
  operator_error \
    "Not confirmed. Nothing recorded." \
    "Няма потвърждение. Нищо не е записано."
  exit 2
fi

{
  printf 'acknowledgedAtEpoch=%s\n' "$(date -u +%s)"
  printf 'acknowledgedBy=%s\n' "${SUDO_USER:-${USER:-unknown}}"
  printf 'patientHmacKeyFingerprint=%s\n' "$(fingerprint_of HOSPITAL_PATIENT_HMAC_KEY)"
  printf 'patientEncryptionKeyFingerprint=%s\n' "$(fingerprint_of HOSPITAL_PATIENT_ENCRYPTION_KEY)"
  printf 'exportPseudonymKeyFingerprint=%s\n' "$(fingerprint_of HOSPITAL_EXPORT_PSEUDONYM_KEY)"
} > "$marker"

operator_say \
  "Recorded. Re-run this after any change to .env or secrets/, so the acknowledgement describes what is actually escrowed." \
  "Записано. Изпълнете отново след промяна на .env или secrets/, за да отговаря потвърждението на действително съхраненото."
