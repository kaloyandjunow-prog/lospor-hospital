#!/bin/sh
set -eu

# Verify a canonical Hospital release lock using only OpenSSL and standard
# Ubuntu command-line tools. This deliberately runs before Docker loads or
# starts release images, so it cannot depend on code contained in the bundle.

lock="${1:-}"
signature="${2:-}"
public_key="${3:-}"
artifact_directory="${4:-.}"
mode="${5:-all}"

if [ -z "$lock" ] || [ -z "$signature" ] || [ -z "$public_key" ]; then
  echo "Usage: ./scripts/verify-release.sh <release.lock> <release.lock.sig> <trusted-public-key.pem> [artifact-directory] [all|offline|deployment|none]" >&2
  exit 2
fi
case "$mode" in all|offline|deployment|none) ;; *) echo "Invalid verification mode: $mode" >&2; exit 2 ;; esac
for command_name in openssl sha256sum awk wc tr grep sed mktemp; do
  command -v "$command_name" >/dev/null 2>&1 || { echo "$command_name is required." >&2; exit 1; }
done
test -s "$lock" || { echo "Release lock is missing or empty: $lock" >&2; exit 1; }
test -s "$signature" || { echo "Release-lock signature is missing or empty: $signature" >&2; exit 1; }
test -s "$public_key" || { echo "Trusted release public key is missing or empty: $public_key" >&2; exit 1; }
test -d "$artifact_directory" || { echo "Artifact directory does not exist: $artifact_directory" >&2; exit 1; }

temporary_directory="$(mktemp -d)"
trap 'rm -rf "$temporary_directory"' EXIT HUP INT TERM
decoded_signature="$temporary_directory/release-lock.sig"
openssl pkey -pubin -in "$public_key" -text -noout 2>/dev/null \
  | grep -q '^ED25519 Public-Key:' \
  || { echo "Trusted release key is not a valid Ed25519 public key." >&2; exit 1; }
openssl base64 -d -A -in "$signature" -out "$decoded_signature" 2>/dev/null \
  || { echo "Release-lock signature is not valid base64." >&2; exit 1; }
test "$(wc -c < "$decoded_signature" | tr -d '[:space:]')" = 64 \
  || { echo "Release-lock signature has the wrong length." >&2; exit 1; }
openssl pkeyutl -verify -pubin -inkey "$public_key" -rawin \
  -in "$lock" -sigfile "$decoded_signature" >/dev/null 2>&1 \
  || { echo "Release-lock signature is invalid." >&2; exit 1; }

header="$(sed -n '1p' "$lock")"
test "$header" = "LOSPOR-HOSPITAL-RELEASE-LOCK-V1" \
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
while IFS="$tab" read -r kind field2 field3 field4 field5 field6 field7 extra; do
  line_number=$((line_number + 1))
  if [ "$line_number" -eq 1 ]; then continue; fi
  test -z "${extra:-}" || { echo "Unexpected extra field on release-lock line $line_number." >&2; exit 1; }
  case "$kind" in
    release)
      test -n "$field7" || { echo "Incomplete release identity." >&2; exit 1; }
      release_count=$((release_count + 1))
      test "$release_count" -eq 1 || { echo "Duplicate release identity." >&2; exit 1; }
      version="$field2"
      printf '%s\n' "$version" | grep -Eq '^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$' \
        || { echo "Invalid release version." >&2; exit 1; }
      test "$field3" = "hospital-$version" || { echo "Release tag and version disagree." >&2; exit 1; }
      printf '%s\n' "$field4" | grep -Eq '^[a-f0-9]{40}$' || { echo "Invalid release Git commit." >&2; exit 1; }
      test "$field5" = "linux/amd64" || { echo "Unsupported release platform: $field5" >&2; exit 1; }
      printf '%s\n' "$field6" | grep -Eq '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9:.]+Z$' \
        || { echo "Invalid release timestamp." >&2; exit 1; }
      printf '%s\n' "$field7" | grep -Eq '^[a-f0-9]{64}$' || { echo "Invalid provenance checksum." >&2; exit 1; }
      if [ -n "${HOSPITAL_EXPECTED_RELEASE:-}" ] && [ "$version" != "$HOSPITAL_EXPECTED_RELEASE" ]; then
        echo "Expected Hospital $HOSPITAL_EXPECTED_RELEASE, but lock is for $version." >&2
        exit 1
      fi
      ;;
    artifact)
      test -z "${field7:-}" || { echo "Unexpected artifact field on line $line_number." >&2; exit 1; }
      test "$release_count" -eq 1 || { echo "Artifact precedes release identity." >&2; exit 1; }
      printf '%s\n' "$field4" | grep -Eq '^[A-Za-z0-9][A-Za-z0-9._-]*$' \
        || { echo "Unsafe artifact filename on line $line_number." >&2; exit 1; }
      case "$field4" in -*|*..*|*/*|*\\*) echo "Unsafe artifact filename: $field4" >&2; exit 1 ;; esac
      printf '%s\n' "$field5" | grep -Eq '^[1-9][0-9]*$' || { echo "Invalid artifact size." >&2; exit 1; }
      printf '%s\n' "$field6" | grep -Eq '^[a-f0-9]{64}$' || { echo "Invalid artifact checksum." >&2; exit 1; }
      case "$field2" in
        manifest)
          manifest_count=$((manifest_count + 1))
          test "$manifest_count" -eq 1 && test "$field3" = 000 \
            || { echo "Duplicate or misordered JSON manifest artifact." >&2; exit 1; }
          test "$field4" = "lospor-hospital-$version-manifest.json" \
            || { echo "Unexpected JSON manifest filename." >&2; exit 1; }
          verify_this=0
          case "$mode" in all) verify_this=1 ;; esac
          ;;
        deployment)
          deployment_count=$((deployment_count + 1))
          test "$deployment_count" -eq 1 && test "$field3" = 000 \
            || { echo "Duplicate or misordered deployment artifact." >&2; exit 1; }
          test "$field4" = "lospor-hospital-$version-deployment.tar.gz" \
            || { echo "Unexpected deployment filename." >&2; exit 1; }
          verify_this=0
          case "$mode" in all|deployment) verify_this=1 ;; esac
          ;;
        security-evidence)
          evidence_count=$((evidence_count + 1))
          test "$evidence_count" -eq 1 && test "$field3" = 000 \
            || { echo "Duplicate or misordered security evidence artifact." >&2; exit 1; }
          test "$field4" = "lospor-hospital-$version-security-evidence.tar.gz" \
            || { echo "Unexpected security-evidence filename." >&2; exit 1; }
          verify_this=0
          case "$mode" in all) verify_this=1 ;; esac
          ;;
        offline-part)
          expected_index="$(printf '%03d' "$offline_count")"
          test "$field3" = "$expected_index" || { echo "Offline parts are missing, duplicated, or out of order." >&2; exit 1; }
          test "$field4" = "lospor-hospital-$version-images.tar.gz.part-$expected_index" \
            || { echo "Unexpected offline-part filename." >&2; exit 1; }
          test "$field5" -le 1992294400 || { echo "Offline part exceeds 1.9 GiB: $field4" >&2; exit 1; }
          offline_count=$((offline_count + 1))
          verify_this=0
          case "$mode" in all|offline) verify_this=1 ;; esac
          ;;
        *) echo "Unknown artifact role: $field2" >&2; exit 1 ;;
      esac
      if [ "$verify_this" -eq 1 ]; then
        artifact_path="$artifact_directory/$field4"
        test -f "$artifact_path" || { echo "Required artifact is missing: $field4" >&2; exit 1; }
        actual_bytes="$(wc -c < "$artifact_path" | tr -d '[:space:]')"
        test "$actual_bytes" = "$field5" || { echo "Artifact size mismatch: $field4" >&2; exit 1; }
        actual_sha="$(sha256sum "$artifact_path" | awk '{print $1}')"
        test "$actual_sha" = "$field6" || { echo "Artifact checksum mismatch: $field4" >&2; exit 1; }
      fi
      ;;
    image)
      test -z "${field7:-}" || { echo "Unexpected image field on line $line_number." >&2; exit 1; }
      test "$release_count" -eq 1 || { echo "Image precedes release identity." >&2; exit 1; }
      case "$image_count:$field2" in
        0:api|1:browser|2:caddy|3:curl-worker|4:migrate|5:postgres|6:pwa|7:status|8:tools|9:web) ;;
        *) echo "Images are missing, duplicated, unexpected, or out of order at '$field2'." >&2; exit 1 ;;
      esac
      case "$field2" in
        caddy) expected_reference="caddy:2.10.2-alpine" ;;
        curl-worker) expected_reference="curlimages/curl:8.17.0" ;;
        postgres) expected_reference="postgres:17.6-bookworm" ;;
        *) expected_reference="ghcr.io/kaloyandjunow-prog/lospor-hospital-$field2:$version" ;;
      esac
      test "$field3" = "$expected_reference" || { echo "Wrong image reference for $field2." >&2; exit 1; }
      printf '%s\n' "$field4" | grep -Eq '^sha256:[a-f0-9]{64}$' || { echo "Invalid registry digest for $field2." >&2; exit 1; }
      printf '%s\n' "$field5" | grep -Eq '^sha256:[a-f0-9]{64}$' || { echo "Invalid image ID for $field2." >&2; exit 1; }
      test "$field6" = "linux/amd64" || { echo "Wrong platform for $field2." >&2; exit 1; }
      image_count=$((image_count + 1))
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

fingerprint="$(openssl pkey -pubin -in "$public_key" -outform DER 2>/dev/null | sha256sum | awk '{print $1}')"
echo "Release $version verified with trusted key sha256:$fingerprint"
