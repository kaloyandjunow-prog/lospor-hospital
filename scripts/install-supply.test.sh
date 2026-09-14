#!/bin/sh
set -eu

root="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"
. "$root/scripts/install-supply-lib.sh"

tests=0
assert_equal() {
  label="$1"; expected="$2"; actual="$3"
  [ "$actual" = "$expected" ] || {
    echo "FAIL: $label (expected $expected, got $actual)" >&2
    exit 1
  }
  tests=$((tests + 1)); printf 'ok %s - %s\n' "$tests" "$label"
}
expect_true() {
  label="$1"; shift
  "$@" || { echo "FAIL: $label" >&2; exit 1; }
  tests=$((tests + 1)); printf 'ok %s - %s\n' "$tests" "$label"
}
expect_false() {
  label="$1"; shift
  if "$@"; then echo "FAIL: $label" >&2; exit 1; fi
  tests=$((tests + 1)); printf 'ok %s - %s\n' "$tests" "$label"
}

assert_equal "resolved build model selects source mode" source \
  "$(install_detect_supply '{"services":{"api":{"build":{"context":"."}}}}')"
assert_equal "build-free resolved model selects release mode" verified-release \
  "$(install_detect_supply '{"services":{"api":{"image":"registry/api:1.0.0"}}}')"
expect_true "source mode runs without a release-verification assertion" \
  install_supply_authorized source ""
expect_false "source mode rejects a misleading verification assertion" \
  install_supply_authorized source 1
expect_false "release mode fails closed without prior verification" \
  install_supply_authorized verified-release ""
expect_false "release mode rejects an arbitrary truthy value" \
  install_supply_authorized verified-release true
expect_true "release mode accepts only the verifier's exact assertion" \
  install_supply_authorized verified-release 1

if sh "$root/scripts/container-node.sh" scripts/not-approved.mjs >/dev/null 2>&1; then
  echo "FAIL: container helper accepted an unapproved script" >&2
  exit 1
fi
tests=$((tests + 1)); printf 'ok %s - container helper rejects arbitrary scripts\n' "$tests"

if grep -E '(^|[|;&])[[:space:]]*node[[:space:]]+scripts/' \
    "$root/scripts/install.sh" \
    "$root/scripts/appliance-operator.sh" \
    "$root/scripts/enroll-central.sh" >/dev/null; then
  echo "FAIL: a client operation still requires host Node.js" >&2
  exit 1
fi
tests=$((tests + 1)); printf 'ok %s - client credential operations have no host Node.js call\n' "$tests"

if grep -E '^[[:space:]]*\./scripts/verify-loaded-release-images\.sh' \
    "$root/scripts/install.sh" \
    "$root/scripts/update.sh" >/dev/null; then
  echo "FAIL: packaged install or update directly executes a non-executable verifier" >&2
  exit 1
fi
tests=$((tests + 1)); printf 'ok %s - packaged image verification is invoked through sh\n' "$tests"

assert_order() {
  file="$1"; shift
  prior=0
  for pattern in "$@"; do
    matches="$(grep -nF "$pattern" "$file" || true)"
    [ -n "$matches" ] && [ "$(printf '%s\n' "$matches" | wc -l | tr -d '[:space:]')" = 1 ] || {
      echo "FAIL: $(basename "$file") must contain exactly one '$pattern'" >&2
      exit 1
    }
    line="${matches%%:*}"
    [ "$line" -gt "$prior" ] || {
      echo "FAIL: $(basename "$file") runs '$pattern' out of order" >&2
      exit 1
    }
    prior="$line"
  done
}

grep -Fq 'docker compose --profile tools pull --ignore-buildable </dev/null' "$root/scripts/install.sh" \
  || { echo "FAIL: source pull can consume installer stdin" >&2; exit 1; }
grep -Fq 'docker compose --profile tools build </dev/null' "$root/scripts/install.sh" \
  || { echo "FAIL: source build can consume installer stdin" >&2; exit 1; }
tests=$((tests + 1)); printf 'ok %s - source image operations cannot consume the password stream\n' "$tests"

assert_order "$root/scripts/install.sh" \
  'if [ ! -t 0 ]; then' \
  'docker compose --profile tools build </dev/null' \
  'docker compose up -d postgres' \
  'sh scripts/postgres-update-gate.sh preflight' \
  'docker compose run --rm --interactive=false -T migrate' \
  'sh scripts/postgres-update-gate.sh postflight'
assert_order "$root/scripts/update.sh" \
  'docker compose up -d postgres' \
  'sh scripts/postgres-update-gate.sh preflight' \
  'docker compose run --rm -T migrate' \
  'sh scripts/postgres-update-gate.sh postflight'
assert_order "$root/scripts/restore-backup.sh" \
  'restore_tool verify "$artifact_container"' \
  'restore_tool temporary "$artifact_container" "$temporary_database"' \
  'restore_tool validate "$artifact_container" "$temporary_database"' \
  'journal QUIESCE PASSED' \
  'restore_tool switch "$artifact_container" "$temporary_database" "$previous_database"' \
  'sh scripts/postgres-update-gate.sh postflight'
tests=$((tests + 1)); printf 'ok %s - install/update gate PostgreSQL and restore validates before its emergency switch\n' "$tests"

gate_fixture="$(mktemp -d "${TMPDIR:-/tmp}/lospor-postgres-gate-test.XXXXXX")"
trap 'rm -rf "$gate_fixture"' EXIT HUP INT TERM
mkdir "$gate_fixture/bin"
printf '%s\n' \
  '#!/bin/sh' \
  'case " $* " in' \
  '  *" pg_isready "*)' \
  '    case " $* " in *" --host=127.0.0.1 "*) ;; *) exit 98 ;; esac' \
  '    count=0' \
  '    if [ -s "$LOSPOR_POSTGRES_GATE_TEST_STATE" ]; then IFS= read -r count < "$LOSPOR_POSTGRES_GATE_TEST_STATE"; fi' \
  '    count=$((count + 1))' \
  '    printf "%s\\n" "$count" > "$LOSPOR_POSTGRES_GATE_TEST_STATE"' \
  '    printf "ready-tcp:%s\\n" "$count" >> "$LOSPOR_POSTGRES_GATE_TEST_EVENTS"' \
  '    [ "$count" -ge "$LOSPOR_POSTGRES_GATE_TEST_READY_AFTER" ]' \
  '    ;;' \
  '  *" psql "*" --command=SELECT 1 "*)' \
  '    printf "probe\\n" >> "$LOSPOR_POSTGRES_GATE_TEST_EVENTS"' \
  '    printf "1\\n"' \
  '    ;;' \
  '  *" psql "*)' \
  '    printf "psql\\n" >> "$LOSPOR_POSTGRES_GATE_TEST_EVENTS"' \
  '    while IFS= read -r _line; do :; done' \
  '    ;;' \
  '  *) exit 99 ;;' \
  'esac' > "$gate_fixture/bin/docker"
printf '%s\n' \
  '#!/bin/sh' \
  'printf "sleep:%s\\n" "$1" >> "$LOSPOR_POSTGRES_GATE_TEST_EVENTS"' \
  > "$gate_fixture/bin/sleep"
chmod +x "$gate_fixture/bin/docker" "$gate_fixture/bin/sleep"

gate_state="$gate_fixture/state"
gate_events="$gate_fixture/events"
: > "$gate_events"
PATH="$gate_fixture/bin:$PATH" \
LOSPOR_POSTGRES_GATE_TEST_STATE="$gate_state" \
LOSPOR_POSTGRES_GATE_TEST_EVENTS="$gate_events" \
LOSPOR_POSTGRES_GATE_TEST_READY_AFTER=3 \
LOSPOR_POSTGRES_GATE_READY_ATTEMPTS=4 \
LOSPOR_POSTGRES_GATE_READY_INTERVAL_SECONDS=0 \
  sh "$root/scripts/postgres-update-gate.sh" preflight >/dev/null
assert_equal "PostgreSQL gate waits until readiness before psql" \
  'ready-tcp:1,sleep:0,ready-tcp:2,sleep:0,ready-tcp:3,probe,psql' \
  "$(tr '\n' ',' < "$gate_events" | sed 's/,$//')"

rm -f "$gate_state"
: > "$gate_events"
if PATH="$gate_fixture/bin:$PATH" \
  LOSPOR_POSTGRES_GATE_TEST_STATE="$gate_state" \
  LOSPOR_POSTGRES_GATE_TEST_EVENTS="$gate_events" \
  LOSPOR_POSTGRES_GATE_TEST_READY_AFTER=99 \
  LOSPOR_POSTGRES_GATE_READY_ATTEMPTS=3 \
  LOSPOR_POSTGRES_GATE_READY_INTERVAL_SECONDS=0 \
    sh "$root/scripts/postgres-update-gate.sh" preflight >/dev/null 2>&1; then
  echo "FAIL: PostgreSQL gate accepted an unready database" >&2
  exit 1
fi
assert_equal "PostgreSQL gate times out without running psql" \
  'ready-tcp:1,sleep:0,ready-tcp:2,sleep:0,ready-tcp:3' \
  "$(tr '\n' ',' < "$gate_events" | sed 's/,$//')"


# A clinician cannot code a diagnosis unless Icd10Code has rows, and
# /v1/search/icd10 reads that table and nothing else -- unlike its siblings,
# which serve or fall back to a bundled file. The appliance ships all 16,175
# codes inside vendored Core and 1.1.0 never put them in the database, so the
# diagnosis field returned nothing on every appliance ever installed.
#
# Both paths must seed. Install covers new sites; update covers every site
# already running, which today is all of them.
for script in install update; do
  grep -Fq './node_modules/.bin/tsx scripts/seed-icd10-from-bundle.ts' \
    "$root/scripts/$script.sh" \
    || { echo "FAIL: $script.sh does not seed the ICD-10 bundle" >&2; exit 1; }
done
# After migrations, or the table it writes to may not exist yet.
assert_order "$root/scripts/install.sh" \
  'docker compose run --rm --interactive=false -T migrate' \
  './node_modules/.bin/tsx scripts/seed-icd10-from-bundle.ts'
assert_order "$root/scripts/update.sh" \
  'docker compose run --rm -T migrate' \
  './node_modules/.bin/tsx scripts/seed-icd10-from-bundle.ts'
tests=$((tests + 1)); printf 'ok %s - install and update seed ICD-10 after migrating\n' "$tests"

# A release's new options (a route, a premedication) reached only new installs
# while update skipped this seed. The concept-map seed reads the active options
# and lab codes, so it runs after both, and only where terminology is active.
assert_order "$root/scripts/update.sh" \
  'docker compose run --rm -T migrate' \
  './node_modules/.bin/tsx scripts/seed-option-library.ts' \
  './node_modules/.bin/tsx scripts/seed-lab-loinc.ts' \
  'if [ ! -s "$terminology_state/active.tsv" ]; then' \
  'elif [ -d "$terminology_state/import.lock" ]; then' \
  './node_modules/.bin/tsx scripts/seed-concept-maps.ts' \
  'docker compose up -d status'
# Lab LOINC codes and units are release data: without them every result left
# for the OMOP export and Central with no LOINC code and no unit.
assert_order "$root/scripts/install.sh" \
  './node_modules/.bin/tsx scripts/seed-option-library.ts' \
  './node_modules/.bin/tsx scripts/seed-lab-loinc.ts' \
  'scripts/provision-bundled-clinical-baselines.ts --apply'
# The option seed must stop the update like any other step; the research-link
# refresh must not, because the links it would replace are still valid.
awk '/scripts\/seed-option-library.ts/ { getline next_line; if (next_line ~ /\|\||; then|&&/) bad = 1 } END { exit bad }' \
  "$root/scripts/update.sh" \
  || { echo "FAIL: update.sh lets the option library seed fail silently" >&2; exit 1; }
grep -Fq 'Research links were not refreshed; the previous ones stay in use.' "$root/scripts/update.sh" \
  || { echo "FAIL: update.sh does not report a failed research-link refresh" >&2; exit 1; }
tests=$((tests + 1)); printf 'ok %s - update refreshes option lists always and research links only after a terminology import\n' "$tests"

grep -Fq 'docker compose up -d --wait --wait-timeout 300' "$root/scripts/install.sh" \
  || { echo "FAIL: install does not bound final health readiness" >&2; exit 1; }
assert_order "$root/scripts/install.sh" \
  'docker compose up -d --wait --wait-timeout 300' \
  './scripts/backup-now.sh' \
  'sh ./scripts/install-update-agent.sh' \
  'sh ./scripts/doctor.sh --install' \
  'operator_say "Installation complete."'
tests=$((tests + 1)); printf 'ok %s - install proves health, backup, update authority and doctor before success\n' "$tests"

grep -Fq 'scripts/configure-hospital-external-ai.ts' "$root/scripts/install.sh" \
  && grep -Fq 'printf '\''%s'\'' "${HOSPITAL_BOOTSTRAP_EXTERNAL_AI_KEY:-}"' "$root/scripts/install.sh" \
  && ! grep -Eq -- '-e[[:space:]]+HOSPITAL_BOOTSTRAP_EXTERNAL_AI_KEY' "$root/scripts/install.sh" \
  || { echo "FAIL: install does not keep the optional external-AI credential on stdin only" >&2; exit 1; }
assert_order "$root/scripts/install.sh" \
  'scripts/bootstrap-hospital-admin.ts' \
  'scripts/configure-hospital-external-ai.ts' \
  'scripts/seed-option-library.ts'
tests=$((tests + 1)); printf 'ok %s - install seals the optional external-AI credential through stdin only\n' "$tests"


# Both supply paths must check the release signing key, and must check it before
# they touch anything.
#
# Refusing a changed key is the whole value of pinning. A release able to install
# its own signing key would authenticate every release after it, and the
# appliance would be cryptographically certain it was being updated by whoever
# compromised it. Install alone is not enough -- install is where a key is
# adopted, update is where a swapped one has to be caught, and it is the update
# path that runs unattended.
for script in install update; do
  grep -Fq 'sh scripts/pin-release-signing-key.sh "$release_signing_key"' \
    "$root/scripts/$script.sh" \
    || { echo "FAIL: $script.sh does not check the release signing key" >&2; exit 1; }
done
# Ahead of the first thing each script changes, so a site sent the wrong key
# finds out before a multi-minute pg_dump and before any container is replaced,
# not after.
assert_order "$root/scripts/install.sh" \
  'sh scripts/pin-release-signing-key.sh "$release_signing_key"' \
  'docker compose run --rm --interactive=false -T runtime-secrets-init'
assert_order "$root/scripts/update.sh" \
  'sh scripts/pin-release-signing-key.sh "$release_signing_key"' \
  './scripts/backup-now.sh'
# Exit 3 is "this site has not adopted pinning" and must not stop an install.
# Collapsing it into the refusal would either break every site still using a
# per-release digest, or teach an operator that a key warning is something
# installs print.
for script in install update; do
  grep -Fq '3) ;;' "$root/scripts/$script.sh" || grep -Fq '0|3) ;;' "$root/scripts/$script.sh" \
    || { echo "FAIL: $script.sh treats an unpinned site as a failure" >&2; exit 1; }
done
tests=$((tests + 1)); printf 'ok %s - install and update refuse a changed release signing key\n' "$tests"

echo "install supply tests passed ($tests)"
