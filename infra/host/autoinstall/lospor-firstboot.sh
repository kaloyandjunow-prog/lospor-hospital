#!/bin/sh
set -eu
set +x

# First boot of a server made by the Windows wizard (Install-LosporHospital.ps1):
# install LOSPOR Hospital from the answers typed there, with nothing to type here.
#
# The wizard puts its answers on the seed disk beside Ubuntu's setup file, never
# inside it (Ubuntu's installer logs that file). Ubuntu's last step copies them
# to /var/lib/lospor-firstboot, root-only, and the wizard deletes the seed disk
# before this machine starts again. This runs once, from firstboot-lospor.service:
#
#   answers.env                     settings, no secrets (format below)
#   admin-password                  the LOSPOR administrator password
#   tls.pfx, tls.pfx-password       the hospital certificate as one .pfx, or
#   tls-fullchain.pem, tls-private.key
#   tls-ca.pem                      the hospital authority, when not in the .pfx
#
# The password and certificate files are read before anything else and deleted
# at once; the password then lives only in /run, which is memory, until the
# guided installer takes it. The installer itself is the ordinary one: the
# losporctl-install.sh the wizard carried verifies the maintainer's signature
# exactly as it does when a person runs it.
#
# Progress reaches the wizard on Windows through Hyper-V's key-value exchange
# (hv_kvp_daemon), as LosporInstallState (installing, installed, failed),
# LosporInstallMessage and LosporInstallUrl. The same words are kept in
# /var/lib/lospor-firstboot-result for the console.
#
# answers.env: the first line is LOSPOR-HOSPITAL-INSTALL-ANSWERS-V1, then one
# KEY=value per line from the list below. Values are taken literally, never
# evaluated, and may not contain quotes, backslashes, dollar signs or backticks.

state_dir=/var/lib/lospor-firstboot
result_file=/var/lib/lospor-firstboot-result
runtime_dir=/run/lospor-firstboot
appliance_home=/opt/lospor-hospital
bootstrap=/usr/local/lib/lospor/losporctl-install.sh
release_label=LOSPORREL
release_mount=/run/lospor-release
kvp_pool=/var/lib/hyperv/.kvp_pool_1
log=/var/log/lospor-firstboot.log
console_user=lospor
dns_wait_seconds=3600

if [ "${LOSPOR_FIRSTBOOT_TEST_ONLY:-0}" = 1 ]; then
  state_dir="$LOSPOR_FIRSTBOOT_STATE_DIR"
  result_file="$LOSPOR_FIRSTBOOT_RESULT_FILE"
  runtime_dir="$LOSPOR_FIRSTBOOT_RUNTIME_DIR"
  appliance_home="$LOSPOR_FIRSTBOOT_HOME"
  bootstrap="$LOSPOR_FIRSTBOOT_BOOTSTRAP"
  release_mount="$LOSPOR_FIRSTBOOT_RELEASE_MOUNT"
  kvp_pool="$LOSPOR_FIRSTBOOT_KVP_POOL"
  log="$LOSPOR_FIRSTBOOT_LOG"
  console_user="$(id -un)"
  dns_wait_seconds="${LOSPOR_FIRSTBOOT_DNS_WAIT_SECONDS:-0}"
fi

ANSWER_KEYS="LOSPOR_DEFAULT_LOCALE LOSPOR_RELEASE_VERSION HOSPITAL_CLINICAL_DOMAIN HOSPITAL_RESEARCH_DOMAIN HOSPITAL_TLS_MODE ACME_EMAIL HOSPITAL_INSTITUTION_NAME HOSPITAL_INSTITUTION_CITY HOSPITAL_BOOTSTRAP_ADMIN_EMAIL HOSPITAL_BOOTSTRAP_ADMIN_USERNAME HOSPITAL_BOOTSTRAP_ADMIN_FIRST_NAME HOSPITAL_BOOTSTRAP_ADMIN_LAST_NAME"
REQUIRED_KEYS="LOSPOR_DEFAULT_LOCALE HOSPITAL_CLINICAL_DOMAIN HOSPITAL_RESEARCH_DOMAIN HOSPITAL_TLS_MODE HOSPITAL_INSTITUTION_NAME HOSPITAL_INSTITUTION_CITY HOSPITAL_BOOTSTRAP_ADMIN_EMAIL HOSPITAL_BOOTSTRAP_ADMIN_USERNAME HOSPITAL_BOOTSTRAP_ADMIN_FIRST_NAME HOSPITAL_BOOTSTRAP_ADMIN_LAST_NAME"

umask 077

# ── Reporting ────────────────────────────────────────────────────────────────

# One key-value record: a 512-byte key and a 2048-byte value, zero-padded, the
# layout hv_kvp_daemon reads from the guest pool.
kvp_record() {
  printf '%s' "$1" | head -c 511
  head -c "$((512 - $(printf '%s' "$1" | head -c 511 | wc -c)))" /dev/zero
  printf '%s' "$2" | head -c 2047
  head -c "$((2048 - $(printf '%s' "$2" | head -c 2047 | wc -c)))" /dev/zero
}

# report STATE MESSAGE [URL]
report() {
  printf 'state=%s\nmessage=%s\nurl=%s\n' "$1" "$2" "${3:-}" > "$result_file.tmp"
  chmod 0644 "$result_file.tmp"
  mv "$result_file.tmp" "$result_file"
  printf '%s  %s: %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$1" "$2" >> "$log"
  kvp_directory="$(dirname "$kvp_pool")"
  if mkdir -p "$kvp_directory" 2>/dev/null; then
    {
      kvp_record LosporInstallState "$1"
      kvp_record LosporInstallMessage "$2"
      kvp_record LosporInstallUrl "${3:-}"
    } > "$kvp_pool.tmp" 2>/dev/null && cat "$kvp_pool.tmp" > "$kvp_pool" 2>/dev/null || true
    rm -f "$kvp_pool.tmp"
  fi
}

# Deleted, not just unlinked: these files held a password or a private key.
destroy() {
  for destroy_path do
    [ -e "$destroy_path" ] || continue
    shred -u "$destroy_path" 2>/dev/null || rm -f "$destroy_path"
  done
}

cleanup_runtime() { rm -rf "$runtime_dir"; }
trap cleanup_runtime EXIT HUP INT TERM

finish_attempt() {
  # One attempt from the wizard's answers. After it, the console takes over:
  # a stopped installation is resumed there, with the password typed again.
  if [ "${LOSPOR_FIRSTBOOT_TEST_ONLY:-0}" != 1 ] && command -v systemctl >/dev/null 2>&1; then
    systemctl disable firstboot-lospor.service >/dev/null 2>&1 || true
  fi
  if mountpoint -q "$release_mount" 2>/dev/null; then umount "$release_mount" 2>/dev/null || true; fi
}

stop() {
  report failed "$1"
  destroy "$state_dir/admin-password" "$state_dir/tls.pfx" "$state_dir/tls.pfx-password" \
    "$state_dir/tls-fullchain.pem" "$state_dir/tls-private.key" "$state_dir/tls-ca.pem"
  finish_attempt
  exit 1
}

install -d -m 0700 "$runtime_dir"
touch "$log"
chmod 0600 "$log"
report installing "Reading the installation answers."

# ── The answers ─────────────────────────────────────────────────────────────

answers="$state_dir/answers.env"
[ -f "$answers" ] && [ ! -L "$answers" ] || stop "The installation answers are missing. Install from the console: sudo sh $bootstrap"
[ "$(head -n 1 "$answers" | tr -d '\r')" = LOSPOR-HOSPITAL-INSTALL-ANSWERS-V1 ] \
  || stop "The installation answers are not in a format this server knows. Install from the console: sudo sh $bootstrap"

seen=" "
line_number=0
while IFS= read -r line || [ -n "$line" ]; do
  line_number=$((line_number + 1))
  [ "$line_number" -gt 1 ] || continue
  line="$(printf '%s' "$line" | tr -d '\r')"
  [ -n "$line" ] || continue
  key="${line%%=*}"
  value="${line#*=}"
  [ "$key" != "$line" ] || stop "Line $line_number of the installation answers is not KEY=value."
  case " $ANSWER_KEYS " in *" $key "*) ;; *) stop "The installation answers name an unknown setting: $key" ;; esac
  case "$seen" in *" $key "*) stop "The installation answers give $key twice." ;; esac
  case "$value" in *\'*|*\"*|*\\*|*\$*|*\`*) stop "The value of $key contains a character that is not allowed." ;; esac
  [ "${#value}" -le 256 ] || stop "The value of $key is too long."
  seen="$seen$key "
  export "$key=$value"
done < "$answers"
for key in $REQUIRED_KEYS; do
  case "$seen" in *" $key "*) ;; *) stop "The installation answers do not give $key." ;; esac
done
case "$LOSPOR_DEFAULT_LOCALE" in bg|en) ;; *) stop "LOSPOR_DEFAULT_LOCALE must be bg or en." ;; esac
case "$HOSPITAL_TLS_MODE" in operator|acme|local) ;; *) stop "HOSPITAL_TLS_MODE must be operator, acme or local." ;; esac
# Unset, the installer would fill in its example address rather than ask.
[ "$HOSPITAL_TLS_MODE" != acme ] || [ -n "${ACME_EMAIL:-}" ] || stop "A Let's Encrypt certificate needs an address for its notices."
if [ -n "${LOSPOR_RELEASE_VERSION:-}" ]; then
  printf '%s\n' "$LOSPOR_RELEASE_VERSION" | grep -Eq '^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$' \
    || stop "LOSPOR_RELEASE_VERSION is not a release version."
fi
clinical="$HOSPITAL_CLINICAL_DOMAIN"
[ -f "$state_dir/admin-password" ] && [ ! -L "$state_dir/admin-password" ] \
  || stop "The administrator password did not reach this server. Install from the console: sudo sh $bootstrap"

# ── The names must resolve before anything is consumed ──────────────────────
# The installer's readiness check refuses names that do not resolve. Waiting
# here keeps the answers usable: the attempt is repeated by starting this
# service again once DNS is right, without typing anything.
waited=0
while ! getent ahosts "$HOSPITAL_CLINICAL_DOMAIN" >/dev/null 2>&1 || ! getent ahosts "$HOSPITAL_RESEARCH_DOMAIN" >/dev/null 2>&1; do
  if [ "$waited" -ge "$dns_wait_seconds" ]; then
    report failed "The server cannot resolve $HOSPITAL_CLINICAL_DOMAIN and $HOSPITAL_RESEARCH_DOMAIN in DNS. Ask IT to add both names pointing to this server, then run on the console: sudo systemctl start firstboot-lospor"
    exit 1
  fi
  # The address is known only now that the VM has one, so it is said here:
  # this is when IT adds the two DNS records.
  address="$(hostname -I 2>/dev/null | awk '{ print $1 }')"
  [ "$waited" -gt 0 ] || report installing "Waiting for DNS: add $HOSPITAL_CLINICAL_DOMAIN and $HOSPITAL_RESEARCH_DOMAIN pointing to this server's address ${address:-(not known yet)}. Installation continues by itself once both resolve."
  sleep 15
  waited=$((waited + 15))
done

# ── Secrets: into memory or into place, and off the disk ────────────────────

cat "$state_dir/admin-password" > "$runtime_dir/admin-password"
destroy "$state_dir/admin-password"
[ -s "$runtime_dir/admin-password" ] || stop "The administrator password is empty."

tls_dir="$appliance_home/secrets/tls"
certificate_inputs_present=0
for input in tls.pfx tls-fullchain.pem tls-private.key; do
  [ ! -e "$state_dir/$input" ] || certificate_inputs_present=1
done

if [ "$HOSPITAL_TLS_MODE" = operator ]; then
  report installing "Placing the hospital certificate."
  install -d -m 0750 "$appliance_home"
  install -d -m 0700 "$appliance_home/secrets" "$tls_dir"
  if [ -f "$state_dir/tls.pfx" ]; then
    pfx_ok=0
    for legacy in "" -legacy; do
      # shellcheck disable=SC2086
      if openssl pkcs12 $legacy -in "$state_dir/tls.pfx" -passin "file:$state_dir/tls.pfx-password" \
          -nokeys -clcerts -out "$runtime_dir/leaf.pem" 2>/dev/null \
        && openssl pkcs12 $legacy -in "$state_dir/tls.pfx" -passin "file:$state_dir/tls.pfx-password" \
          -nocerts -nodes -out "$runtime_dir/key.pem" 2>/dev/null \
        && openssl pkcs12 $legacy -in "$state_dir/tls.pfx" -passin "file:$state_dir/tls.pfx-password" \
          -nokeys -cacerts -out "$runtime_dir/authorities.pem" 2>/dev/null; then
        pfx_ok=1
        break
      fi
    done
    [ "$pfx_ok" -eq 1 ] || stop "The .pfx certificate file could not be opened with its password."
    grep -q 'BEGIN CERTIFICATE' "$runtime_dir/leaf.pem" && grep -q 'PRIVATE KEY' "$runtime_dir/key.pem" \
      || stop "The .pfx file holds no server certificate with its private key."
    # The authorities inside the .pfx: intermediates go into the chain the
    # server presents, a self-signed root is what the appliance trusts.
    cp "$runtime_dir/leaf.pem" "$runtime_dir/fullchain.pem"
    : > "$runtime_dir/roots.pem"
    awk -v dir="$runtime_dir" '/-----BEGIN CERTIFICATE-----/ { n++; file = dir "/authority-" n ".pem" } file { print > file } /-----END CERTIFICATE-----/ { close(file); file = "" }' \
      "$runtime_dir/authorities.pem"
    for authority in "$runtime_dir"/authority-*.pem; do
      [ -f "$authority" ] || continue
      if [ "$(openssl x509 -in "$authority" -noout -subject_hash)" = "$(openssl x509 -in "$authority" -noout -issuer_hash)" ]; then
        cat "$authority" >> "$runtime_dir/roots.pem"
      else
        cat "$authority" >> "$runtime_dir/fullchain.pem"
      fi
    done
    if [ -s "$state_dir/tls-ca.pem" ]; then
      cp "$state_dir/tls-ca.pem" "$runtime_dir/roots.pem"
    fi
    [ -s "$runtime_dir/roots.pem" ] \
      || stop "The .pfx file does not include the hospital's authority certificate. Give its CA file in the wizard as well."
    install -m 0600 "$runtime_dir/fullchain.pem" "$tls_dir/fullchain.pem"
    install -m 0600 "$runtime_dir/key.pem" "$tls_dir/private.key"
    install -m 0644 "$runtime_dir/roots.pem" "$tls_dir/hospital-ca.pem"
  elif [ -f "$state_dir/tls-fullchain.pem" ] && [ -f "$state_dir/tls-private.key" ] && [ -f "$state_dir/tls-ca.pem" ]; then
    install -m 0600 "$state_dir/tls-fullchain.pem" "$tls_dir/fullchain.pem"
    install -m 0600 "$state_dir/tls-private.key" "$tls_dir/private.key"
    install -m 0644 "$state_dir/tls-ca.pem" "$tls_dir/hospital-ca.pem"
  else
    stop "The hospital certificate files did not reach this server."
  fi
  export HOSPITAL_TLS_VERIFY_CA="$tls_dir/hospital-ca.pem"
  rm -f "$runtime_dir"/leaf.pem "$runtime_dir"/authorit*.pem "$runtime_dir"/roots.pem "$runtime_dir"/fullchain.pem
  destroy "$runtime_dir/key.pem"
elif [ "$certificate_inputs_present" -eq 1 ]; then
  stop "Certificate files were given, but the certificate type is $HOSPITAL_TLS_MODE."
fi
destroy "$state_dir/tls.pfx" "$state_dir/tls.pfx-password" "$state_dir/tls-fullchain.pem" \
  "$state_dir/tls-private.key" "$state_dir/tls-ca.pem"

# ── Where the release comes from ────────────────────────────────────────────

set --
if [ "${LOSPOR_FIRSTBOOT_TEST_ONLY:-0}" = 1 ]; then
  [ ! -d "$release_mount" ] || set -- --media "$release_mount"
elif [ -e "/dev/disk/by-label/$release_label" ]; then
  install -d -m 0755 "$release_mount"
  mountpoint -q "$release_mount" || mount -o ro "/dev/disk/by-label/$release_label" "$release_mount" \
    || stop "The release disk the wizard attached could not be read."
  set -- --media "$release_mount"
fi
if [ "$#" -eq 2 ]; then
  export HOSPITAL_INSTALL_SUPPLY_MODE=offline
  [ -z "${LOSPOR_RELEASE_VERSION:-}" ] || set -- "$@" --version "$LOSPOR_RELEASE_VERSION"
else
  export HOSPITAL_INSTALL_SUPPLY_MODE=connected
  [ -z "${LOSPOR_RELEASE_VERSION:-}" ] || set -- --version "$LOSPOR_RELEASE_VERSION"
fi
unset LOSPOR_RELEASE_VERSION

# ── Install ─────────────────────────────────────────────────────────────────

report installing "Installing LOSPOR Hospital. This takes about 10 to 40 minutes."
[ -f "$bootstrap" ] || stop "The LOSPOR installer is missing from this server."
status=0
SUDO_USER="$console_user" HOSPITAL_BOOTSTRAP_ADMIN_PASSWORD_FILE="$runtime_dir/admin-password" \
  sh "$bootstrap" "$@" < /dev/null >> "$log" 2>&1 || status=$?
destroy "$runtime_dir/admin-password"

if [ "$status" -eq 0 ] && [ -e "$appliance_home/.data/installed-release.tsv" ]; then
  rm -rf "$state_dir"
  report installed "LOSPOR Hospital is installed. Open Go-live to finish getting ready for clinical use." "https://$clinical/status/go-live"
  finish_attempt
  exit 0
fi

# The installer says in plain words why it stopped; its last lines are that. It
# says everything in Bulgarian and English; the English lines are kept, so the
# reason reads the same wherever it is shown.
cyrillic="$(printf '[\320\321]')"
reason="$(sed 's/\x1b\[[0-9;]*[A-Za-z]//g' "$log" | grep -v '^[[:space:]]*$' | grep -v '^[0-9T:-]*Z  installing: ' \
  | LC_ALL=C grep -v "$cyrillic" | tail -n 4 | tr '\n' ' ' | tr -s ' ' | cut -c 1-1500)"
rm -rf "$state_dir"
# Run again, the installer itself says whether to resume what this attempt left
# or to start afresh; the password is typed again at the console.
report failed "The installation stopped: ${reason:-see $log} On the console, run it again: sudo sh $bootstrap"
finish_attempt
exit 1
