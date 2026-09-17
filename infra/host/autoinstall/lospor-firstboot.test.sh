#!/bin/sh
set -eu

# The first boot of a server made by the Windows wizard, with a stand-in for the
# LOSPOR installer: the answers become exactly the installer's settings, the
# password and the certificate leave the disk, a hospital .pfx becomes the files
# the appliance serves and trusts, and every outcome is reported to Hyper-V.

root="$(CDPATH= cd -- "$(dirname "$0")/../../.." && pwd -P)"
script="$root/infra/host/autoinstall/lospor-firstboot.sh"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT HUP INT TERM
tests=0
ok() { tests=$((tests + 1)); printf 'ok %s - %s\n' "$tests" "$1"; }
fail() { printf 'FAIL: %s\n' "$1" >&2; [ ! -f "$work/out" ] || sed 's/^/    /' "$work/out" >&2; exit 1; }

state="$work/state"; home="$work/home"; runtime="$work/run"
kvp="$work/hyperv/.kvp_pool_1"; result="$work/result"; log="$work/firstboot.log"

# The stand-in installer records what it was given, and installs when asked to.
cat > "$work/installer.sh" <<'STUB'
#!/bin/sh
env | grep -E '^(LOSPOR_|HOSPITAL_|ACME_EMAIL|SUDO_USER)' | sort > "$FIRSTBOOT_RECORD.env"
printf '%s\n' "$*" > "$FIRSTBOOT_RECORD.args"
cat "$HOSPITAL_BOOTSTRAP_ADMIN_PASSWORD_FILE" > "$FIRSTBOOT_RECORD.password"
rm -f "$HOSPITAL_BOOTSTRAP_ADMIN_PASSWORD_FILE"
if [ "${STUB_INSTALL_FAILS:-0}" = 1 ]; then
  echo "Готовност: сървърът изисква поне 200 GiB свободно място" >&2
  echo "Readiness: the server needs at least 200 GiB free" >&2
  echo "Спрете." >&2
  exit 1
fi
mkdir -p "$LOSPOR_FIRSTBOOT_HOME/.data"
: > "$LOSPOR_FIRSTBOOT_HOME/.data/installed-release.tsv"
STUB

answers() {
  rm -rf "$state" "$home" "$runtime" "$work/hyperv" "$result" "$log" "$work/record".* "$work/release"
  mkdir -p "$state"
  {
    printf 'LOSPOR-HOSPITAL-INSTALL-ANSWERS-V1\n'
    printf 'LOSPOR_DEFAULT_LOCALE=bg\n'
    printf 'HOSPITAL_CLINICAL_DOMAIN=localhost\n'
    printf 'HOSPITAL_RESEARCH_DOMAIN=localhost\n'
    printf 'HOSPITAL_TLS_MODE=%s\n' "${1:-local}"
    printf 'HOSPITAL_INSTITUTION_NAME=УМБАЛ Света Анна\n'
    printf 'HOSPITAL_INSTITUTION_CITY=София\n'
    printf 'HOSPITAL_BOOTSTRAP_ADMIN_EMAIL=it@hospital.test\n'
    printf 'HOSPITAL_BOOTSTRAP_ADMIN_USERNAME=it.admin\n'
    printf 'HOSPITAL_BOOTSTRAP_ADMIN_FIRST_NAME=Иван\n'
    printf 'HOSPITAL_BOOTSTRAP_ADMIN_LAST_NAME=Петров\n'
    printf 'LOSPOR_RELEASE_VERSION=1.4.0\n'
  } > "$state/answers.env"
  printf 'Admin password phrase 1!\n' > "$state/admin-password"
}
run() {
  env LOSPOR_FIRSTBOOT_TEST_ONLY=1 LOSPOR_FIRSTBOOT_STATE_DIR="$state" LOSPOR_FIRSTBOOT_RESULT_FILE="$result" \
    LOSPOR_FIRSTBOOT_RUNTIME_DIR="$runtime" LOSPOR_FIRSTBOOT_HOME="$home" LOSPOR_FIRSTBOOT_BOOTSTRAP="$work/installer.sh" \
    LOSPOR_FIRSTBOOT_RELEASE_MOUNT="$work/release" LOSPOR_FIRSTBOOT_KVP_POOL="$kvp" LOSPOR_FIRSTBOOT_LOG="$log" \
    FIRSTBOOT_RECORD="$work/record" "$@" sh "$script" > "$work/out" 2>&1
}
# The value of one key in the Hyper-V pool: 512-byte key, 2048-byte value.
kvp_value() {
  python3 - "$kvp" "$1" <<'PY'
import sys
data = open(sys.argv[1], "rb").read()
for offset in range(0, len(data), 2560):
    key = data[offset:offset + 512].split(b"\0")[0].decode()
    if key == sys.argv[2]:
        print(data[offset + 512:offset + 2560].split(b"\0")[0].decode())
PY
}

# 1. The answers become the installer's settings, and the password leaves the disk.
answers local
run || fail "a valid first boot failed"
grep -qx 'HOSPITAL_INSTITUTION_NAME=УМБАЛ Света Анна' "$work/record.env" || fail "a Cyrillic answer did not reach the installer as typed"
grep -qx 'HOSPITAL_INSTALL_SUPPLY_MODE=connected' "$work/record.env" || fail "without a release disk the install is not online"
grep -qx "SUDO_USER=$(id -un)" "$work/record.env" || fail "the installation is not owned by the console user"
! grep -q '^LOSPOR_RELEASE_VERSION=' "$work/record.env" || fail "the kit's version leaked into the installer's settings"
[ "$(cat "$work/record.args")" = "--version 1.4.0" ] || fail "the install is not pinned to the wizard's release"
[ "$(cat "$work/record.password")" = "Admin password phrase 1!" ] || fail "the password did not reach the installer"
! grep -rq "Admin password phrase" "$work/state" "$work/run" "$log" "$result" 2>/dev/null || fail "the password is left on disk or in the log"
[ ! -e "$state" ] || fail "the answers were kept after installing"
[ "$(kvp_value LosporInstallState)" = installed ] || fail "Hyper-V was not told the installation finished"
[ "$(kvp_value LosporInstallUrl)" = https://localhost/status/go-live ] || fail "Hyper-V was not given the Go-live address"
grep -qx 'state=installed' "$result" || fail "the console result was not written"
ok "the answers become the installer's settings, the password leaves the disk, and Hyper-V hears it finished"

# 2. A release disk makes the install offline.
answers local
mkdir -p "$work/release"
run || fail "an offline first boot failed"
grep -qx 'HOSPITAL_INSTALL_SUPPLY_MODE=offline' "$work/record.env" || fail "a release disk did not make the install offline"
[ "$(cat "$work/record.args")" = "--media $work/release --version 1.4.0" ] || fail "the installer was not pointed at the release disk"
ok "a release disk makes the install offline, from that disk"

# 3. Answers that are not plain settings are refused, and nothing is installed.
for bad in 'HOSPITAL_TLS_MODE=local\nPATH=/tmp' 'HOSPITAL_INSTITUTION_NAME=$(reboot)' 'HOSPITAL_INSTITUTION_CITY=a"b' 'HOSPITAL_BOOTSTRAP_ADMIN_EMAIL=x@y.test'; do
  answers local
  printf "$bad\n" >> "$state/answers.env"
  if run; then fail "answers with '$bad' were accepted"; fi
  [ ! -e "$work/record.env" ] || fail "the installer ran with '$bad'"
  [ "$(kvp_value LosporInstallState)" = failed ] || fail "a refusal was not reported to Hyper-V"
  [ ! -e "$state/admin-password" ] || fail "a refused attempt left the password on disk"
done
answers acme
if run; then fail "a Let's Encrypt install without a notice address was accepted"; fi
ok "an unknown, repeated or unsafe answer, or a missing notice address, is refused before installing"

# 4. A name that does not resolve is reported, and the answers stay for a retry.
answers local
sed -i 's/^HOSPITAL_CLINICAL_DOMAIN=.*/HOSPITAL_CLINICAL_DOMAIN=lospor.invalid/' "$state/answers.env"
if run; then fail "an unresolvable name was accepted"; fi
[ ! -e "$work/record.env" ] || fail "the installer ran before DNS was right"
kvp_value LosporInstallMessage | grep -q 'lospor.invalid' || fail "the unresolved name was not named"
[ -f "$state/admin-password" ] && [ -f "$state/answers.env" ] || fail "the answers were consumed, so a retry would need the wizard again"
ok "a name DNS does not resolve is named, and the answers stay for a retry"

# 5. A failed installation says why, and how to continue.
answers local
if run STUB_INSTALL_FAILS=1; then fail "a failed installation was reported as success"; fi
message="$(kvp_value LosporInstallMessage)"
printf '%s\n' "$message" | grep -q '200 GiB free' || fail "the reason was not reported: $message"
! printf '%s\n' "$message" | grep -q 'Спрете' || fail "the reason mixes in the installer's Bulgarian lines: $message"
printf '%s\n' "$message" | grep -q 'run it again: sudo sh ' || fail "the way to continue was not reported"
[ "$(kvp_value LosporInstallState)" = failed ] || fail "the failure was not reported as failed"
[ ! -e "$runtime/admin-password" ] && [ ! -e "$state" ] || fail "a failed attempt left the password or answers behind"
ok "a failed installation reports its reason and how to run it again"

# 6. A hospital .pfx becomes the served chain, the private key and the trusted authority.
command -v openssl >/dev/null 2>&1 || { printf 'firstboot tests passed (%s; .pfx skipped: no openssl)\n' "$tests"; exit 0; }
pki="$work/pki"; mkdir -p "$pki"
openssl req -x509 -newkey rsa:2048 -nodes -days 30 -subj "/CN=Test Hospital Root" -keyout "$pki/root.key" -out "$pki/root.pem" 2>/dev/null
openssl req -newkey rsa:2048 -nodes -subj "/CN=Test Hospital Issuing" -keyout "$pki/issuing.key" -out "$pki/issuing.csr" 2>/dev/null
printf 'basicConstraints=critical,CA:TRUE\n' > "$pki/ca.ext"
openssl x509 -req -in "$pki/issuing.csr" -CA "$pki/root.pem" -CAkey "$pki/root.key" -CAcreateserial -days 30 -extfile "$pki/ca.ext" -out "$pki/issuing.pem" 2>/dev/null
openssl req -newkey rsa:2048 -nodes -subj "/CN=localhost" -keyout "$pki/server.key" -out "$pki/server.csr" 2>/dev/null
printf 'subjectAltName=DNS:localhost\n' > "$pki/server.ext"
openssl x509 -req -in "$pki/server.csr" -CA "$pki/issuing.pem" -CAkey "$pki/issuing.key" -CAcreateserial -days 30 -extfile "$pki/server.ext" -out "$pki/server.pem" 2>/dev/null
cat "$pki/issuing.pem" "$pki/root.pem" > "$pki/authorities.pem"
openssl pkcs12 -export -inkey "$pki/server.key" -in "$pki/server.pem" -certfile "$pki/authorities.pem" -passout pass:pfx-secret -out "$pki/hospital.pfx" 2>/dev/null

answers operator
cp "$pki/hospital.pfx" "$state/tls.pfx"
printf 'pfx-secret' > "$state/tls.pfx-password"
run || fail "an install with a hospital .pfx failed"
tls="$home/secrets/tls"
[ "$(openssl x509 -in "$tls/fullchain.pem" -noout -subject | sed 's/.*CN *= *//')" = localhost ] || fail "the served chain does not start with the server certificate"
grep -c 'BEGIN CERTIFICATE' "$tls/fullchain.pem" | grep -qx 2 || fail "the served chain is not the server certificate and its issuing authority"
[ "$(openssl x509 -in "$tls/hospital-ca.pem" -noout -subject | sed 's/.*CN *= *//')" = "Test Hospital Root" ] || fail "the trusted authority is not the root"
openssl verify -CAfile "$tls/hospital-ca.pem" -untrusted "$tls/fullchain.pem" "$tls/fullchain.pem" >/dev/null 2>&1 || fail "the placed files do not form a valid chain"
[ "$(openssl pkey -in "$tls/private.key" -pubout | openssl sha256)" = "$(openssl x509 -in "$tls/fullchain.pem" -pubkey -noout | openssl sha256)" ] \
  || fail "the private key does not match the certificate"
[ "$(stat -c %a "$tls/private.key")" = 600 ] || fail "the private key is readable by others"
grep -qx "HOSPITAL_TLS_VERIFY_CA=$tls/hospital-ca.pem" "$work/record.env" || fail "the installer does not trust the hospital authority"
for gone in "$state/tls.pfx" "$state/tls.pfx-password" "$runtime/key.pem"; do [ ! -e "$gone" ] || fail "$gone was left behind"; done
answers operator
cp "$pki/hospital.pfx" "$state/tls.pfx"
printf 'wrong' > "$state/tls.pfx-password"
if run; then fail "a .pfx with the wrong password was accepted"; fi
kvp_value LosporInstallMessage | grep -q 'could not be opened' || fail "a wrong .pfx password was not explained"
[ ! -e "$state/tls.pfx" ] && [ ! -e "$state/admin-password" ] || fail "a refused .pfx left secrets on disk"
ok "a hospital .pfx becomes the served chain, the key and the trusted root, and leaves the disk"

printf 'firstboot tests passed (%s)\n' "$tests"
