#!/bin/sh
set -eu

# Verify a canonical Hospital release lock against the exact SHA-256 selected
# by the operator, using only standard Ubuntu command-line tools. This runs
# before Docker loads or starts release images, so it cannot depend on code
# contained in the bundle.

lock="${1:-}"
lock_checksum="${2:-}"
artifact_directory="${3:-.}"
mode="${4:-all}"

if [ -z "$lock" ] || [ -z "$lock_checksum" ]; then
  echo "Usage: ./scripts/verify-release.sh <release.lock> <release.lock.sha256> [artifact-directory] [all|offline|deployment|none]" >&2
  exit 2
fi
case "$mode" in all|offline|deployment|none) ;; *) echo "Invalid verification mode: $mode" >&2; exit 2 ;; esac
for command_name in sha256sum awk basename wc tr grep sed tail; do
  command -v "$command_name" >/dev/null 2>&1 || { echo "$command_name is required." >&2; exit 1; }
done
test -s "$lock" || { echo "Release lock is missing or empty: $lock" >&2; exit 1; }
test -s "$lock_checksum" || { echo "Release-lock checksum is missing or empty: $lock_checksum" >&2; exit 1; }
test -d "$artifact_directory" || { echo "Artifact directory does not exist: $artifact_directory" >&2; exit 1; }

# The sidecar is deliberately narrower than the formats accepted by
# sha256sum(1): exactly one lowercase digest, two spaces, this lock's basename,
# and one LF. This binds the independently recorded digest to the intended file
# and rejects CRLF, absolute paths, aliases, extra records, and parser tricks.
lock_name="$(basename "$lock")"
checksum_name="$(basename "$lock_checksum")"
case "$lock_name" in
  ""|-*|*..*|*/*|*\\*) echo "Unsafe release-lock filename: $lock_name" >&2; exit 1 ;;
esac
printf '%s\n' "$lock_name" | grep -Eq '^[A-Za-z0-9][A-Za-z0-9._-]*$' \
  || { echo "Unsafe release-lock filename: $lock_name" >&2; exit 1; }
test "$checksum_name" = "$lock_name.sha256" \
  || { echo "Release-lock checksum must be named $lock_name.sha256." >&2; exit 1; }
checksum_bytes="$(wc -c < "$lock_checksum" | tr -d '[:space:]')"
expected_checksum_bytes=$((67 + ${#lock_name}))
test "$checksum_bytes" = "$expected_checksum_bytes" \
  || { echo "Release-lock checksum is not in canonical format." >&2; exit 1; }
grep -Eq '^[a-f0-9]{64}  [A-Za-z0-9][A-Za-z0-9._-]*$' "$lock_checksum" \
  || { echo "Release-lock checksum is not in canonical format." >&2; exit 1; }
expected_sha="$(awk -v expected_name="$lock_name" '
  NR == 1 && substr($0, 67) == expected_name { value = substr($0, 1, 64); valid = 1 }
  END { if (NR != 1 || !valid) exit 1; print value }
' "$lock_checksum")" \
  || { echo "Release-lock checksum is not in canonical format." >&2; exit 1; }
actual_lock_sha="$(sha256sum "$lock" | awk '{print $1}')"
test "$actual_lock_sha" = "$expected_sha" \
  || { echo "Release lock does not match the independently selected SHA-256." >&2; exit 1; }

# A signature, when this appliance holds a key to check it with.
#
# The digest above is the operator's own copy, carried by a route the registry
# does not control, and it stays the primary gate for a manual install. The
# signature answers a different question -- whether the maintainer published
# these bytes -- and that is what an unattended fetch needs, because no operator
# is present to carry a digest.
#
# An absent key and an absent signature are not the same thing.
#
# A site with no key pinned is running the older arrangement and proceeds on the
# digest alone. A site that HAS pinned a key requires a signature, always: the
# pinned key is that site's standing statement that it has adopted signing, and
# nothing that arrives with a download may withdraw it.
#
# That last point is the whole reason this is not a switch. If a missing .sig
# merely skipped the check, an attacker who could serve a modified release would
# delete the signature and the appliance would fall back to digest-only -- the
# weaker arrangement pinning exists to replace, re-entered silently and at the
# attacker's choosing. A stripped signature must be as fatal as a forged one.
signing_key="${HOSPITAL_RELEASE_SIGNING_KEY:-}"
if [ -z "$signing_key" ]; then
  verify_root="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd -P)"
  for candidate in \
    "$verify_root/.lospor-home/secrets/release-signing-public.pem" \
    "$verify_root/secrets/release-signing-public.pem"
  do
    if [ -s "$candidate" ]; then signing_key="$candidate"; break; fi
  done
fi
lock_signature="$lock.sig"
if [ -n "$signing_key" ]; then
  test -s "$lock_signature" || {
    echo "THIS RELEASE IS NOT SIGNED." >&2
    echo >&2
    echo "  expected signature  $lock_signature" >&2
    echo "  pinned key          $signing_key" >&2
    echo >&2
    echo "This appliance has pinned a release signing key, so every release must" >&2
    echo "carry a signature made by it. A missing signature is treated exactly like" >&2
    echo "a bad one: either this is not a genuine release, or the signature was" >&2
    echo "removed in transit to make this appliance accept it on the digest alone." >&2
    exit 1
  }
  sh "$(dirname "$0")/verify-release-signature.sh" \
    "$lock" "$lock_signature" "$signing_key" \
    || { echo "Refusing this release." >&2; exit 1; }
elif [ "${HOSPITAL_REQUIRE_RELEASE_SIGNATURE:-0}" = 1 ]; then
  # No key pinned, but this site has declared it will not install unsigned
  # releases. Kept so a site can guarantee it is not silently running unpinned.
  echo "A signature is required but no signing key is pinned on this appliance." >&2
  exit 1
fi

test "$(tail -c 1 "$lock" | wc -l | tr -d '[:space:]')" = 1 \
  || { echo "Release lock is not canonically newline-terminated." >&2; exit 1; }

header="$(sed -n '1p' "$lock")"
test "$header" = "LOSPOR-HOSPITAL-RELEASE-LOCK-V2" \
  || { echo "Unsupported release-lock format." >&2; exit 1; }

tab="$(printf '\t')"
line_number=0
release_count=0
manifest_count=0
deployment_count=0
evidence_count=0
offline_count=0
image_count=0
version=""
record_phase=header
while IFS="$tab" read -r kind field2 field3 field4 field5 field6 field7 field8 extra; do
  line_number=$((line_number + 1))
  if [ "$line_number" -eq 1 ]; then continue; fi
  test -z "${extra:-}" || { echo "Unexpected extra field on release-lock line $line_number." >&2; exit 1; }
  case "$kind" in
    release)
      test "$record_phase" = header || { echo "Release identity is out of order." >&2; exit 1; }
      test -n "$field7" || { echo "Incomplete release identity." >&2; exit 1; }
      test -z "${field8:-}" || { echo "Unexpected release field on line $line_number." >&2; exit 1; }
      release_count=$((release_count + 1))
      test "$release_count" -eq 1 || { echo "Duplicate release identity." >&2; exit 1; }
      version="$field2"
      printf '%s\n' "$version" | grep -Eq '^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$' \
        || { echo "Invalid release version." >&2; exit 1; }
      test "$field3" = "hospital-$version" || { echo "Release tag and version disagree." >&2; exit 1; }
      printf '%s\n' "$field4" | grep -Eq '^[a-f0-9]{40}$' || { echo "Invalid release Git commit." >&2; exit 1; }
      test "$field5" = "linux/amd64" || { echo "Unsupported release platform: $field5" >&2; exit 1; }
      printf '%s\n' "$field6" | grep -Eq '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$' \
        || { echo "Invalid release timestamp." >&2; exit 1; }
      printf '%s\n' "$field7" | grep -Eq '^[a-f0-9]{64}$' || { echo "Invalid provenance checksum." >&2; exit 1; }
      if [ -n "${HOSPITAL_EXPECTED_RELEASE:-}" ] && [ "$version" != "$HOSPITAL_EXPECTED_RELEASE" ]; then
        echo "Expected Hospital $HOSPITAL_EXPECTED_RELEASE, but lock is for $version." >&2
        exit 1
      fi
      record_phase=release
      ;;
    artifact)
      test -z "${field7:-}" && test -z "${field8:-}" \
        || { echo "Unexpected artifact field on line $line_number." >&2; exit 1; }
      test "$release_count" -eq 1 || { echo "Artifact precedes release identity." >&2; exit 1; }
      printf '%s\n' "$field4" | grep -Eq '^[A-Za-z0-9][A-Za-z0-9._-]*$' \
        || { echo "Unsafe artifact filename on line $line_number." >&2; exit 1; }
      case "$field4" in -*|*..*|*/*|*\\*) echo "Unsafe artifact filename: $field4" >&2; exit 1 ;; esac
      printf '%s\n' "$field5" | grep -Eq '^[1-9][0-9]*$' || { echo "Invalid artifact size." >&2; exit 1; }
      printf '%s\n' "$field6" | grep -Eq '^[a-f0-9]{64}$' || { echo "Invalid artifact checksum." >&2; exit 1; }
      case "$field2" in
        manifest)
          test "$record_phase" = release || { echo "JSON manifest artifact is out of order." >&2; exit 1; }
          manifest_count=$((manifest_count + 1))
          test "$manifest_count" -eq 1 && test "$field3" = 000 \
            || { echo "Duplicate or misordered JSON manifest artifact." >&2; exit 1; }
          test "$field4" = "lospor-hospital-$version-manifest.json" \
            || { echo "Unexpected JSON manifest filename." >&2; exit 1; }
          verify_this=0
          case "$mode" in all) verify_this=1 ;; esac
          record_phase=manifest
          ;;
        deployment)
          test "$record_phase" = manifest || { echo "Deployment artifact is out of order." >&2; exit 1; }
          deployment_count=$((deployment_count + 1))
          test "$deployment_count" -eq 1 && test "$field3" = 000 \
            || { echo "Duplicate or misordered deployment artifact." >&2; exit 1; }
          test "$field4" = "lospor-hospital-$version-deployment.tar.gz" \
            || { echo "Unexpected deployment filename." >&2; exit 1; }
          verify_this=0
          case "$mode" in all|deployment) verify_this=1 ;; esac
          record_phase=deployment
          ;;
        security-evidence)
          test "$record_phase" = deployment || { echo "Security evidence artifact is out of order." >&2; exit 1; }
          evidence_count=$((evidence_count + 1))
          test "$evidence_count" -eq 1 && test "$field3" = 000 \
            || { echo "Duplicate or misordered security evidence artifact." >&2; exit 1; }
          test "$field4" = "lospor-hospital-$version-security-evidence.tar.gz" \
            || { echo "Unexpected security-evidence filename." >&2; exit 1; }
          verify_this=0
          case "$mode" in all) verify_this=1 ;; esac
          record_phase=security-evidence
          ;;
        offline-part)
          case "$record_phase" in security-evidence|offline-part) ;; *) echo "Offline part is out of order." >&2; exit 1 ;; esac
          expected_index="$(printf '%03d' "$offline_count")"
          test "$field3" = "$expected_index" || { echo "Offline parts are missing, duplicated, or out of order." >&2; exit 1; }
          test "$field4" = "lospor-hospital-$version-images.tar.gz.part-$expected_index" \
            || { echo "Unexpected offline-part filename." >&2; exit 1; }
          test "$field5" -le 1992294400 || { echo "Offline part exceeds 1.9 GiB: $field4" >&2; exit 1; }
          offline_count=$((offline_count + 1))
          verify_this=0
          case "$mode" in all|offline) verify_this=1 ;; esac
          record_phase=offline-part
          ;;
        *) echo "Unknown artifact role: $field2" >&2; exit 1 ;;
      esac
      if [ "$verify_this" -eq 1 ]; then
        artifact_path="$artifact_directory/$field4"
        test -f "$artifact_path" || { echo "Required artifact is missing: $field4" >&2; exit 1; }
        actual_bytes="$(wc -c < "$artifact_path" | tr -d '[:space:]')"
        test "$actual_bytes" = "$field5" || { echo "Artifact size mismatch: $field4" >&2; exit 1; }
        actual_artifact_sha="$(sha256sum "$artifact_path" | awk '{print $1}')"
        test "$actual_artifact_sha" = "$field6" || { echo "Artifact checksum mismatch: $field4" >&2; exit 1; }
      fi
      ;;
    image)
      case "$record_phase" in offline-part|image) ;; *) echo "Image records are out of order." >&2; exit 1 ;; esac
      test "$release_count" -eq 1 || { echo "Image precedes release identity." >&2; exit 1; }
      case "$image_count:$field2" in
        0:api|1:browser|2:caddy|3:curl-worker|4:migrate|5:postgres|6:pwa|7:status|8:tools|9:web) ;;
        *) echo "Images are missing, duplicated, unexpected, or out of order at '$field2'." >&2; exit 1 ;;
      esac
      expected_reference="ghcr.io/kaloyandjunow-prog/lospor-hospital-$field2:$version"
      test "$field3" = "$expected_reference" || { echo "Wrong image reference for $field2." >&2; exit 1; }
      printf '%s\n' "$field4" | grep -Eq '^sha256:[a-f0-9]{64}$' || { echo "Invalid registry digest for $field2." >&2; exit 1; }
      printf '%s\n' "$field5" | grep -Eq '^sha256:[a-f0-9]{64}$' || { echo "Invalid platform manifest digest for $field2." >&2; exit 1; }
      printf '%s\n' "$field6" | grep -Eq '^sha256:[a-f0-9]{64}$' || { echo "Invalid image config digest for $field2." >&2; exit 1; }
      test "$field7" = "linux/amd64" || { echo "Wrong platform for $field2." >&2; exit 1; }
      printf '%s\n' "$field8" | grep -Eq '^sha256:[a-f0-9]{64}(,sha256:[a-f0-9]{64})*$' \
        || { echo "Invalid root filesystem diff IDs for $field2." >&2; exit 1; }
      image_count=$((image_count + 1))
      record_phase=image
      ;;
    *) echo "Unknown release-lock record '$kind' on line $line_number." >&2; exit 1 ;;
  esac
done < "$lock"

test "$release_count" -eq 1 || { echo "Release lock has no release identity." >&2; exit 1; }
test "$manifest_count" -eq 1 || { echo "Release lock must contain one JSON manifest artifact." >&2; exit 1; }
test "$deployment_count" -eq 1 || { echo "Release lock must contain one deployment artifact." >&2; exit 1; }
test "$evidence_count" -eq 1 || { echo "Release lock must contain one security-evidence artifact." >&2; exit 1; }
test "$offline_count" -ge 1 || { echo "Release lock contains no offline image parts." >&2; exit 1; }
test "$image_count" -eq 10 || { echo "Release lock must contain exactly ten images." >&2; exit 1; }

echo "Release $version verified with release-lock sha256:$actual_lock_sha"
