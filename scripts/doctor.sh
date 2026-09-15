#!/bin/sh
set -eu

doctor_mode=ordinary
case "${1:-}" in
  "") ;;
  --install) doctor_mode=install ;;
  --go-live) doctor_mode=go-live ;;
  --restore-preopen) doctor_mode=restore-preopen ;;
  *) echo "Употреба / Usage: sh scripts/doctor.sh [--install|--go-live|--restore-preopen]" >&2; exit 2 ;;
esac

root="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"
. "$root/scripts/installed-release-state.sh"
appliance_home="$(release_state_appliance_home "$root")"
if [ "${HOSPITAL_RELEASE_TRANSITION:-}" = 1 ]; then
  release_state_assert_verified_transition "$root"
else
  set +e
  release_state_apply "$appliance_home"
  release_state_result=$?
  set -e
  case "$release_state_result" in
    0) root="$state_release_root" ;;
    10) ;;
    *) exit "$release_state_result" ;;
  esac
fi
cd "$root"
. "$root/scripts/operator-locale.sh"
operator_locale_load "$root"

docker compose config --quiet
docker compose ps

# Read the two values this script needs, rather than sourcing the whole file.
#
# `. ./.env` executes it. Every value is shell, so a setting containing spaces
# can be interpreted as a command. Reading only named values also avoids
# executing anything else an operator accidentally placed in the file.
#
# This is the reader scripts/readiness-check.sh already uses.
env_value() {
  sed -n "s/^$1=//p" "$root/.env" 2>/dev/null \
    | tail -n 1 | tr -d '' | sed 's/^"//; s/"$//'
}

# An emergency restore switches the verified database while the public edge is
# deliberately still closed. This gate proves the restored schema and every
# internal application before Caddy is allowed to accept a clinician request.
# It must not use public DNS, public routes, either TLS listener, or Caddy: those
# checks would either fail by design or tempt the restore wrapper to open the
# edge before the restored generation has been proven.
if [ "$doctor_mode" = restore-preopen ]; then
  if docker compose exec -T postgres \
      pg_isready --quiet --host=127.0.0.1 --username=lospor --dbname=lospor \
      >/dev/null 2>&1 \
    && [ "$(docker compose exec -T postgres \
      psql --username=lospor --dbname=lospor --tuples-only --no-align \
        --set=ON_ERROR_STOP=1 --command='SELECT 1;' 2>/dev/null)" = 1 ]; then
    operator_say \
      "Restored PostgreSQL database accepts an authenticated query." \
      "Възстановената PostgreSQL база приема удостоверена заявка."
  else
    operator_error \
      "Restored PostgreSQL database is not queryable; public access remains closed." \
      "Възстановената PostgreSQL база не приема заявки; публичният достъп остава затворен."
    exit 1
  fi

  migration_report="$(mktemp)"
  if docker compose --profile tools run --rm --no-deps --interactive=false -T tools \
      node node_modules/prisma/build/index.js migrate status --schema prisma/schema.prisma \
      >"$migration_report" 2>&1; then
    operator_say \
      "Restored migration manifest matches the pinned release schema." \
      "Manifest-ът на възстановените миграции съответства на схемата от фиксираната версия."
  else
    rm -f "$migration_report"
    operator_error \
      "Restored migration manifest/schema does not match this release; public access remains closed." \
      "Manifest-ът/схемата на възстановените миграции не съответства на тази версия; публичният достъп остава затворен."
    exit 1
  fi
  rm -f "$migration_report"

  internal_http_check() {
    internal_name="$1"; internal_url="$2"; internal_name_bg="$3"
    if docker compose exec -T status node -e '
      const url = process.argv[1];
      fetch(url, { signal: AbortSignal.timeout(5000) })
        .then(response => { if (!response.ok) process.exit(1) })
        .catch(() => process.exit(1));
    ' "$internal_url" >/dev/null 2>&1; then
      operator_say \
        "$internal_name is healthy inside the closed appliance network." \
        "$internal_name_bg работи в затворената вътрешна мрежа на системата."
    else
      operator_error \
        "$internal_name is not healthy; public access remains closed." \
        "$internal_name_bg не работи; публичният достъп остава затворен."
      return 1
    fi
  }

  internal_http_check "API liveness" "http://api:3002/health/live" "Проверката за работа на API"
  internal_http_check "API readiness" "http://api:3002/health/ready" "Проверката за готовност на API"
  internal_http_check "Web application" "http://web:3000/login" "Уеб приложението"
  internal_http_check "Phone/PWA application" "http://pwa:8080/health" "Мобилното/PWA приложение"
  internal_http_check "Research Browser" "http://browser:3003/login" "Research Browser"
  internal_http_check "Appliance Status" "http://127.0.0.1:3004/internal/health/live" "Status на системата"

  sh scripts/appliance-operator.sh verify

  # Terminology gates reopening only if this appliance had approved terminology
  # to begin with.
  #
  # Requiring go-live unconditionally meant an appliance that was serving
  # patients five minutes earlier could not reopen after a restore, because
  # normal operation only warns about missing terminology while this path
  # refused outright. The window where that bites is before a site has imported
  # its package -- exactly when a new installation is most likely to be
  # restoring backups. A restore must not impose a clinical approval the
  # appliance was already running without.
  #
  # What is still enforced: an appliance that HAD an approved package must
  # still have a valid one afterwards. That is a genuine regression check --
  # losing or corrupting terminology across a restore is a real fault -- and
  # the host-side activation record survives the database switch, so this
  # distinguishes the two cases reliably.
  if [ -s "$appliance_home/.data/terminology/active.tsv" ]; then
    sh scripts/terminology-status.sh --go-live
  else
    sh scripts/terminology-status.sh
    operator_say \
      "No terminology package was approved before this restore; reopening does not require one." \
      "Преди това възстановяване не е одобрен пакет с терминология; повторното отваряне не изисква такъв."
  fi

  operator_say \
    "Restore pre-open checks passed; the public edge may now be started." \
    "Проверките преди отваряне след възстановяване завършиха успешно; публичният вход вече може да бъде стартиран."
  # Stable machine-readable proof consumed by the fail-closed restore wrapper.
  printf '%s\n' RESTORE_PREOPEN_OK
  exit 0
fi

HOSPITAL_CLINICAL_DOMAIN="$(env_value HOSPITAL_CLINICAL_DOMAIN)"
HOSPITAL_RESEARCH_DOMAIN="$(env_value HOSPITAL_RESEARCH_DOMAIN)"
[ -n "$HOSPITAL_CLINICAL_DOMAIN" ] \
  || { operator_error "HOSPITAL_CLINICAL_DOMAIN is not set in .env." "HOSPITAL_CLINICAL_DOMAIN не е зададено в .env."; exit 1; }
[ -n "$HOSPITAL_RESEARCH_DOMAIN" ] \
  || { operator_error "HOSPITAL_RESEARCH_DOMAIN is not set in .env." "HOSPITAL_RESEARCH_DOMAIN не е зададено в .env."; exit 1; }
[ -n "${HOSPITAL_TLS_MODE:-}" ] || HOSPITAL_TLS_MODE="$(env_value HOSPITAL_TLS_MODE)"
[ -n "${HOSPITAL_TLS_VERIFY_CA:-}" ] || HOSPITAL_TLS_VERIFY_CA="$(env_value HOSPITAL_TLS_VERIFY_CA)"
HOSPITAL_HTTPS_PORT="$(env_value HOSPITAL_HTTPS_PORT)"
HOSPITAL_HTTPS_PORT="${HOSPITAL_HTTPS_PORT:-443}"
HOSPITAL_STATUS_PORT="$(env_value HOSPITAL_STATUS_PORT)"
HOSPITAL_STATUS_PORT="${HOSPITAL_STATUS_PORT:-3443}"

# Verify the clinical name against whatever authority this site actually uses.
#
# These four calls used to trust only the public store, which is right for a
# site holding a Let's Encrypt certificate and impossible for any other. A LAN
# install can select local TLS, where Caddy signs with a CA it generated itself,
# and no amount of waiting makes a public root vouch for that. The check could
# not pass, and doctor.sh is the health gate for both applying a release and
# verifying the rollback afterwards -- so an update installed cleanly, failed
# here, rolled back, failed here again, and left the activation lock behind for
# an operator. Every update, on every LAN appliance, by construction.
#
# The answer is to name the authority rather than to stop checking. --insecure
# would turn a proof that the right service answered into a note that something
# did, on the one path where a hospital most needs the stronger statement.
tls_ca=""
tls_ca_temporary=""
case "${HOSPITAL_TLS_MODE:-acme}" in
  acme)
    # A publicly trusted certificate. The system store is the right authority.
    ;;
  operator)
    # The hospital's own CA issued the certificate; it is the only thing that
    # can vouch for it, and a managed estate already trusts it everywhere else.
    [ -n "${HOSPITAL_TLS_VERIFY_CA:-}" ] \
      || { operator_error "HOSPITAL_TLS_MODE=operator requires HOSPITAL_TLS_VERIFY_CA." "HOSPITAL_TLS_MODE=operator изисква HOSPITAL_TLS_VERIFY_CA."; exit 1; }
    case "$HOSPITAL_TLS_VERIFY_CA" in /*) ;; *) HOSPITAL_TLS_VERIFY_CA="$root/$HOSPITAL_TLS_VERIFY_CA" ;; esac
    [ -s "$HOSPITAL_TLS_VERIFY_CA" ] \
      || { operator_error "Certificate authority file is missing or empty: $HOSPITAL_TLS_VERIFY_CA" "Файлът на удостоверяващия орган липсва или е празен: $HOSPITAL_TLS_VERIFY_CA"; exit 1; }
    tls_ca="$HOSPITAL_TLS_VERIFY_CA"
    ;;
  local)
    # Caddy's own root, read from the running container. Reaching into the
    # volume proves the chain that is actually being served rather than one
    # recorded when the appliance was installed, and a man in the middle on the
    # ward network still fails -- which is the whole point of not using
    # --insecure here.
    tls_ca_temporary="$(mktemp)"
    chmod 600 "$tls_ca_temporary"
    trap 'rm -f "$tls_ca_temporary"' EXIT HUP INT TERM
    if ! docker compose exec -T caddy cat \
      /data/caddy/pki/authorities/local/root.crt > "$tls_ca_temporary" 2>/dev/null \
      || [ ! -s "$tls_ca_temporary" ]; then
      operator_error "HOSPITAL_TLS_MODE=local but Caddy has issued no local authority yet." "Зададено е HOSPITAL_TLS_MODE=local, но Caddy още не е издал локален удостоверяващ орган."
      exit 1
    fi
    tls_ca="$tls_ca_temporary"
    ;;
  *)
    operator_error \
      "HOSPITAL_TLS_MODE must be acme, local or operator; got '${HOSPITAL_TLS_MODE}'." \
      "HOSPITAL_TLS_MODE трябва да бъде acme, local или operator; зададено е '${HOSPITAL_TLS_MODE}'."
    exit 1
    ;;
esac

appliance_curl() {
  host="$1"; path="$2"
  if [ -n "$tls_ca" ]; then
    curl --cacert "$tls_ca" --resolve "$host:$HOSPITAL_HTTPS_PORT:127.0.0.1" \
      --fail --silent --show-error "https://$host:$HOSPITAL_HTTPS_PORT$path" >/dev/null
  else
    curl --resolve "$host:$HOSPITAL_HTTPS_PORT:127.0.0.1" \
      --fail --silent --show-error "https://$host:$HOSPITAL_HTTPS_PORT$path" >/dev/null
  fi
}

bounded_route() {
  host="$1"; path="$2"; label_en="$3"; label_bg="$4"
  if [ -n "$tls_ca" ]; then
    code="$(curl --cacert "$tls_ca" --resolve "$host:$HOSPITAL_HTTPS_PORT:127.0.0.1" \
      --silent --show-error --output /dev/null --write-out '%{http_code}' \
      "https://$host:$HOSPITAL_HTTPS_PORT$path")"
  else
    code="$(curl --resolve "$host:$HOSPITAL_HTTPS_PORT:127.0.0.1" \
      --silent --show-error --output /dev/null --write-out '%{http_code}' \
      "https://$host:$HOSPITAL_HTTPS_PORT$path")"
  fi
  case "$code" in
    2??|3??) operator_say "$label_en is reachable from this host." "$label_bg е достъпен от този сървър." ;;
    403) operator_say "$label_en correctly enforces its configured network boundary (this host is outside it)." "$label_bg правилно прилага зададената мрежова граница (този сървър е извън нея)." ;;
    *) operator_error "$label_en returned HTTP $code." "$label_bg върна HTTP $code."; return 1 ;;
  esac
}

report_live_certificate() {
  host="$1"
  certificate="$(mktemp)"
  if openssl s_client -connect "127.0.0.1:$HOSPITAL_HTTPS_PORT" -servername "$host" \
    -showcerts </dev/null 2>/dev/null \
    | openssl x509 -outform PEM > "$certificate" 2>/dev/null \
    && [ -s "$certificate" ]; then
    expiry="$(openssl x509 -noout -enddate -in "$certificate" | cut -d= -f2-)"
    if openssl x509 -noout -checkend 2592000 -in "$certificate" >/dev/null 2>&1; then
      operator_say "TLS certificate for $host expires $expiry." "TLS сертификатът за $host изтича на $expiry."
    else
      operator_error "WARNING: TLS certificate for $host expires in less than 30 days: $expiry" "ВНИМАНИЕ: TLS сертификатът за $host изтича след по-малко от 30 дни: $expiry"
    fi
  else
    rm -f "$certificate"
    operator_error "Could not inspect the live TLS certificate for $host." "Действащият TLS сертификат за $host не може да бъде проверен."
    return 1
  fi
  rm -f "$certificate"
}

# One clinical host now answers for all three: the web app at the root, the
# phone app under /app, and the API under /v1. Checking each path separately
# still proves each service behind the proxy is alive.
appliance_curl "$HOSPITAL_CLINICAL_DOMAIN" "/"
appliance_curl "$HOSPITAL_CLINICAL_DOMAIN" "/app/"
appliance_curl "$HOSPITAL_CLINICAL_DOMAIN" "/health/ready"
bounded_route "$HOSPITAL_CLINICAL_DOMAIN" "/status/login" "Appliance Status" "Status на системата"
bounded_route "$HOSPITAL_RESEARCH_DOMAIN" "/login" "Research Browser virtual host" "Виртуалният адрес на Research Browser"
docker compose exec -T browser node -e \
  "fetch('http://127.0.0.1:3003/login').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
report_live_certificate "$HOSPITAL_CLINICAL_DOMAIN"
report_live_certificate "$HOSPITAL_RESEARCH_DOMAIN"
# The fallback certificate is intentionally private/self-signed and the port is
# bound to loopback only. It is used through an SSH tunnel when Caddy or the
# clinical stack is unavailable.
curl --insecure --fail --silent --show-error \
  "https://localhost:$HOSPITAL_STATUS_PORT/status/login" >/dev/null

docker compose exec -T status node -e \
  "fetch('http://127.0.0.1:3004/internal/health/live').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
sh scripts/appliance-operator.sh verify

# Host update truth. A deliberate console-only site is healthy but exposes no
# browser controls; an installed marker without an active/fresh unit is a real
# failure. Do not inspect the activation lock from inside the candidate's own
# transition doctor: the lock is expected until activation commits.
update_state_dir="$appliance_home/.data/runtime/update/state"
update_installation="$update_state_dir/update-agent-installation.v1.json"
if [ -s "$update_installation" ]; then
  [ -f "$update_installation" ] && [ ! -L "$update_installation" ] \
    && [ "$(wc -l < "$update_installation" | tr -d '[:space:]')" = 1 ] \
    && [ "$(wc -c < "$update_installation" | tr -d '[:space:]')" -le 512 ] \
    && grep -Eq '^\{"schemaVersion":1,"signalType":"update-agent-installation","observedAt":"[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z","mode":"(agent|console-only)"\}$' "$update_installation" \
    || { operator_error "The update-agent installation marker failed strict validation." "Маркерът за инсталиране на агента за обновяване не премина строгата проверка."; exit 1; }
  update_mode="$(sed -n 's/.*"mode":"\([^"]*\)".*/\1/p' "$update_installation")"
  case "$update_mode" in
    console-only)
      operator_say "Update mode is intentionally console-only." "Обновяването умишлено е само от конзолата."
      ;;
    agent)
      [ -f /etc/systemd/system/lospor-update-agent.service ] \
        && [ ! -L /etc/systemd/system/lospor-update-agent.service ] \
        && grep -Fq '/opt/lospor-hospital/current/scripts/update-agent-loop.sh' /etc/systemd/system/lospor-update-agent.service \
        || { operator_error "The configured update-agent unit is missing or uses a noncanonical path." "Настроената systemd услуга за обновяване липсва или използва неканоничен път."; exit 1; }
      systemctl is-enabled --quiet lospor-update-agent.service \
        && systemctl is-active --quiet lospor-update-agent.service \
        || { operator_error "The update agent is configured but not enabled and active." "Агентът за обновяване е настроен, но не е включен и активен."; exit 1; }
      [ -s "$update_state_dir/update-agent.v2.json" ] \
        && find "$update_state_dir/update-agent.v2.json" -mmin -10 -print -quit | grep -q . \
        || { operator_error "The update agent has no fresh heartbeat." "Агентът за обновяване няма нов сигнал за състояние."; exit 1; }
      operator_say "The host update agent is installed, active, and reporting." "Агентът за обновяване на сървъра е инсталиран, активен и подава състояние."
      ;;
    *) operator_error "The update-agent installation marker is invalid." "Маркерът за инсталиране на агента за обновяване е невалиден."; exit 1 ;;
  esac
else
  operator_error "Warning: update mode has not been selected (agent or console-only)." "Предупреждение: не е избран режим за обновяване (агент или само конзола)."
  [ "$doctor_mode" != install ] || exit 1
fi
if [ "${HOSPITAL_RELEASE_TRANSITION:-}" != 1 ] && [ -e "$appliance_home/.data/release-activation.lock" ]; then
  sh scripts/recover-release-activation.sh inspect >&2 || true
  operator_error "An activation lock requires supported operator recovery." "Заключване на активирането изисква поддържано възстановяване от оператор."
  exit 1
fi

# The terminology package is optional: the release carries ICD-10 with its
# Bulgarian names, procedures, the drug list, English diagnosis synonyms and
# the research numbers for all of them. Go-live therefore requires a valid
# package only on an appliance that imported one -- the same rule the restore
# pre-open check above applies.
if [ "$doctor_mode" = go-live ] && [ -s "$appliance_home/.data/terminology/active.tsv" ]; then
  sh scripts/terminology-status.sh --go-live
else
  sh scripts/terminology-status.sh
fi

for marker in backup-status.v1.json delivery-worker-status.v1.json; do
  if [ "$doctor_mode" = install ]; then
    marker_attempt=0
    while [ "$marker_attempt" -lt 30 ] \
      && ! docker compose exec -T status test -s "/signals/$marker"; do
      marker_attempt=$((marker_attempt + 1))
      sleep 2
    done
  fi
  if ! docker compose exec -T status test -s "/signals/$marker"; then
    operator_error "Warning: Status has not received $marker yet." "Предупреждение: Status още не е получил $marker."
    [ "$doctor_mode" != install ] || exit 1
  fi
done

verified_recovery_object=""
# -L is load-bearing. Inside a release root `backups` is a symlink to the
# appliance home's directory (activate-verified-release.sh creates it), and
# find does not follow a symlinked starting point without it. Without -L this
# search silently returns nothing on every real appliance: doctor then reports
# "no completed database backup exists yet" however many verified backups
# exist, never runs backup_verify_object at all, and drops the local-backup
# reassurance below -- leaving the bare off-host CRITICAL that the comment
# there exists to prevent.
latest="$(find -L backups -maxdepth 1 -type d -name 'lospor-*.backup' -print | sort | tail -n 1)"
if [ -z "$latest" ]; then
  operator_error "Warning: no completed database backup exists yet." "Предупреждение: все още няма завършено резервно копие на базата данни."
else
  latest_name="$(basename "$latest")"
  if MSYS_NO_PATHCONV=1 docker compose run --rm --interactive=false -T \
      --entrypoint /bin/sh backup -c \
      '. /usr/local/bin/backup-object-lib.sh; backup_verify_object "$1" full' \
      sh "/backups/$latest_name" >/dev/null; then
    verified_recovery_object="$latest_name"
    operator_say \
      "Latest authenticated recovery object verified: $latest_name." \
      "Последният удостоверен архив е проверен: $latest_name."
  else
    operator_error \
      "Latest recovery object failed authenticated verification: $latest_name." \
      "Последният архив не премина удостоверената проверка: $latest_name."
    exit 1
  fi
fi

if [ ! -s backups/.last-offhost-verified.v1 ]; then
  # State the local result before the missing one. Operators read a bare "no
  # ... backup ... acknowledged" as "my backup failed" and go hunting for a
  # broken backup that is in fact complete and verified. This gate is about
  # off-host replication only: a copy that lives solely on this appliance does
  # not survive the appliance.
  if [ -n "$verified_recovery_object" ]; then
    verified_recovery_at=""
    if [ -s backups/.last-verified.v1 ]; then
      verified_epoch="$(sed -n 's/^completedAtEpoch=//p' backups/.last-verified.v1 | tail -n 1)"
      case "$verified_epoch" in
        '' | *[!0-9]*) ;;
        *) verified_recovery_at="$(date -u -d "@$verified_epoch" +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || true)" ;;
      esac
    fi
    if [ -n "$verified_recovery_at" ]; then
      operator_say \
        "The local backup is complete and verified ($verified_recovery_at): $verified_recovery_object." \
        "Локалното резервно копие е завършено и проверено ($verified_recovery_at): $verified_recovery_object."
    else
      operator_say \
        "The local backup is complete and verified: $verified_recovery_object." \
        "Локалното резервно копие е завършено и проверено: $verified_recovery_object."
    fi
  fi
  operator_error \
    "CRITICAL: that copy exists only on this appliance. No off-host backup system has acknowledged it, so the data would not survive the loss of this machine." \
    "КРИТИЧНО: това копие съществува само на този модул. Външна система за архивиране не го е потвърдила, така че данните не биха оцелели при загуба на машината."
fi

# Secrets escrow, on the same footing as off-host backup and for the same
# reason: a copy that exists only on this appliance does not survive the
# appliance. The difference is that secrets cannot be recovered from a backup at
# all -- backups carry key fingerprints, never keys -- so losing .env is not a
# setback, it is the permanent end of every stored patient identifier and every
# pseudonym already delivered to Central.
#
# The appliance cannot see inside the hospital's safe, so this asks for an
# acknowledgement and reports its absence, exactly as the off-host gate does.
# Read from the appliance home, where the acknowledgement is written, not from
# the release directory doctor runs in.
if [ ! -s "$appliance_home/.secrets-escrowed.v1" ]; then
  operator_error \
    "CRITICAL: no acknowledgement that .env and secrets/ have been escrowed off this appliance. They cannot be recovered from a backup -- backups hold only their fingerprints -- so losing this machine's .env permanently ends every stored patient identifier and every case already sent to Central. Plug in a USB stick or mount a share from elsewhere, then run: sudo losporctl secrets escrow DIRECTORY (or, if they were escrowed another way, record it with acknowledge-secrets-escrow.sh)." \
    "КРИТИЧНО: няма потвърждение, че .env и secrets/ са съхранени извън този модул. Те не могат да бъдат възстановени от резервно копие — копията съдържат само отпечатъци — така че загубата на .env на тази машина завинаги прекратява всяка запазена самоличност на пациент и всеки случай, вече изпратен към Central. Поставете USB памет или монтирайте споделена папка от друго място и изпълнете: sudo losporctl secrets escrow ДИРЕКТОРИЯ (или, ако са съхранени по друг начин, отбележете го с acknowledge-secrets-escrow.sh)."
fi

operator_say "Hospital appliance checks passed." "Проверките на болничния модул завършиха успешно."
