#!/bin/sh
set -eu

# Builds and exercises the three Hospital-owned infrastructure images. Every
# container and locally tagged image created by this script is disposable.
root="$(CDPATH= cd -- "$(dirname "$0")/../.." && pwd -P)"
cd "$root"

# Git Bash otherwise rewrites container paths before invoking docker.exe.
MSYS_NO_PATHCONV=1
export MSYS_NO_PATHCONV

command -v docker >/dev/null 2>&1 || {
  echo "Docker is required for the hardened infrastructure image gate." >&2
  exit 1
}

suffix="${GITHUB_RUN_ID:-local}-${GITHUB_RUN_ATTEMPT:-0}-$$"
postgres_image="${POSTGRES_IMAGE:-lospor-hardened-postgres-test:${suffix}}"
curl_image="${CURL_WORKER_IMAGE:-lospor-hardened-curl-worker-test:${suffix}}"
caddy_image="${CADDY_IMAGE:-lospor-hardened-caddy-test:${suffix}}"
postgres_container="lospor-hardened-postgres-test-${suffix}"
owned_images=""

cleanup() {
  docker rm -f "$postgres_container" >/dev/null 2>&1 || true
  for image in $owned_images; do
    docker image rm "$image" >/dev/null 2>&1 || true
  done
}
trap cleanup EXIT HUP INT TERM

if [ -z "${POSTGRES_IMAGE:-}" ]; then
  docker build --file infra/docker/postgres.Dockerfile --tag "$postgres_image" .
  owned_images="$owned_images $postgres_image"
fi
if [ -z "${CURL_WORKER_IMAGE:-}" ]; then
  docker build --file infra/docker/curl-worker.Dockerfile --tag "$curl_image" .
  owned_images="$owned_images $curl_image"
fi
if [ -z "${CADDY_IMAGE:-}" ]; then
  docker build --file infra/docker/caddy.Dockerfile --tag "$caddy_image" .
  owned_images="$owned_images $caddy_image"
fi

# The worker keeps curl's unprivileged default and contains every BusyBox tool
# used by worker-loop.sh. Compose deliberately overrides this user to write its
# root-owned, read-only-mounted status volume.
docker run --rm --entrypoint sh "$curl_image" -c '
  [ "$(id -u)" -ne 0 ]
  for tool in curl cut date mkdir mv rm sleep; do command -v "$tool" >/dev/null; done
  curl --version | grep -Fq "curl 8.21.0"
'

# Validate the real Hospital configuration, including reverse proxy and zstd
# modules, instead of accepting a custom binary that only prints a version.
docker run --rm "$caddy_image" caddy version | grep -Fq 'v2.11.4'
modules="$(docker run --rm "$caddy_image" caddy list-modules --packages)"
printf '%s\n' "$modules" | grep -Fq 'http.handlers.reverse_proxy'
printf '%s\n' "$modules" | grep -Fq 'http.encoders.zstd'
docker run --rm -i --entrypoint caddy \
  -e ACME_EMAIL=admin@example.test \
  -e HOSPITAL_CLINICAL_DOMAIN=clinical.example.test \
  -e HOSPITAL_RESEARCH_DOMAIN=research.example.test \
  -e HOSPITAL_RESEARCH_ALLOWED_CIDRS=10.0.0.0/8 \
  -e HOSPITAL_STATUS_ALLOWED_CIDRS=10.0.0.0/8 \
  -e HOSPITAL_TLS_MODE=local \
  "$caddy_image" validate --config - --adapter caddyfile \
  < infra/caddy/Caddyfile

# Starting a real database through the inherited official entrypoint proves
# that replacing gosu/setpriv with coreutils chroot did not alter initialization
# or privilege dropping behavior.
docker run --detach --name "$postgres_container" \
  -e POSTGRES_DB=lospor_smoke \
  -e POSTGRES_USER=lospor_smoke \
  -e POSTGRES_PASSWORD=not-a-production-secret \
  "$postgres_image" postgres -c archive_mode=off >/dev/null

attempt=0
until docker logs "$postgres_container" 2>&1 \
  | grep -Fq 'PostgreSQL init process complete; ready for start up'; do
  attempt=$((attempt + 1))
  if [ "$attempt" -ge 60 ]; then
    docker logs "$postgres_container" >&2 || true
    echo "Hardened PostgreSQL did not complete initialization." >&2
    exit 1
  fi
  sleep 1
done

attempt=0
until docker exec "$postgres_container" pg_isready \
  --username lospor_smoke --dbname lospor_smoke >/dev/null 2>&1 \
  && docker exec "$postgres_container" psql \
    --username lospor_smoke --dbname lospor_smoke --tuples-only --no-align \
    --command 'SELECT 1' 2>/dev/null | grep -Fxq 1; do
  attempt=$((attempt + 1))
  if [ "$attempt" -ge 60 ]; then
    docker logs "$postgres_container" >&2 || true
    echo "Hardened PostgreSQL did not become finally ready." >&2
    exit 1
  fi
  sleep 1
done

docker exec "$postgres_container" sh -c \
  'command -v chroot >/dev/null &&
   ! command -v setpriv >/dev/null &&
   ! command -v gosu >/dev/null &&
   ! command -v perl >/dev/null &&
   ! command -v gzip >/dev/null &&
   ! command -v infocmp >/dev/null &&
   grep -Eq "^ID=debian$" /etc/os-release &&
   grep -Eq "^VERSION_CODENAME=bookworm$" /etc/os-release &&
   getconf GNU_LIBC_VERSION | grep -Fq "glibc 2.36" &&
   locale -a | grep -Fq "en_US.utf8"'
actual="$(docker exec "$postgres_container" psql \
  --username lospor_smoke --dbname lospor_smoke --tuples-only --no-align \
  --command "SELECT current_user || ':' || current_setting('server_version');")"
case "$actual" in
  lospor_smoke:17.11*) ;;
  *) echo "Unexpected PostgreSQL identity/version: $actual" >&2; exit 1 ;;
esac

layers="$(docker image inspect --format '{{len .RootFS.Layers}}' "$postgres_image")"
[ "$layers" = 1 ] || {
  echo "Hardened PostgreSQL must flatten removed packages into one final filesystem layer; got $layers." >&2
  exit 1
}

# Reuse the newly built image against a volume initialized by the exact legacy
# 17.6 Bookworm release. This catches libc/locale incompatibilities that a
# fresh-database smoke test cannot detect.
sh infra/docker/postgres-cross-base-upgrade.test.sh "$postgres_image"

echo "HARDENED_INFRA_IMAGES_OK"
