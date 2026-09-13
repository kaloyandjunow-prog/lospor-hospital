#!/bin/sh
set -eu
set +x

# Download and authenticate one exact immutable GitHub Release, pull its exact
# OCI identities, and publish a root-owned descriptor.  The sole untrusted
# input is a semantic version; Status cannot supply a URL, path, digest, tag,
# repository, command, or verification bypass.

root="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd -P)"
. "$root/scripts/installed-release-state.sh"
. "$root/scripts/update-pipeline-lib.sh"
. "$root/scripts/operator-locale.sh"
version="${1:-}"
request_id="${2:--}"
update_valid_version "$version" || {
  operator_error "Usage: prepare-verified-release.sh <version> [request-id]" "Употреба: prepare-verified-release.sh <версия> [номер-на-заявка]"
  exit 2
}
printf '%s\n' "$request_id" | grep -Eq '^(-|[a-f0-9]{32})$' || { echo UPDATE_REQUEST_MALFORMED >&2; exit 2; }
appliance_home="$(release_state_appliance_home "$root")"
operator_locale_load "$appliance_home"
update_pipeline_init "$root" "$appliance_home"

repository="${HOSPITAL_UPDATE_REPOSITORY:-kaloyandjunow-prog/lospor-hospital}"
printf '%s\n' "$repository" | grep -Eq '^[A-Za-z0-9_.-]{1,100}/[A-Za-z0-9_.-]{1,100}$' \
  || { echo UPDATE_REPOSITORY_INVALID >&2; exit 2; }
api_origin="${HOSPITAL_GITHUB_API_ORIGIN:-https://api.github.com}"
if [ "${HOSPITAL_UPDATE_TEST_ONLY:-0}" != 1 ] && [ "$api_origin" != https://api.github.com ]; then
  echo UPDATE_API_ORIGIN_REFUSED >&2
  exit 2
fi
case "$api_origin" in https://api.github.com) ;; *) echo UPDATE_API_ORIGIN_INVALID >&2; exit 2 ;; esac

if update_descriptor_for_version "$version" 2>/dev/null; then
  sh "$root/scripts/verify-loaded-release-images.sh" "$descriptor_lock"
  update_transition_write PREPARED prepare "$request_id" "$version" UPDATE_PREPARED "$descriptor_lock_sha"
  update_projection_write prepared UPDATE_PREPARED "$version" "" \
    "$descriptor_version" "$descriptor_lock_sha" "$descriptor_rollback_policy"
  operator_say "Release $version is already prepared and still verifies." "Версия $version вече е подготвена и проверката ѝ остава успешна."
  exit 0
fi

if release_state_read "$appliance_home"; then
  installed_version="$state_version"
else
  state_result=$?
  [ "$state_result" -eq 10 ] || exit "$state_result"
  installed_version="-"
fi

work="$update_private_dir/.prepare-$version-$$"
assets="$work/assets"
metadata="$work/release.json"
metadata_tsv="$work/release.tsv"
io_owned=0
cleanup_prepare() {
  if [ "$io_owned" -eq 1 ]; then update_io_lock_release; fi
  case "$work" in "$update_private_dir/.prepare-$version-"*) rm -rf "$work" 2>/dev/null || true ;; esac
}
trap cleanup_prepare EXIT HUP INT TERM
mkdir "$work" "$assets"
chmod 0700 "$work" "$assets"

# The repository is public, so release metadata and assets are fetched without a
# credential. Anonymous API calls share a small hourly allowance per network
# address; when it is spent, say when it resets so an operator waits instead of
# investigating a network fault.
github_response_ok() {
  response_status="$1"
  response_headers="$2"
  case "$response_status" in
    200) return 0 ;;
    403|429)
      remaining="$(tr -d '\r' < "$response_headers" | awk -F': *' 'tolower($1) == "x-ratelimit-remaining" { print $2; exit }')"
      if [ "$remaining" = 0 ]; then
        reset_epoch="$(tr -d '\r' < "$response_headers" | awk -F': *' 'tolower($1) == "x-ratelimit-reset" { print $2; exit }')"
        case "$reset_epoch" in ''|*[!0-9]*) reset_at=unknown ;; *) reset_at="$(date -u -d "@$reset_epoch" +%H:%M 2>/dev/null || echo unknown)" ;; esac
        echo "UPDATE_RELEASE_RATE_LIMITED $reset_at" >&2
        operator_error \
          "GitHub's anonymous download allowance for this network is used up. Try again after $reset_at UTC." \
          "Анонимният лимит на GitHub за тази мрежа е изчерпан. Опитайте отново след $reset_at UTC."
        return 1
      fi
      ;;
  esac
  echo "UPDATE_RELEASE_HTTP_$response_status" >&2
  return 1
}

update_io_lock_acquire prepare
io_owned=1
update_transition_write PREPARING prepare "$request_id" "$version" UPDATE_PREPARING -
update_projection_write preparing UPDATE_PREPARING "$version"

local_assets="${HOSPITAL_UPDATE_LOCAL_ASSET_DIRECTORY:-}"
if [ -n "$local_assets" ]; then
  [ "${HOSPITAL_UPDATE_TEST_ONLY:-0}" = 1 ] || { echo UPDATE_LOCAL_SOURCE_REFUSED >&2; exit 1; }
  local_assets="$(CDPATH= cd -- "$local_assets" 2>/dev/null && pwd -P)" \
    || { echo UPDATE_LOCAL_SOURCE_INVALID >&2; exit 1; }
  cp "$local_assets/release.json" "$metadata"
else
  metadata_headers="$work/metadata-headers"
  metadata_status="$(curl --proto '=https' --tlsv1.2 --max-redirs 0 \
    --silent --show-error --max-time 60 --dump-header "$metadata_headers" --output "$metadata" \
    --write-out '%{http_code}' \
    --header 'Accept: application/vnd.github+json' \
    --header 'X-GitHub-Api-Version: 2026-03-10' \
    "$api_origin/repos/$repository/releases/tags/hospital-$version")" \
    || { echo UPDATE_RELEASE_METADATA_FETCH_FAILED >&2; exit 1; }
  github_response_ok "$metadata_status" "$metadata_headers" \
    || { echo UPDATE_RELEASE_METADATA_FETCH_FAILED >&2; exit 1; }
fi

python3 "$root/scripts/update-release-metadata.py" parse-release \
  "$metadata" "$version" "$repository" > "$metadata_tsv" \
  || { echo UPDATE_RELEASE_METADATA_INVALID >&2; exit 1; }

metadata_tab="$(printf '\t')"
IFS="$metadata_tab" read -r metadata_header metadata_version metadata_tag metadata_commit \
  metadata_run metadata_attempt metadata_lock_sha metadata_signature_sha metadata_release_id \
  metadata_repository metadata_extra < "$metadata_tsv"
[ -z "${metadata_extra:-}" ] && [ "$metadata_header" = LOSPOR-HOSPITAL-RELEASE-METADATA-V1 ] \
  || { echo UPDATE_RELEASE_METADATA_INVALID >&2; exit 1; }

asset_record() {
  sought="$1"
  awk -F '\t' -v sought="$sought" '$1 == "asset" && $2 == sought { print $3 "\t" $4 "\t" $5 }' "$metadata_tsv"
}

download_asset() {
  asset_name="$1"
  record="$(asset_record "$asset_name")"
  [ -n "$record" ] || { echo "UPDATE_RELEASE_ASSET_MISSING $asset_name" >&2; return 1; }
  IFS="$metadata_tab" read -r asset_id asset_size asset_digest asset_extra <<EOF
$record
EOF
  [ -z "${asset_extra:-}" ] || return 1
  destination="$assets/$asset_name"
  temporary="$destination.tmp"
  if [ -n "$local_assets" ]; then
    [ -f "$local_assets/$asset_name" ] && [ ! -L "$local_assets/$asset_name" ] || return 1
    cp "$local_assets/$asset_name" "$temporary"
  else
    headers="$work/headers-$asset_id"
    body="$work/body-$asset_id"
    http_status="$(curl --proto '=https' --tlsv1.2 --max-redirs 0 \
      --silent --show-error --max-time 300 --dump-header "$headers" --output "$body" \
      --write-out '%{http_code}' --header 'Accept: application/octet-stream' \
      --header 'X-GitHub-Api-Version: 2026-03-10' \
      "$api_origin/repos/$repository/releases/assets/$asset_id")" \
      || { echo "UPDATE_RELEASE_ASSET_FETCH_FAILED $asset_name" >&2; return 1; }
    case "$http_status" in
      200) mv "$body" "$temporary" ;;
      302)
        [ "$(grep -Eic '^location:' "$headers")" = 1 ] || return 1
        redirect="$(sed -n 's/^[Ll]ocation:[[:space:]]*//p' "$headers" | tr -d '\r' | head -n 1)"
        redirect="$(python3 "$root/scripts/update-release-metadata.py" validate-redirect "$redirect")" \
          || { echo UPDATE_RELEASE_REDIRECT_REFUSED >&2; return 1; }
        curl --proto '=https' --tlsv1.2 --max-redirs 0 --fail --silent --show-error \
          --max-time 1800 "$redirect" > "$temporary" \
          || { echo "UPDATE_RELEASE_ASSET_FETCH_FAILED $asset_name" >&2; return 1; }
        ;;
      403|429) github_response_ok "$http_status" "$headers" || true; echo "UPDATE_RELEASE_ASSET_FETCH_FAILED $asset_name" >&2; return 1 ;;
      *) echo "UPDATE_RELEASE_ASSET_HTTP_$http_status $asset_name" >&2; return 1 ;;
    esac
  fi
  actual_size="$(wc -c < "$temporary" | tr -d '[:space:]')"
  [ "$actual_size" = "$asset_size" ] || { echo "UPDATE_RELEASE_ASSET_SIZE_MISMATCH $asset_name" >&2; return 1; }
  if [ "$asset_digest" != - ]; then
    [ "sha256:$(sha256sum "$temporary" | awk '{print $1}')" = "$asset_digest" ] \
      || { echo "UPDATE_RELEASE_ASSET_DIGEST_MISMATCH $asset_name" >&2; return 1; }
  fi
  chmod 0400 "$temporary"
  update_durable_replace "$temporary" "$destination"
}

prefix="lospor-hospital-$version"
download_total=0
for suffix in deployment.tar.gz manifest.json release.lock release.lock.sha256 release.lock.sig security-evidence.tar.gz; do
  name="$prefix-$suffix"
  record="$(asset_record "$name")"
  [ -n "$record" ] || { echo "UPDATE_RELEASE_ASSET_MISSING $name" >&2; exit 1; }
  size="$(printf '%s\n' "$record" | cut -f2)"
  download_total=$((download_total + size))
done
sh "$root/scripts/update-capacity.sh" prepare "$download_total" >/dev/null
for suffix in deployment.tar.gz manifest.json release.lock release.lock.sha256 release.lock.sig security-evidence.tar.gz; do
  download_asset "$prefix-$suffix" || exit 1
done
# Signed redirect responses are needed only while downloading. Never carry them
# into the persistent prepared-release tree.
rm -f "$work"/metadata-headers "$work"/headers-* "$work"/body-* 2>/dev/null || true

lock="$assets/$prefix-release.lock"
checksum="$lock.sha256"
[ "$(sha256sum "$lock" | awk '{print $1}')" = "$metadata_lock_sha" ] \
  || { echo UPDATE_RELEASE_LOCK_METADATA_MISMATCH >&2; exit 1; }
[ "$(sha256sum "$lock.sig" | awk '{print $1}')" = "$metadata_signature_sha" ] \
  || { echo UPDATE_RELEASE_SIGNATURE_METADATA_MISMATCH >&2; exit 1; }
HOSPITAL_EXPECTED_RELEASE="$version" HOSPITAL_REQUIRE_RELEASE_SIGNATURE=1 \
  sh "$root/scripts/verify-release.sh" "$lock" "$checksum" "$assets" deployment

lock_identity="$(awk -F '\t' '$1 == "release" { print $2 "\t" $3 "\t" $4 }' "$lock")"
[ "$lock_identity" = "$version${metadata_tab}$metadata_tag${metadata_tab}$metadata_commit" ] \
  || { echo UPDATE_RELEASE_IDENTITY_MISMATCH >&2; exit 1; }
verify_locked_artifact() {
  role="$1"; filename="$2"
  record="$(awk -F '\t' -v role="$role" -v filename="$filename" '$1 == "artifact" && $2 == role && $4 == filename { print $5 "\t" $6 }' "$lock")"
  [ -n "$record" ] || return 1
  expected_bytes="$(printf '%s\n' "$record" | cut -f1)"
  expected_sha="$(printf '%s\n' "$record" | cut -f2)"
  [ "$(wc -c < "$assets/$filename" | tr -d '[:space:]')" = "$expected_bytes" ] \
    && [ "$(sha256sum "$assets/$filename" | awk '{print $1}')" = "$expected_sha" ]
}
verify_locked_artifact manifest "$prefix-manifest.json" || { echo UPDATE_RELEASE_MANIFEST_MISMATCH >&2; exit 1; }
verify_locked_artifact security-evidence "$prefix-security-evidence.tar.gz" || { echo UPDATE_RELEASE_EVIDENCE_MISMATCH >&2; exit 1; }

compatibility="$work/release-compatibility.tsv"
tar -xOf "$assets/$prefix-deployment.tar.gz" "$prefix/release-compatibility.tsv" > "$compatibility" \
  || { echo UPDATE_COMPATIBILITY_METADATA_MISSING >&2; exit 1; }
. "$root/scripts/release-compatibility.sh"
release_compatibility_read "$compatibility"
release_compatibility_assert_version "$version"
for migration in "$compatibility_schema_min" "$compatibility_schema_max"; do
  tar -tzf "$assets/$prefix-deployment.tar.gz" \
    | grep -Fxq "$prefix/apps/api/prisma/migrations/$migration/migration.sql" \
    || { echo "UPDATE_COMPATIBILITY_SCHEMA_MISSING $migration" >&2; exit 1; }
done
if [ "$compatibility_rollback_policy" = service-compatible ]; then
  proof="$work/rollback-compatibility-proof.json"
  tar -xOf "$assets/$prefix-deployment.tar.gz" "$prefix/rollback-compatibility-proof.json" > "$proof" \
    || { echo UPDATE_ROLLBACK_PROOF_MISSING >&2; exit 1; }
  [ "$(sha256sum "$proof" | awk '{print $1}')" = "$compatibility_proof_sha256" ] \
    || { echo UPDATE_ROLLBACK_PROOF_DIGEST_MISMATCH >&2; exit 1; }
  python3 "$root/scripts/rollback-compatibility-evidence.py" \
    "$proof" "$version" "$compatibility_schema_max" \
    || { echo UPDATE_ROLLBACK_PROOF_INVALID >&2; exit 1; }
fi
update_sync_path "$compatibility"
[ ! -e "${proof:-}" ] || update_sync_path "$proof"

set +e
release_state_assert_transition "$appliance_home" "$version" "$lock"
transition_result=$?
set -e
[ "$transition_result" -eq 0 ] || exit "$transition_result"

# Pull exact registry digests and verify portable OCI identities.  The launcher
# changes no service in --fetch-only mode; its old informational TSV is not a
# trust input for this pipeline.
sh "$root/scripts/run-online-release.sh" --fetch-only "$lock" "$checksum" "$assets" >/dev/null

image_set_sha="$(awk -F '\t' '$1 == "image" { print }' "$lock" | sha256sum | awk '{print $1}')"
final="$update_prepared_dir/$version"
[ ! -e "$final" ] || { echo UPDATE_PREPARED_IDENTITY_CONFLICT >&2; exit 1; }
final_assets="$final/assets"
descriptor="$work/prepared-release.v2.tsv"
printf 'LOSPOR-HOSPITAL-PREPARED-RELEASE-V2\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\n' \
  "$version" "$metadata_tag" "$metadata_commit" "$metadata_run" "$metadata_attempt" \
  "$metadata_lock_sha" "$metadata_signature_sha" "$metadata_release_id" "$final_assets" \
  "$(update_now_epoch)" "$installed_version" "$image_set_sha" "$compatibility_schema_min" \
  "$compatibility_schema_max" "$compatibility_rollback_policy" "$compatibility_proof_sha256" \
  > "$descriptor"
chmod 0400 "$descriptor" "$compatibility"
update_sync_path "$descriptor"
# Parsed API metadata is no longer needed once the exact descriptor exists;
# keeping it would retain mutable publication details beside the trust input.
rm -f "$metadata" "$metadata_tsv"
mv "$work" "$final"
update_sync_path "$final"
update_sync_path "$update_prepared_dir"
work="$update_private_dir/.prepare-consumed-$$"

update_descriptor_for_version "$version" || { echo UPDATE_PREPARED_DESCRIPTOR_INVALID >&2; exit 1; }
update_transition_write PREPARED prepare "$request_id" "$version" UPDATE_PREPARED "$descriptor_lock_sha"
update_projection_write prepared UPDATE_PREPARED "$version" "" \
  "$descriptor_version" "$descriptor_lock_sha" "$descriptor_rollback_policy"

# Retain exactly one prepared release. Remove only an older prepared directory
# and its exact version tags; current and rollback release roots are elsewhere
# and are never candidates for this cleanup.
current_protected_lock=""
previous_protected_lock=""
if release_state_read "$appliance_home"; then
  current_protected_lock="$state_release_lock"
fi
previous_state="$appliance_home/.data/previous-installed-release.tsv"
if [ -f "$previous_state" ] && [ ! -L "$previous_state" ] \
  && [ "$(wc -l < "$previous_state" | tr -d '[:space:]')" = 1 ]; then
  IFS="$metadata_tab" read -r previous_header previous_version previous_relative previous_sha previous_extra < "$previous_state" || true
  if [ -z "${previous_extra:-}" ] \
    && [ "$previous_header" = LOSPOR-HOSPITAL-INSTALLED-RELEASE-V1 ] \
    && update_valid_version "$previous_version" \
    && [ "$previous_relative" = ".data/releases/$previous_version/lospor-hospital-$previous_version" ] \
    && update_valid_sha "$previous_sha"; then
    previous_candidate="$appliance_home/$previous_relative/.release/release.lock"
    if release_lock_checksum_verify "$previous_candidate" "$previous_candidate.sha256" \
      && [ "$release_lock_checksum_sha" = "$previous_sha" ]; then
      previous_protected_lock="$previous_candidate"
    fi
  fi
fi
image_is_protected() {
  protected_reference="$1"
  for protected_lock in "$current_protected_lock" "$previous_protected_lock"; do
    [ -n "$protected_lock" ] || continue
    awk -F '\t' -v reference="$protected_reference" \
      '$1 == "image" && $3 == reference { found=1 } END { exit !found }' "$protected_lock" \
      && return 0
  done
  return 1
}
for obsolete_descriptor in "$update_prepared_dir"/*/prepared-release.v2.tsv; do
  [ -e "$obsolete_descriptor" ] || continue
  [ "$obsolete_descriptor" = "$final/prepared-release.v2.tsv" ] && continue
  if update_descriptor_read "$obsolete_descriptor"; then
    obsolete_version="$descriptor_version"
    obsolete_root="$update_prepared_dir/$obsolete_version"
    while IFS="$metadata_tab" read -r kind image_name image_reference rest; do
      [ "$kind" = image ] || continue
      image_is_protected "$image_reference" \
        || docker image rm "$image_reference" >/dev/null 2>&1 || true
    done < "$descriptor_lock"
    case "$obsolete_root" in "$update_prepared_dir/"*) rm -rf "$obsolete_root" ;; esac
  fi
done

update_io_lock_release
io_owned=0
trap - EXIT HUP INT TERM
operator_say \
  "Release $version is downloaded, signed, verified, and prepared. Running services were not changed." \
  "Версия $version е изтеглена, подписът и съдържанието са проверени и версията е подготвена. Работещите услуги не са променени."
