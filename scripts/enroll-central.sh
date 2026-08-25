#!/bin/sh
set -eu

root="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"
. "$root/scripts/operator-locale.sh"
operator_locale_load "$root"

# Retained as a safe pointer for operators with an older runbook. Enrollment
# tokens must not be command-line arguments, and a clinical ADMIN session must
# not bypass the two independent Status password confirmations and audit locks.
operator_error \
  "Central enrollment moved to the private Status page. Sign in to /status/control, configure the Central transport lock, then approve clinical export separately." \
  "Свързването с Central се премести в частната страница за състояние. Влезте в /status/control, заключете преноса към Central и отделно одобрете клиничния износ."
exit 2
