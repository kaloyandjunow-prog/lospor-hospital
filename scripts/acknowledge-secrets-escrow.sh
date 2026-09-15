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

#
# To have LOSPOR write and check the escrow copy itself, use
# sudo losporctl secrets escrow DIRECTORY instead.

root="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"
. "$root/scripts/installed-release-state.sh"
. "$root/scripts/operator-locale.sh"
. "$root/scripts/secrets-escrow-lib.sh"
# The appliance home, where the host probe and doctor read the acknowledgement.
home="$(release_state_appliance_home "$root")"
operator_locale_load "$home"

operator_say \
  "Confirm that site.env, .env and the complete secrets/ directory have been copied into a separate encrypted, access-controlled system outside this appliance and its storage." \
  "Потвърдете, че site.env, .env и цялата директория secrets/ са копирани в отделна шифрована система с контролиран достъп извън този модул и неговото хранилище."

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

escrow_record_acknowledgement "$home" "method=acknowledged-by-operator"

operator_say \
  "Recorded. Re-run this after any change to site.env, .env or secrets/, so the acknowledgement describes what is actually escrowed." \
  "Записано. Изпълнете отново след промяна на site.env, .env или secrets/, за да отговаря потвърждението на действително съхраненото."
