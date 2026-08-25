#!/bin/sh
set -eu

# Internal, stable-key certificate inspection used by readiness and its
# throwaway-certificate integration tests. It intentionally emits no prose;
# the caller renders every result in the selected operator language.
[ "$#" -eq 6 ] || exit 2
certificate="$1"
private_key="$2"
authority="$3"
clinical_name="$4"
research_name="$5"
minimum_seconds="$6"
case "$minimum_seconds" in ''|*[!0-9]*) exit 2 ;; esac

# `openssl x509 -checkhost` prints the answer and exits 0 either way on
# OpenSSL 3.0, which is what Ubuntu 24.04 and therefore the appliance runs.
# Only 3.2 and later started returning 1 for a name that does not match. So
# `if openssl x509 -checkhost ...` accepted every certificate regardless of the
# names in it, and did so silently: this check reported both hostnames verified
# for a certificate naming neither.
#
# It passed on the maintainer's Windows host, where OpenSSL 3.5 returns 1, and
# failed only where it mattered.
#
# The answer is in the text, so read the text. Unrecognised output is refused
# rather than guessed at -- a future wording change must break this loudly, not
# quietly re-open the same hole.
certificate_covers_host() {
  covers_output="$(openssl x509 -noout -checkhost "$1" -in "$2" 2>/dev/null)" || return 1
  case "$covers_output" in
    *"does NOT match"*) return 1 ;;
    *"does match"*) return 0 ;;
    *) return 1 ;;
  esac
}

parts="$(mktemp -d)"
cleanup() { rm -rf "$parts"; }
trap cleanup EXIT HUP INT TERM
leaf="$parts/leaf.pem"
chain="$parts/intermediates.pem"

awk -v leaf="$leaf" -v chain="$chain" '
  /-----BEGIN CERTIFICATE-----/ { certificate_number += 1 }
  certificate_number == 1 { print > leaf }
  certificate_number >= 2 { print > chain }
' "$certificate" 2>/dev/null || true

emit() { printf '%s\t%s\n' "$1" "$2"; }
if [ ! -s "$leaf" ]; then
  for field in LEAF_PRESENT KEY_MATCH CLINICAL_HOST RESEARCH_HOST SERVER_PURPOSE \
    CLINICAL_VERIFY RESEARCH_VERIFY CHECKEND
  do emit "$field" 0; done
  emit END_DATE unknown
  exit 0
fi
emit LEAF_PRESENT 1

certificate_public="$(openssl x509 -noout -pubkey -in "$leaf" 2>/dev/null || true)"
key_public="$(openssl pkey -pubout -passin pass: -in "$private_key" 2>/dev/null || true)"
if [ -n "$certificate_public" ] && [ "$certificate_public" = "$key_public" ]; then
  emit KEY_MATCH 1
else
  emit KEY_MATCH 0
fi

if certificate_covers_host "$clinical_name" "$leaf"; then
  emit CLINICAL_HOST 1
else
  emit CLINICAL_HOST 0
fi
if certificate_covers_host "$research_name" "$leaf"; then
  emit RESEARCH_HOST 1
else
  emit RESEARCH_HOST 0
fi
if openssl x509 -purpose -noout -in "$leaf" 2>/dev/null \
    | grep -Eq '^SSL server[[:space:]]*:[[:space:]]*Yes'; then
  emit SERVER_PURPOSE 1
else
  emit SERVER_PURPOSE 0
fi

verify_name() {
  verify_host="$1"
  if [ -s "$chain" ]; then
    openssl verify -CAfile "$authority" -untrusted "$chain" \
      -purpose sslserver -verify_hostname "$verify_host" "$leaf" >/dev/null 2>&1
  else
    openssl verify -CAfile "$authority" \
      -purpose sslserver -verify_hostname "$verify_host" "$leaf" >/dev/null 2>&1
  fi
}
if verify_name "$clinical_name"; then emit CLINICAL_VERIFY 1; else emit CLINICAL_VERIFY 0; fi
if verify_name "$research_name"; then emit RESEARCH_VERIFY 1; else emit RESEARCH_VERIFY 0; fi
if openssl x509 -noout -checkend "$minimum_seconds" -in "$leaf" >/dev/null 2>&1; then
  emit CHECKEND 1
else
  emit CHECKEND 0
fi
end_date="$(openssl x509 -noout -enddate -in "$leaf" 2>/dev/null | sed 's/^notAfter=//' || true)"
emit END_DATE "${end_date:-unknown}"
