#!/bin/sh
set -eu

# Exercises losporctl-install.sh against locally built signed releases: the
# happy offline and online paths, a retry, and every way a release or the
# published fingerprint can be wrong. Every refusal must stop before the guided
# installer runs.

source_root="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd -P)"
work="$(mktemp -d)"
server_pid=""
cleanup() {
  [ -z "$server_pid" ] || kill "$server_pid" 2>/dev/null || true
  rm -rf "$work"
}
trap cleanup EXIT HUP INT TERM

tests=0
ok() { tests=$((tests + 1)); printf 'ok %s - %s\n' "$tests" "$1"; }
fail() { printf 'not ok - %s\n' "$1" >&2; [ ! -f "$work/out" ] || sed 's/^/    /' "$work/out" >&2; exit 1; }

version=9.9.9
prefix="lospor-hospital-$version"

openssl genpkey -algorithm ED25519 -out "$work/maintainer.key" 2>/dev/null
openssl pkey -in "$work/maintainer.key" -pubout -out "$work/maintainer.pub" 2>/dev/null
openssl genpkey -algorithm ED25519 -out "$work/attacker.key" 2>/dev/null
openssl pkey -in "$work/attacker.key" -pubout -out "$work/attacker.pub" 2>/dev/null
fingerprint_of() {
  printf 'SHA256:%s\n' "$(openssl pkey -pubin -in "$1" -outform DER | openssl dgst -sha256 -binary | openssl base64 | tr -d '\r\n=')"
}

# build_release <directory> [release-key.pem] [signing-key] [extra-archive-step]
build_release() {
  directory="$1"; release_pem="${2:-$work/maintainer.pub}"; signing_key="${3:-$work/maintainer.key}"; extra="${4:-}"
  rm -rf "$directory" "$work/tree"
  mkdir -p "$directory" "$work/tree/$prefix/scripts" "$work/tree/$prefix/infra/release-signing" "$work/tree/$prefix/secrets"
  : > "$work/tree/$prefix/secrets/.gitkeep"
  cp "$source_root/scripts/pin-release-signing-key.sh" "$source_root/scripts/installed-release-state.sh" \
    "$source_root/scripts/verify-release-signature.sh" "$source_root/scripts/release-dossier.py" "$work/tree/$prefix/scripts/"
  cp "$release_pem" "$work/tree/$prefix/infra/release-signing/release-signing-public.pem"
  cat > "$work/tree/$prefix/scripts/verify-release.sh" <<'STUB'
#!/bin/sh
printf '%s\n' "$4" > "$BOOTSTRAP_RECORD.verify-scope"
STUB
  cat > "$work/tree/$prefix/scripts/install-guided.sh" <<'STUB'
#!/bin/sh
root="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd -P)"
printf '%s\n%s\n%s\n' "$1" "$2" "$3" > "$BOOTSTRAP_RECORD"
[ -s "$root/.lospor-home/secrets/release-signing-public.pem" ] && printf 'pinned\n' >> "$BOOTSTRAP_RECORD"
[ -L "$root/secrets" ] && [ "$(readlink "$root/secrets")" = "$(readlink "$root/.lospor-home")/secrets" ] && printf 'secrets-linked\n' >> "$BOOTSTRAP_RECORD"
STUB
  [ -z "$extra" ] || eval "$extra"
  (cd "$work/tree" && tar -czf "$directory/$prefix-deployment.tar.gz" "$prefix")
  bytes="$(wc -c < "$directory/$prefix-deployment.tar.gz" | tr -d ' ')"
  sha="$(sha256sum "$directory/$prefix-deployment.tar.gz" | awk '{print $1}')"
  commit="$(printf 'c%.0s' $(seq 40))"
  image_lines=""
  image_arguments=""
  for image in api browser caddy curl-worker migrate postgres pwa status tools web; do
    digest="sha256:$(printf '%s' "$image" | sha256sum | awk '{print $1}')"
    image_lines="${image_lines}image	$image	ghcr.io/kaloyandjunow-prog/lospor-hospital-$image:$version	$digest
"
    image_arguments="$image_arguments --image $image ghcr.io/kaloyandjunow-prog/lospor-hospital-$image:$version $digest"
  done
  # The security evidence carries a release dossier for this release, unless a
  # case asks for another commit (DOSSIER_COMMIT) or none at all (DOSSIER_ABSENT).
  if [ "${DOSSIER_ABSENT:-0}" = 1 ]; then
    mkdir -p "$work/evidence-only/release-evidence"
    printf '{}\n' > "$work/evidence-only/release-evidence/risk-exceptions.json"
    (cd "$work/evidence-only" && tar -czf "$directory/$prefix-security-evidence.tar.gz" release-evidence)
  else
    # shellcheck disable=SC2086
    python3 "$source_root/scripts/release-dossier-fixture.py" "$directory/$prefix-security-evidence.tar.gz" \
      --version "$version" --commit "${DOSSIER_COMMIT:-$commit}" --run 4711 --attempt 1 \
      --deployment "$directory/$prefix-deployment.tar.gz" $image_arguments
  fi
  evidence_bytes="$(wc -c < "$directory/$prefix-security-evidence.tar.gz" | tr -d ' ')"
  evidence_sha="$(sha256sum "$directory/$prefix-security-evidence.tar.gz" | awk '{print $1}')"
  {
    printf 'LOSPOR-HOSPITAL-RELEASE-LOCK-V2\nrelease\t%s\thospital-%s\t%s\tlinux/amd64\t2026-09-13T00:00:00.000Z\t%s\nartifact\tdeployment\t000\t%s\t%s\t%s\n' \
      "$version" "$version" "$commit" "$(printf 'd%.0s' $(seq 64))" \
      "$prefix-deployment.tar.gz" "$bytes" "$sha"
    printf 'artifact\tsecurity-evidence\t000\t%s\t%s\t%s\n' "$prefix-security-evidence.tar.gz" "$evidence_bytes" "$evidence_sha"
    printf '%s' "$image_lines"
  } > "$directory/$prefix-release.lock"
  printf '%s  %s\n' "$(sha256sum "$directory/$prefix-release.lock" | awk '{print $1}')" "$prefix-release.lock" \
    > "$directory/$prefix-release.lock.sha256"
  openssl pkeyutl -sign -inkey "$signing_key" -rawin -in "$directory/$prefix-release.lock" \
    -out "$directory/$prefix-release.lock.sig"
  printf '{}\n' > "$directory/$prefix-manifest.json"
}

# The host's own Docker and systemd are not this test's: a machine with a real
# appliance on it would otherwise read as an unfinished installation. Cases
# about leftovers supply their own.
mkdir -p "$work/quiet-bin" "$work/no-systemd"
printf '#!/bin/sh\nexit 0\n' > "$work/quiet-bin/docker"
chmod +x "$work/quiet-bin/docker"
run_bootstrap() {
  rm -f "$work/record" "$work/record.verify-scope"
  env HOSPITAL_BOOTSTRAP_TEST_ONLY=1 LOSPOR_BOOTSTRAP_PUBLIC_KEY_FILE="$work/maintainer.pub" \
    LOSPOR_BOOTSTRAP_HOME="$work/home" BOOTSTRAP_RECORD="$work/record" \
    PATH="$work/quiet-bin:$PATH" LOSPOR_BOOTSTRAP_SYSTEMD_DIR="$work/no-systemd" \
    LOSPOR_BOOTSTRAP_LAUNCHER_DIR="$work/no-systemd" LOSPOR_BOOTSTRAP_HOST_CONFIG_DIR="$work/no-systemd/config" "$@" \
    sh "$source_root/scripts/losporctl-install.sh" $bootstrap_args > "$work/out" 2>&1
}
expect_refused() {
  description="$1"; message="$2"; shift 2
  if run_bootstrap "$@"; then fail "$description: the bootstrap succeeded"; fi
  [ ! -f "$work/record" ] || fail "$description: the guided installer ran"
  grep -Fq "$message" "$work/out" || fail "$description: expected message '$message' not shown"
  ok "$description"
}

media="$work/media"
bootstrap_args="--media $media"

# 1. Offline happy path.
build_release "$media"
run_bootstrap || fail "a valid offline release was refused"
[ "$(sed -n 1p "$work/record")" = "$media/$prefix-release.lock" ] || fail "the guided installer got the wrong lock"
grep -qx pinned "$work/record" || fail "the key was not pinned before the guided installer ran"
grep -qx secrets-linked "$work/record" || fail "the guided installer does not see the appliance's secrets, where a hospital certificate is placed"
[ "$(cat "$work/record.verify-scope")" = all ] || fail "offline verification did not check every payload"
grep -Fq "$(fingerprint_of "$work/maintainer.pub")" "$work/out" || fail "the offline fingerprint was not printed"
ok "a signed offline release installs with nothing to type and pins the key first"

# 2. An interrupted attempt is retried, not blocked.
touch "$work/home/bootstrap-$version/leftover"
run_bootstrap || fail "a retry after an interrupted attempt was refused"
[ ! -e "$work/home/bootstrap-$version/leftover" ] || fail "the previous extraction was not replaced"
ok "an interrupted attempt is replaced on retry"

# 3. An existing installation is never touched.
mkdir -p "$work/home/.data" && : > "$work/home/.data/installed-release.tsv"
expect_refused "an existing installation is refused" "already installed"
rm -rf "$work/home"

# 4-8. Signature and payload integrity.
build_release "$media"
printf 'image\textra\n' >> "$media/$prefix-release.lock"
expect_refused "a lock changed after signing is refused" "SIGNATURE DOES NOT VERIFY"

build_release "$media" "$work/maintainer.pub" "$work/attacker.key"
expect_refused "a release signed by another key is refused" "SIGNATURE DOES NOT VERIFY"

build_release "$media"
rm "$media/$prefix-release.lock.sig"
expect_refused "a missing signature is refused" "release file is missing"

build_release "$media"
printf '%s  %s\n' "$(printf '0%.0s' $(seq 64))" "$prefix-release.lock" > "$media/$prefix-release.lock.sha256"
expect_refused "a wrong sidecar is refused" "sidecar does not match"

build_release "$media"
printf 'x' >> "$media/$prefix-deployment.tar.gz"
expect_refused "a deployment archive changed after signing is refused" "does not match the signed release.lock"

# 9. Unsafe archive entries, even when correctly signed.
build_release "$media" "" "" 'ln -s /etc/passwd "$work/tree/$prefix/scripts/link"'
expect_refused "a signed archive containing a symlink is refused" "links or special files"

# 10. A release whose own key differs from the trusted one.
build_release "$media" "$work/attacker.pub"
expect_refused "a release carrying a different signing key is refused" "does not match the trusted key"
rm -rf "$work/home"

# 10b-10d. The release dossier: shown before installing, and it must describe
#          the signed release; a release from before dossiers still installs.
build_release "$media"
run_bootstrap || fail "a release with a valid dossier was refused"
grep -Fq "Vulnerabilities: 0 critical, 1 high; 1 accepted with a dated exception (first expires 2026-12-08)" "$work/out" \
  || fail "the release dossier was not shown before installing"
[ -s "$work/home/.data/runtime/update/state/release-dossier-$version.v1.json" ] || fail "the dossier was not projected for Status"
ok "the release dossier is shown before installing and kept for Status"
rm -rf "$work/home"

build_release "$media"
printf 'x' >> "$media/$prefix-security-evidence.tar.gz"
expect_refused "security evidence changed after signing is refused" "security evidence does not match the signed release.lock"
rm -rf "$work/home"

DOSSIER_COMMIT="$(printf 'e%.0s' $(seq 40))" build_release "$media"
expect_refused "a dossier describing another release is refused" "does not describe the signed release"
rm -rf "$work/home"

DOSSIER_ABSENT=1 build_release "$media"
run_bootstrap || fail "a release published before dossiers was refused"
grep -Fq "published before release dossiers were introduced" "$work/out" || fail "the missing dossier was not explained"
rm -rf "$work/home"
# A real 1.3.x release carries no dossier reader either (found installing 1.3.3).
DOSSIER_ABSENT=1 build_release "$media" "" "" "rm -f \"$work/tree/$prefix/scripts/release-dossier.py\""
run_bootstrap || fail "a release without the dossier reader was refused"
grep -Fq "published before release dossiers were introduced" "$work/out" || fail "the release without a dossier reader was not explained"
ok "a release published before dossiers installs, and says it has none"
rm -rf "$work/home"

# 10e-10l. What an unfinished first installation left: said plainly, then
#          continued with --resume or removed with --discard-unfinished.
mkdir -p "$work/fake-bin" "$work/systemd" "$work/launcher" "$work/host-config"
cat > "$work/fake-bin/docker" <<'FAKE'
#!/bin/sh
# Answers from files, records every removal, and forgets what it removed.
forget() { grep -vx "$2" "$FAKE_DOCKER/$1" > "$FAKE_DOCKER/$1.next" || true; mv "$FAKE_DOCKER/$1.next" "$FAKE_DOCKER/$1"; }
case "$1 $2" in
  "ps -aq") cat "$FAKE_DOCKER/containers" 2>/dev/null ;;
  "volume ls") cat "$FAKE_DOCKER/volumes" 2>/dev/null ;;
  "network ls") cat "$FAKE_DOCKER/networks" 2>/dev/null ;;
  "rm -f") printf '%s\n' "$*" >> "$FAKE_DOCKER/removed"; forget containers "$3" ;;
  "volume rm") printf '%s\n' "$*" >> "$FAKE_DOCKER/removed"; forget volumes "$3" ;;
  "network rm") printf '%s\n' "$*" >> "$FAKE_DOCKER/removed"; forget networks "$3" ;;
esac
exit 0
FAKE
printf '#!/bin/sh\nprintf "%%s\\n" "$*" >> "$FAKE_DOCKER/systemctl"\n' > "$work/fake-bin/systemctl"
chmod +x "$work/fake-bin/docker" "$work/fake-bin/systemctl"
leftover_run() {
  run_bootstrap PATH="$work/fake-bin:$PATH" FAKE_DOCKER="$work/docker-state" \
    LOSPOR_BOOTSTRAP_SYSTEMD_DIR="$work/systemd" LOSPOR_BOOTSTRAP_LAUNCHER_DIR="$work/launcher" \
    LOSPOR_BOOTSTRAP_HOST_CONFIG_DIR="$work/host-config" "$@"
}
# An attempt that got as far as activation: settings, secrets, a lock, the
# early current link, containers, volumes and host services.
make_unfinished() {
  rm -rf "$work/home" "$work/docker-state" "$work/systemd" "$work/launcher" "$work/host-config"
  mkdir -p "$work/home/secrets/api" "$work/home/.data/release-activation.lock" "$work/home/downloads/kept" \
    "$work/home/bootstrap-$version" "$work/docker-state" "$work/systemd" "$work/launcher" "$work/host-config"
  printf 'HOSPITAL_CLINICAL_DOMAIN=kept.test.invalid\n' > "$work/home/site.env"
  printf 'HOSPITAL_CLINICAL_DOMAIN=kept.test.invalid\n' > "$work/home/.env"
  printf 'POSTGRES_PASSWORD=kept\n' > "$work/home/secrets/appliance.env"
  printf 'key\n' > "$work/home/secrets/api/site-signing-private.pem"
  ln -s "$work/home/bootstrap-$version" "$work/home/current"
  printf 'c1\nc2\n' > "$work/docker-state/containers"
  printf 'lospor-hospital_postgres-data\n' > "$work/docker-state/volumes"
  printf 'n1\n' > "$work/docker-state/networks"
  : > "$work/systemd/lospor-update-agent.service"
  : > "$work/systemd/lospor-offhost-copy.timer"
  : > "$work/systemd/other-vendor.service"
  printf '#!/bin/sh\nexec /opt/lospor-hospital/current/scripts/losporctl.sh "$@"\n' > "$work/launcher/losporctl"
  : > "$work/host-config/update-agent.env"
}
build_release "$media" "" "" 'cat > "$work/tree/$prefix/scripts/recover-release-activation.sh" <<"STUB"
#!/bin/sh
root="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd -P)"
printf "%s\n" "$*" > "$BOOTSTRAP_RECORD.recover"
rm -rf "$root/.lospor-home/.data/release-activation.lock"
STUB'

make_unfinished
if leftover_run; then fail "an unfinished installation was installed over"; fi
[ ! -f "$work/record" ] || fail "the guided installer ran over an unfinished installation"
grep -Fq "An unfinished first installation was found" "$work/out" || fail "the unfinished installation was not named"
for said in "settings and generated secrets" "an activation that did not finish" "never activated" "2 containers" "1 data volumes" "2 system services" "--resume" "--discard-unfinished"; do
  grep -Fq -- "$said" "$work/out" || fail "the report did not say: $said"
done
[ -f "$work/home/site.env" ] && [ ! -s "$work/docker-state/removed" ] || fail "the report changed something"
ok "an unfinished installation is described, with both ways on, and nothing is touched"

make_unfinished
bootstrap_args="--media $media --resume"
leftover_run || fail "resuming an unfinished installation was refused"
[ -f "$work/record" ] || fail "the guided installer did not run on resume"
[ "$(cat "$work/record.recover" 2>/dev/null)" = "verify-and-clear --confirm-clear" ] || fail "the release's recovery did not clear the lock"
[ ! -e "$work/home/.data/release-activation.lock" ] || fail "the lock is still there"
[ ! -L "$work/home/current" ] || fail "the never-activated current link would stop activation"
[ "$(cat "$work/home/secrets/appliance.env")" = POSTGRES_PASSWORD=kept ] || fail "resume replaced the secrets the databases need"
[ ! -s "$work/docker-state/removed" ] || fail "resume removed containers or volumes"
ok "--resume keeps the settings and databases, and clears only what blocks activation"

make_unfinished
rm "$work/home/secrets/appliance.env" "$work/home/.env"
bootstrap_args="--media $media --resume"
if leftover_run; then fail "an attempt without its secrets was resumed"; fi
[ ! -f "$work/record" ] || fail "the guided installer ran for an attempt that cannot be continued"
grep -Fq "cannot be continued" "$work/out" || fail "why the attempt cannot continue was not said"
ok "--resume refuses an attempt whose secrets were never completed, pointing to discard"

make_unfinished
bootstrap_args="--discard-unfinished"
if leftover_run < /dev/null; then fail "a discard without a terminal or --yes went ahead"; fi
grep -Fq "Confirm with --yes" "$work/out" || fail "the missing confirmation was not explained"
[ -f "$work/home/site.env" ] && [ ! -s "$work/docker-state/removed" ] || fail "an unconfirmed discard removed something"
ok "--discard-unfinished needs a typed confirmation or --yes"

make_unfinished
bootstrap_args="--discard-unfinished --yes"
leftover_run || fail "a confirmed discard failed"
[ ! -f "$work/record" ] || fail "discarding ran the guided installer"
for gone in site.env .env secrets .data current "bootstrap-$version"; do
  [ ! -e "$work/home/$gone" ] && [ ! -L "$work/home/$gone" ] || fail "discard left $gone"
done
[ -d "$work/home/downloads/kept" ] || fail "discard removed the verified downloads"
for removed in "rm -f c1" "rm -f c2" "volume rm lospor-hospital_postgres-data" "network rm n1"; do
  grep -Fxq "$removed" "$work/docker-state/removed" || fail "discard did not run: docker $removed"
done
[ ! -e "$work/systemd/lospor-update-agent.service" ] && [ ! -e "$work/systemd/lospor-offhost-copy.timer" ] || fail "discard left LOSPOR services"
[ -e "$work/systemd/other-vendor.service" ] || fail "discard removed a service that is not LOSPOR's"
grep -Fxq "disable --now lospor-update-agent.service" "$work/docker-state/systemctl" || fail "a LOSPOR service was not stopped"
[ ! -e "$work/launcher/losporctl" ] && [ ! -e "$work/host-config" ] || fail "discard left the console command or host configuration"
ok "--discard-unfinished removes what the attempt left, and only that"

bootstrap_args="--media $media"
leftover_run || fail "a fresh install after discarding was refused"
[ -f "$work/record" ] || fail "the guided installer did not run after discarding"
ok "after discarding, the installation starts afresh"

make_unfinished
printf '#!/bin/sh\necho someone else\n' > "$work/launcher/losporctl"
: > "$work/home/.data/installed-release.tsv"
printf 'x\n' > "$work/home/.data/installed-release.tsv"
bootstrap_args="--discard-unfinished --yes"
if leftover_run; then fail "an installed appliance was discarded"; fi
grep -Fq "already installed" "$work/out" || fail "the installed appliance was not named"
[ -f "$work/home/site.env" ] && [ ! -s "$work/docker-state/removed" ] || fail "an installed appliance lost something"
ok "an installed appliance is never discarded"

make_unfinished
rmdir "$work/home/.data/release-activation.lock"
mkdir -p "$work/home/.data/release-activation.lock"
printf 'LOSPOR-HOSPITAL-ACTIVATION-JOURNAL-V1\t1\tMUTATION_STARTED\tunknown\t%s\n' "$$" \
  > "$work/home/.data/release-activation.lock/journal.v1.tsv"
bootstrap_args="--discard-unfinished --yes"
if leftover_run; then fail "an installation still running was discarded"; fi
grep -Fq "Another installation is running right now" "$work/out" || fail "the running installation was not named"
[ -f "$work/home/site.env" ] || fail "a running installation lost its settings"
ok "nothing is resumed or discarded while another installation runs"

bootstrap_args="--resume --discard-unfinished"
if leftover_run; then fail "--resume and --discard-unfinished together were accepted"; fi
grep -Fq "Usage:" "$work/out" || fail "conflicting options did not show the usage"
ok "--resume and --discard-unfinished cannot be combined"
rm -rf "$work/home"
bootstrap_args="--media $media"

# 11-13. Online: the lospor.org fingerprint is required and must match.
if command -v python3 >/dev/null 2>&1 && command -v curl >/dev/null 2>&1; then
  site="$work/site"
  download="$site/kaloyandjunow-prog/lospor-hospital/releases/download/hospital-$version"
  mkdir -p "$site/.well-known" "$site/repos/kaloyandjunow-prog/lospor-hospital/releases"
  build_release "$download"
  fingerprint_of "$work/maintainer.pub" > "$site/.well-known/lospor-release-key.txt"
  printf '{"tag_name": "hospital-%s", "draft": false}\n' "$version" \
    > "$site/repos/kaloyandjunow-prog/lospor-hospital/releases/latest"
  port="$(python3 -c 'import socket; s=socket.socket(); s.bind(("127.0.0.1",0)); print(s.getsockname()[1]); s.close()')"
  python3 -m http.server "$port" --bind 127.0.0.1 --directory "$site" >/dev/null 2>&1 &
  server_pid=$!
  origin="http://127.0.0.1:$port"
  attempts=0
  until curl -fsS "$origin/.well-known/lospor-release-key.txt" >/dev/null 2>&1; do
    attempts=$((attempts + 1)); [ "$attempts" -lt 50 ] || fail "the local release server did not start"; sleep 0.1
  done
  bootstrap_args=""
  online() {
    run_bootstrap LOSPOR_BOOTSTRAP_KEY_URL="${key_url_override:-$origin/.well-known/lospor-release-key.txt}" \
      LOSPOR_BOOTSTRAP_API_ORIGIN="$origin" LOSPOR_BOOTSTRAP_DOWNLOAD_ORIGIN="$origin"
  }

  online || fail "a valid online release was refused"
  [ "$(sed -n 1p "$work/record")" = "$work/home/downloads/$prefix/$prefix-release.lock" ] \
    || fail "the online install did not use the downloaded, verified lock"
  [ "$(cat "$work/record.verify-scope")" = deployment ] || fail "online verification used the wrong scope"
  ok "an online install finds the latest release, confirms the published key, and verifies it"
  rm -rf "$work/home"

  fingerprint_of "$work/attacker.pub" > "$site/.well-known/lospor-release-key.txt"
  if online; then fail "a mismatched published fingerprint was accepted"; fi
  [ ! -f "$work/record" ] || fail "the guided installer ran despite a mismatched published fingerprint"
  grep -Fq "DOES NOT MATCH THE ONE PUBLISHED" "$work/out" || fail "the fingerprint mismatch was not named"
  [ ! -d "$work/home/downloads" ] || fail "release files were downloaded before the key was confirmed"
  ok "a different fingerprint at lospor.org stops the install before any download"

  key_url_override="http://127.0.0.1:1/.well-known/lospor-release-key.txt"
  if online; then fail "an unreachable lospor.org was accepted"; fi
  [ ! -f "$work/record" ] || fail "the guided installer ran without a confirmed key"
  grep -Fq "lospor.org is unreachable" "$work/out" || fail "the unreachable key source was not named"
  ok "an unreachable lospor.org stops the install instead of trusting GitHub alone"
else
  printf '# skipped online cases: python3 and curl are required\n'
fi

echo "losporctl-install tests passed ($tests)"
