#!/bin/sh
set -eu

root="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"
cd "$root"
. "$root/scripts/install-supply-lib.sh"
. "$root/scripts/installed-release-state.sh"
. "$root/scripts/operator-locale.sh"
operator_locale_load "$root"

command -v docker >/dev/null 2>&1 || {
  operator_error "Docker is required." "Необходим е Docker."
  exit 1
}
docker compose version >/dev/null
command -v openssl >/dev/null 2>&1 || {
  operator_error "OpenSSL is required." "Необходим е OpenSSL."
  exit 1
}
command -v python3 >/dev/null 2>&1 || {
  operator_error \
    "Python 3 is required to validate network CIDR boundaries safely." \
    "Необходим е Python 3 за безопасна проверка на мрежовите CIDR граници."
  exit 1
}

if [ ! -f .env ]; then
  ./scripts/generate-secrets.sh
fi
./scripts/ensure-status-secrets.sh
./scripts/ensure-api-secrets-layout.sh
sh ./scripts/ensure-backup-configuration.sh

# Pin the maintainer's release signing key, if this release carries one and the
# operator has been given its fingerprint.
#
# Doing it here, before anything is built or started, means a site that was sent
# the wrong fingerprint finds out immediately rather than after ten containers
# are running. Pinning is optional: with no key pinned the appliance verifies
# each release against the digest the operator is given every time, exactly as
# it always has. What it buys is that the digest stops being needed -- one
# fingerprint at install replaces one digest per release, forever.
release_signing_key="infra/release-signing/release-signing-public.pem"
if [ -s "$release_signing_key" ]; then
  set +e
  sh scripts/pin-release-signing-key.sh "$release_signing_key"
  pin_result=$?
  set -e
  case "$pin_result" in
    0) ;;
    # Nothing pinned and no fingerprint given: this site keeps using the
    # per-release digest. Not a failure, and the script has already said so.
    3) ;;
    # Anything else is a key that is not the one this appliance trusts. Stop
    # before a single container is built.
    *) exit "$pin_result" ;;
  esac
fi

# Only the site signing identity is required, and it is generated locally. The
# client certificate and Central CA are issued during enrollment, so requiring
# them here would mean no hospital could install before a Central existed to
# enrol with.
for required in \
  secrets/api/site-signing-private.pem \
  secrets/api/site-signing-public.pem \
  secrets/api/mfa-encryption-key
do
  test -s "$required" || {
    operator_error "Missing required secret: $required" "Липсва задължителна тайна: $required"
    operator_error "Run ./scripts/generate-secrets.sh to create the local signing identity." "Изпълнете ./scripts/generate-secrets.sh, за да създадете локалната самоличност за подписване."
    exit 1
  }
done

if [ -n "${HOSPITAL_BOOTSTRAP_ADMIN_PASSWORD:-}" ]; then
  operator_error "HOSPITAL_BOOTSTRAP_ADMIN_PASSWORD is no longer accepted." "HOSPITAL_BOOTSTRAP_ADMIN_PASSWORD вече не се приема."
  operator_error "Pipe the password to the installer or enter it at the hidden prompt." "Подайте паролата към инсталатора през стандартния вход или я въведете при скритата подкана."
  exit 2
fi

# A non-interactive caller supplies two password lines and an optional third
# write-only external-AI provider key on stdin. Read
# them before Compose/Buildx can inspect the same stream. Interactive operators
# keep the shorter-lived late prompt below, after image preparation.
HOSPITAL_BOOTSTRAP_PASSWORD_PRELOADED=0
if [ ! -t 0 ]; then
  IFS= read -r HOSPITAL_BOOTSTRAP_ADMIN_PASSWORD || {
    operator_error "Missing piped appliance administrator password." "Липсва подадена парола за администратора на системата."
    exit 2
  }
  IFS= read -r HOSPITAL_BOOTSTRAP_ADMIN_PASSWORD_CONFIRM || {
    unset HOSPITAL_BOOTSTRAP_ADMIN_PASSWORD
    operator_error "Missing piped appliance administrator password confirmation." "Липсва подаденото потвърждение на паролата за администратора на системата."
    exit 2
  }
  if [ "$HOSPITAL_BOOTSTRAP_ADMIN_PASSWORD" != "$HOSPITAL_BOOTSTRAP_ADMIN_PASSWORD_CONFIRM" ]; then
    unset HOSPITAL_BOOTSTRAP_ADMIN_PASSWORD HOSPITAL_BOOTSTRAP_ADMIN_PASSWORD_CONFIRM
    operator_error "Administrator passwords did not match." "Паролите на администратора не съвпадат."
    exit 2
  fi
  unset HOSPITAL_BOOTSTRAP_ADMIN_PASSWORD_CONFIRM
  IFS= read -r HOSPITAL_BOOTSTRAP_EXTERNAL_AI_KEY || HOSPITAL_BOOTSTRAP_EXTERNAL_AI_KEY=""
  HOSPITAL_BOOTSTRAP_PASSWORD_PRELOADED=1
fi

if [ -s secrets/api/site-client-cert.pem ] && [ -s secrets/api/central-ca.pem ]; then
  operator_say "Central client credentials found; this installation can be enrolled." "Намерени са клиентски данни за достъп до Central; тази инсталация може да бъде свързана."
else
  operator_say "No Central credentials: installing standalone. Clinical data stays local" "Няма данни за достъп до Central: инсталацията ще работи самостоятелно. Клиничните данни остават локални,"
  operator_say "and research export is available once the site enrols with Central." "а износът за научни цели ще бъде наличен след свързване на болницата с Central."
fi

# Two named local projects may skip the production host gate: the install test
# and the developer appliance. Both are throwaway and neither is how a hospital
# installs. The names are matched exactly, and the opt-in flag is required as
# well, so no real deployment can reach the relaxed path by accident.
case "${COMPOSE_PROJECT_NAME:-}:${HOSPITAL_ALLOW_UNSUPPORTED_TEST_HOST:-}" in
  lospor-install-test:1|lospor-dev:1)
    operator_say "TEST ONLY: reporting host readiness without enforcing the Ubuntu production host." "САМО ЗА ТЕСТ: готовността се отчита без изискване за продукционен Ubuntu хост."
    sh scripts/readiness-check.sh
    ;;
  *)
    sh scripts/readiness-check.sh --strict
    ;;
esac
docker compose config --quiet

# Determine the supply route from Docker Compose's resolved model rather than
# parsing COMPOSE_FILE (whose separator and path form differ across hosts). A
# release overlay removes every custom build definition. Its images must have
# been verified by the integrity-checking online/offline launcher before this script runs;
# installation must never replace those exact bytes by pulling or rebuilding.
resolved_compose="$(docker compose --profile tools config --format json)"
install_supply="$(install_detect_supply "$resolved_compose")"
unset resolved_compose

if ! install_supply_authorized "$install_supply" "${HOSPITAL_IMAGES_VERIFIED:-}"; then
  case "$install_supply" in
    verified-release)
      operator_error "Release images have not been verified by the supported installer." "Образите на версията не са проверени от поддържания инсталатор."
      operator_error "Use the supported online/offline release launcher; do not set the verification flag manually." "Използвайте поддържания стартер за онлайн/офлайн версия; не задавайте ръчно флага за проверка."
      ;;
    *)
      operator_error "HOSPITAL_IMAGES_VERIFIED is valid only for a release-image installation." "HOSPITAL_IMAGES_VERIFIED е валидно само при инсталиране от образи на официална версия."
      ;;
  esac
  exit 1
fi

case "$install_supply:${HOSPITAL_IMAGES_VERIFIED:-}" in
  verified-release:1)
    release_state_assert_verified_transition "$root" \
      || { operator_error "Release installation lacks a coherent verified transition." "Инсталацията на версията няма последователен и проверен преход."; exit 1; }
    sh ./scripts/verify-loaded-release-images.sh "$HOSPITAL_VERIFIED_RELEASE_LOCK"
    operator_say "Using already verified release images; pull/build is disabled." "Използват се вече проверени образи на версията; изтеглянето и изграждането са изключени."
    ;;
  source:"")
    operator_say "Source installation: building the vendored application images locally." "Инсталация от изходен код: образите на включените приложения се изграждат локално."
    # Buildx uses stdin for the generated bake definition. Close the installer's
    # input explicitly so it cannot consume a piped administrator password.
    docker compose --profile tools pull --ignore-buildable </dev/null
    docker compose --profile tools build </dev/null
    ;;
esac
# The release image is now available, so validate the exact mode-expanded
# Caddyfile before starting any service or binding a host port.
sh scripts/validate-caddy-config.sh
# Same reason as in activate-verified-release.sh: a bind mount whose host path
# is missing is created by the daemon as root, and the one-shot below cannot
# take the mode back.
mkdir -p .data/update/requests .data/update/state
# This is a persistent flock inode shared by host-side release mutations and
# the backup container. Pre-create it so Compose cannot replace it with a
# root-owned directory when resolving the single-file bind mount.
io_mutation_home="${LOSPOR_APPLIANCE_HOME:-$root}"
case "$io_mutation_home" in ""|/) operator_error "Unsafe appliance home for the maintenance lock." "Небезопасна основна папка на системата за заключването при поддръжка."; exit 1 ;; esac
mkdir -p "$io_mutation_home/.data"
io_mutation_lock="$io_mutation_home/.data/io-mutation.lock"
if [ -L "$io_mutation_lock" ] || { [ -e "$io_mutation_lock" ] && [ ! -f "$io_mutation_lock" ]; }; then
  operator_error "The maintenance lock path is not a regular file." "Пътят за заключване при поддръжка не е обикновен файл."
  exit 1
fi
: >> "$io_mutation_lock"
chmod 0600 "$io_mutation_lock"
unset io_mutation_home io_mutation_lock
docker compose run --rm --interactive=false -T runtime-secrets-init
docker compose up -d postgres
sh scripts/postgres-update-gate.sh preflight
# These initializers do not read input. Compose keeps stdin open by default even
# with -T, which would consume passwords piped to this installer before the
# prompts below can read them.
docker compose run --rm --interactive=false -T migrate
sh scripts/postgres-update-gate.sh postflight
docker compose --profile tools run --rm --interactive=false -T status-db-init

# Ask only for what has not already been supplied.
#
# A technician standing at a hospital box sees exactly the prompts they always
# did. Everything can also come from the environment, which is what lets the
# install be tested: before this, the only way to run it was by hand, so the
# real install path had no coverage at all and three defects reached a first
# bring-up undetected — a bootstrap that could never create an administrator,
# a lockfile npm ci could not read, and a stale database password.
#
# The password deliberately has no default and no environment-variable path.
# It moves from this terminal to one-shot initializers only over stdin, so it
# never appears in Compose metadata, argv, shell history or an image layer.
ask() {
  var="$1"; label="$2"; default="${3:-}"
  eval "current=\${$var:-}"
  if [ -n "$current" ]; then return 0; fi
  if [ -n "$default" ]; then
    printf "%s [%s]: " "$label" "$default" >&2
  else
    printf "%s: " "$label" >&2
  fi
  read -r value || value=""
  eval "$var=\"\${value:-$default}\""
}

ask_optional() {
  var="$1"; label="$2"
  eval "is_set=\${$var+x}"
  [ "${is_set:-}" = x ] && return 0
  printf "%s: " "$label" >&2
  read -r value || value=""
  eval "$var=\"\$value\""
}

ask HOSPITAL_INSTITUTION_NAME        "$(operator_text "Hospital name" "Име на болницата")"
ask HOSPITAL_INSTITUTION_CITY        "$(operator_text "Hospital city" "Град на болницата")"
ask HOSPITAL_INSTITUTION_COUNTRY     "$(operator_text "Hospital country" "Държава на болницата")" "$(operator_text "Bulgaria" "България")"
ask HOSPITAL_BOOTSTRAP_ADMIN_EMAIL   "$(operator_text "Status appliance administrator sign-in email" "Имейл за вход на системния администратор в Status")"
ask HOSPITAL_BOOTSTRAP_ADMIN_USERNAME "$(operator_text "First clinical administrator username (3-64 Latin letters/numbers/._-; starts with a Latin letter)" "Потребителско име на първия клиничен администратор (3-64 латински букви/цифри/._-; започва с латинска буква)")"
if [ "${#HOSPITAL_BOOTSTRAP_ADMIN_USERNAME}" -lt 3 ] || [ "${#HOSPITAL_BOOTSTRAP_ADMIN_USERNAME}" -gt 64 ] || ! printf '%s\n' "$HOSPITAL_BOOTSTRAP_ADMIN_USERNAME" | LC_ALL=C grep -Eq '^[A-Za-z][A-Za-z0-9._-]*$'; then
  operator_error "Invalid clinical administrator username. Use 3-64 characters, start with a Latin letter, then use only Latin letters, numbers, dot, underscore, or hyphen." "Невалидно потребителско име. Използвайте 3-64 знака, започнете с латинска буква, след това само латински букви, цифри, точка, долна черта или тире."
  exit 2
fi
ask_optional HOSPITAL_BOOTSTRAP_ADMIN_CONTACT_EMAIL "$(operator_text "Clinical administrator contact email (optional; never used to sign in)" "Имейл за контакт на клиничния администратор (по желание; никога не се използва за вход)")"
ask HOSPITAL_BOOTSTRAP_ADMIN_FIRST_NAME "$(operator_text "Administrator first name" "Собствено име на администратора")"
ask HOSPITAL_BOOTSTRAP_ADMIN_LAST_NAME  "$(operator_text "Administrator last name" "Фамилия на администратора")"

if [ "$HOSPITAL_BOOTSTRAP_PASSWORD_PRELOADED" -ne 1 ]; then
  operator_eprintf "Appliance administrator password: " "Парола на администратора на системата: "
  stty -echo 2>/dev/null || true
  read -r HOSPITAL_BOOTSTRAP_ADMIN_PASSWORD
  stty echo 2>/dev/null || true
  operator_eprintf "\nConfirm administrator password: " "\nПотвърдете паролата на администратора: "
  stty -echo 2>/dev/null || true
  read -r HOSPITAL_BOOTSTRAP_ADMIN_PASSWORD_CONFIRM
  stty echo 2>/dev/null || true
  printf "\n" >&2
  if [ "$HOSPITAL_BOOTSTRAP_ADMIN_PASSWORD" != "$HOSPITAL_BOOTSTRAP_ADMIN_PASSWORD_CONFIRM" ]; then
    unset HOSPITAL_BOOTSTRAP_ADMIN_PASSWORD HOSPITAL_BOOTSTRAP_ADMIN_PASSWORD_CONFIRM
    operator_error "Administrator passwords did not match." "Паролите на администратора не съвпадат."
    exit 2
  fi
  unset HOSPITAL_BOOTSTRAP_ADMIN_PASSWORD_CONFIRM
fi
unset HOSPITAL_BOOTSTRAP_PASSWORD_PRELOADED

export \
  HOSPITAL_INSTITUTION_NAME \
  HOSPITAL_INSTITUTION_CITY \
  HOSPITAL_INSTITUTION_COUNTRY \
  HOSPITAL_BOOTSTRAP_ADMIN_EMAIL \
  HOSPITAL_BOOTSTRAP_ADMIN_USERNAME \
  HOSPITAL_BOOTSTRAP_ADMIN_CONTACT_EMAIL \
  HOSPITAL_BOOTSTRAP_ADMIN_FIRST_NAME \
  HOSPITAL_BOOTSTRAP_ADMIN_LAST_NAME

# Initialize the independent Status verifier first. This operation is
# idempotent for the same initial credential, so an interrupted install can be
# retried without replacing an existing operator behind their back.
# The validated credential is captured rather than piped straight on. A
# pipeline reports only its last command's status, and the supported host's
# /bin/sh is dash, which has no pipefail -- so a password rejected here by
# validate-operator-credential.mjs (OPERATOR_PASSWORD_POLICY_FAILED) did not
# stop the install on its own account. The run carried on into init-auth, which
# then failed separately on truncated input, and that unrelated downstream
# error was the one the operator had to diagnose. `set -e` acts on this
# assignment, so the rejection is now authoritative and names itself.
status_credential="$(
  printf '%s\n%s\n%s\n' \
    "$HOSPITAL_BOOTSTRAP_ADMIN_EMAIL" "$HOSPITAL_BOOTSTRAP_ADMIN_PASSWORD" 1 \
    | sh scripts/container-node.sh scripts/credential-json.mjs status-init \
    | sh scripts/container-node.sh scripts/validate-operator-credential.mjs
)"
printf '%s\n' "$status_credential" \
  | docker compose run --rm --no-deps -T status node dist/cli.js init-auth
unset status_credential
docker compose up -d status

# Captured for the same reason as the Status credential above: piped straight
# in, a failure to build the credential document would have been hidden behind
# the bootstrap container's own exit status.
clinical_credential="$(
  printf '%s\n%s\n%s\n' \
    "$HOSPITAL_BOOTSTRAP_ADMIN_EMAIL" "$HOSPITAL_BOOTSTRAP_ADMIN_PASSWORD" 1 \
    | sh scripts/container-node.sh scripts/credential-json.mjs clinical-bootstrap
)"
printf '%s\n' "$clinical_credential" \
  | docker compose --profile tools run --rm -T \
      -e HOSPITAL_INSTITUTION_NAME \
      -e HOSPITAL_INSTITUTION_CITY \
      -e HOSPITAL_INSTITUTION_COUNTRY \
      -e HOSPITAL_BOOTSTRAP_ADMIN_USERNAME \
      -e HOSPITAL_BOOTSTRAP_ADMIN_CONTACT_EMAIL \
      -e HOSPITAL_BOOTSTRAP_ADMIN_FIRST_NAME \
      -e HOSPITAL_BOOTSTRAP_ADMIN_LAST_NAME \
      tools ./node_modules/.bin/tsx --conditions=react-server scripts/bootstrap-hospital-admin.ts
unset clinical_credential

unset HOSPITAL_BOOTSTRAP_ADMIN_PASSWORD
# The optional provider credential is write-only: it goes straight from the
# installer's stdin into the API's sealing service and is never exported,
# written to .env, placed in argv, or printed by the bootstrap command.
printf '%s' "${HOSPITAL_BOOTSTRAP_EXTERNAL_AI_KEY:-}" \
  | docker compose --profile tools run --rm -T tools \
      ./node_modules/.bin/tsx --conditions=react-server scripts/configure-hospital-external-ai.ts
unset HOSPITAL_BOOTSTRAP_EXTERNAL_AI_KEY
docker compose --profile tools run --rm -T tools \
  ./node_modules/.bin/tsx scripts/seed-option-library.ts

# The LOINC code, standard unit and catalogue range of each laboratory test.
# The research copy of a case reads them from this table when the case is
# saved; left empty until a terminology import, every result reached the OMOP
# export and Central without a LOINC code or a unit. The list ships with the
# release and needs no licence decision. Upserts, so repeating it is harmless.
docker compose --profile tools run --rm -T tools \
  ./node_modules/.bin/tsx scripts/seed-lab-loinc.ts

# ICD-10 from the vendored Core bundle, so a diagnosis can be coded before the
# licensed vocabulary package is imported. /v1/search/icd10 reads Icd10Code and
# nothing else, unlike its siblings -- procedures serve a bundled file and drugs
# fall back to one -- so an unseeded table left the diagnosis field returning
# nothing at all, which reads as "no such code" rather than "nothing is loaded".
# Insert-only: an institution that has imported its approved package keeps every
# label it imported.
docker compose --profile tools run --rm -T tools \
  ./node_modules/.bin/tsx scripts/seed-icd10-from-bundle.ts

# Install the two release-owned clinical baselines only after the database and
# Hospital administrator bootstrap are complete. The owner provisioner is the
# sole writer for this state: it runs once, requires the explicit write flag,
# and fails closed on identity collisions, partial state, conflicting platform
# selections, or an exact-content verification failure. Adult and pediatric
# policy choices remain independent; this operation supplies the governed
# content required by either choice and never disables manual charting.
docker compose --profile tools run --rm -T tools \
  ./node_modules/.bin/tsx scripts/provision-bundled-clinical-baselines.ts --apply

# Installation acceptance requires the same exact database-backed assessment
# used by runtime and Status. Do not continue to service start, doctor, or the
# success message if either bundled baseline is absent or differs byte-for-byte
# from the reviewed release contract.
docker compose --profile tools run --rm -T tools \
  ./node_modules/.bin/tsx --conditions=react-server scripts/report-hospital-clinical-baselines.ts --require-ready
# Compose waits for every declared health check and for non-healthchecked
# services to reach running state. A bounded wait turns a restart loop or an
# unhealthy application into an installer failure instead of a green-looking
# `compose ps` followed by "Installation complete".
docker compose up -d --wait --wait-timeout 300

# Prove the shipped backup image, authenticated manifest wiring, capacity
# policy, signals channel, and local recovery destination before acceptance.
# Concurrent scheduler/manual requests safely share one verified object.
./scripts/backup-now.sh

# Select update authority before doctor is allowed to accept the appliance.
# Browser-managed updates are the supported default; an operator may make the
# explicit console-only choice for a site whose policy forbids a host agent.
case "${HOSPITAL_UPDATE_MODE:-agent}" in
  agent)
    update_agent_arguments=""
    ;;
  console-only)
    update_agent_arguments="--console-only"
    ;;
  *)
    operator_error "HOSPITAL_UPDATE_MODE must be agent or console-only." "HOSPITAL_UPDATE_MODE трябва да бъде agent или console-only."
    exit 2
    ;;
esac
# The value above is deliberately a closed, installer-owned word rather than
# operator input; the unquoted expansion supplies either zero or one argument.
#
# Both systemd integrations below require a real /opt/lospor-hospital
# appliance home (their own canonical-current-release check enforces it) --
# the same install/dev-test carve-out as the production host gate above,
# because neither the install test nor the developer appliance runs there.
case "${COMPOSE_PROJECT_NAME:-}:${HOSPITAL_ALLOW_UNSUPPORTED_TEST_HOST:-}" in
  lospor-install-test:1|lospor-dev:1)
    operator_say "TEST ONLY: skipping systemd update-agent and host-observability installation." "САМО ЗА ТЕСТ: инсталирането на systemd агента за обновяване и наблюдението на сървъра се пропуска."
    # doctor.sh --install (below) fails closed if no update mode was ever
    # recorded -- console-only is the truthful choice here, since the systemd
    # agent genuinely was not installed. Written directly rather than via
    # install-update-agent.sh --console-only, which the same /opt/lospor-hospital
    # requirement above blocks unconditionally, before it would even reach its
    # own mode branch.
    # doctor.sh reads this marker back from release_state_appliance_home, not
    # from its own script location -- the two differ whenever install.sh runs
    # from a staged release tree with a .lospor-home symlink (activation's
    # bootstrap-proof flow), rather than a fresh first-time install where they
    # are the same directory. Write where doctor.sh will actually look.
    test_update_state_dir="$(release_state_appliance_home "$root")/.data/runtime/update/state"
    mkdir -p "$test_update_state_dir"
    printf '{"schemaVersion":1,"signalType":"update-agent-installation","observedAt":"%s","mode":"console-only"}\n' \
      "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$test_update_state_dir/update-agent-installation.v1.json"
    chmod 0644 "$test_update_state_dir/update-agent-installation.v1.json"
    unset test_update_state_dir
    ;;
  *)
    # Both installer scripts below refuse to run unless $appliance_home/current
    # already resolves to this release, because the systemd units they write
    # reference that canonical path and are started/verified synchronously,
    # not merely installed. On a first install activation does not create
    # that symlink until *after* this whole script (install.sh) returns
    # success -- so without this, neither installer could ever run on a real
    # first install, only on every later update (where current already points
    # at the prior release). Create it now, pointed at this exact release
    # tree. activate-verified-release.sh's own symlink promotion afterward is
    # an idempotent atomic replace with the same target, and its rollback
    # path already knows how to remove a $appliance_home/current that points
    # at this release if anything below fails.
    real_appliance_home="$(release_state_appliance_home "$root")"
    if [ -e "$real_appliance_home/current" ] || [ -L "$real_appliance_home/current" ]; then
      operator_error \
        "Refusing to replace an unexpected current path before it is meant to exist: $real_appliance_home/current" \
        "Отказ да се замени неочакван път current, преди да е редно да съществува: $real_appliance_home/current"
      exit 1
    fi
    ln -s "$root" "$real_appliance_home/current"
    unset real_appliance_home
    sh ./scripts/install-update-agent.sh $update_agent_arguments
    # Host-only facts cannot be inferred safely from a container. Install the
    # independent one-minute probe after the update-mode marker exists so its
    # first exact v1 snapshot is complete; Status reads that projection only
    # and never receives host paths, names, credentials or command output.
    sh ./scripts/install-host-observability.sh
    # The console command. The launcher is fixed and names only the canonical
    # current release, so updates never need to replace it.
    install -m 0755 ./infra/losporctl/losporctl /usr/local/bin/losporctl
    ;;
esac
unset update_agent_arguments

# Exercise the configured clinical, phone, API, Research, Status, TLS,
# migration/operator, terminology-state, worker, and backup routes. Ordinary
# doctor mode reports the expected pre-terminology go-live warning without
# pretending the appliance is clinically approved.
sh ./scripts/doctor.sh --install

docker compose ps

operator_say "Installation complete." "Инсталацията завърши."
env_setting() {
  sed -n "s/^$1=//p" .env | tail -n 1 | tr -d '\r' | sed 's/^"//; s/"$//'
}
clinical_domain="$(env_setting HOSPITAL_CLINICAL_DOMAIN)"
https_port="$(env_setting HOSPITAL_HTTPS_PORT)"
https_port="${https_port:-443}"
status_port="$(env_setting HOSPITAL_STATUS_PORT)"
status_port="${status_port:-3443}"
if [ -n "$clinical_domain" ]; then
  # Only name the port when it is not the one browsers assume, so the common
  # install does not print a URL clinicians would copy with a needless :443.
  if [ "$https_port" = "443" ]; then
    operator_say "Status: https://${clinical_domain}/status/" "Status: https://${clinical_domain}/status/"
  else
    operator_say "Status: https://${clinical_domain}:${https_port}/status/" "Status: https://${clinical_domain}:${https_port}/status/"
  fi
fi
operator_say "Outage fallback (from an SSH tunnel): https://localhost:${status_port}/status/" "Авариен достъп (през SSH тунел): https://localhost:${status_port}/status/"
echo "  ssh -L ${status_port}:127.0.0.1:${status_port} <admin>@$(hostname -f 2>/dev/null || hostname)"
operator_say "Installed, not yet approved for clinical use. Complete the checklist on the Status Go-live page (/status/go-live)." "Инсталирано, но все още не е одобрено за клинична употреба. Изпълнете списъка на страницата „Готовност“ в Status (/status/go-live)."
