#!/bin/sh
set -eu

umask 077

signals_dir="${HOSPITAL_SIGNALS_DIR:-/signals}"
signal_file="${signals_dir}/backup-status.v1.json"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
observed_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
temporary="/backups/.lospor-${stamp}.dump.tmp.$$"
checksum_temporary="/backups/.lospor-${stamp}.dump.sha256.tmp.$$"
artifact="/backups/lospor-${stamp}.dump"
checksum="${artifact}.sha256"
signal_temporary="${signals_dir}/.backup-status.v1.json.tmp.$$"

cleanup() {
  rm -f "$temporary" "$checksum_temporary" "$signal_temporary"
}
trap cleanup EXIT HUP INT TERM

fixed_error() {
  printf '%s\n' "$1" >&2
}

write_status() {
  state="$1"
  result_code="$2"
  artifact_bytes="${3:-}"

  observed_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  if [ -n "$artifact_bytes" ]; then
    artifact_fields=",\"artifactBytes\":${artifact_bytes},\"checksumAlgorithm\":\"sha256\""
  else
    artifact_fields=""
  fi

  mkdir -p "$signals_dir" || {
    fixed_error BACKUP_SIGNAL_WRITE_FAILED
    return 1
  }
  # Only if this process still owns the directory. runtime-secrets-init hands
  # /signals to the delivery worker's UID so that container can stop running as
  # root, and chmod needs FOWNER rather than DAC_OVERRIDE -- so asserting the
  # mode here fails for a root loop that no longer owns it, and took the whole
  # backup down with it. The mode is that script's to set, not this one's.
  if [ -O "$signals_dir" ] && ! chmod 755 "$signals_dir"; then
    fixed_error BACKUP_SIGNAL_WRITE_FAILED
    return 1
  fi

  # The temporary file is created in the destination directory so rename is an
  # atomic commit for readers. Values are fixed enums, UTC timestamps or
  # validated integers; no filesystem paths or command output enter the marker.
  printf '{"schemaVersion":1,"signalType":"backup","observedAt":"%s","state":"%s","resultCode":"%s"%s}\n' \
    "$observed_at" "$state" "$result_code" "$artifact_fields" \
    > "$signal_temporary" || {
      fixed_error BACKUP_SIGNAL_WRITE_FAILED
      return 1
    }
  # This file contains only fixed operational enums, a timestamp and a byte
  # count. It is intentionally readable by the unprivileged Status container.
  chmod 644 "$signal_temporary" || {
    fixed_error BACKUP_SIGNAL_WRITE_FAILED
    return 1
  }
  mv -f "$signal_temporary" "$signal_file" || {
    fixed_error BACKUP_SIGNAL_WRITE_FAILED
    return 1
  }
}

fail_backup() {
  code="$1"
  write_status FAILURE "$code" || true
  fixed_error "$code"
  exit 1
}

mkdir -p "$signals_dir" || {
  fixed_error BACKUP_SIGNAL_WRITE_FAILED
  exit 1
}

if [ -e "$artifact" ] || [ -e "$checksum" ]; then
  fail_backup ARTIFACT_FINALIZE_FAILED
fi

if ! pg_dump \
  --host=postgres \
  --username="$POSTGRES_USER" \
  --dbname="$POSTGRES_DB" \
  --format=custom \
  --compress=9 \
  --no-owner \
  --file="$temporary"; then
  fail_backup PG_DUMP_FAILED
fi

artifact_bytes="$(wc -c < "$temporary" | tr -d '[:space:]')"
case "$artifact_bytes" in
  ''|*[!0-9]*) fail_backup ARTIFACT_FINALIZE_FAILED ;;
  0) fail_backup ARTIFACT_FINALIZE_FAILED ;;
esac

digest="$(sha256sum "$temporary" 2>/dev/null | awk '{ print $1 }')" ||
  fail_backup CHECKSUM_FAILED
case "$digest" in
  ''|*[!0-9a-f]*) fail_backup CHECKSUM_FAILED ;;
esac
if [ "${#digest}" -ne 64 ]; then
  fail_backup CHECKSUM_FAILED
fi

# Publish the checksum first and the dump last. Consumers discover complete
# backups by the dump filename, so a visible dump always has its checksum.
if ! printf '%s  %s\n' "$digest" "$(basename "$artifact")" > "$checksum_temporary"; then
  fail_backup CHECKSUM_FAILED
fi
if ! mv "$checksum_temporary" "$checksum"; then
  fail_backup ARTIFACT_FINALIZE_FAILED
fi
if ! mv "$temporary" "$artifact"; then
  rm -f "$checksum"
  fail_backup ARTIFACT_FINALIZE_FAILED
fi
if ! (cd /backups && sha256sum -c "$(basename "$checksum")" >/dev/null 2>&1); then
  fail_backup CHECKSUM_FAILED
fi

if ! write_status SUCCESS BACKUP_VERIFIED "$artifact_bytes"; then
  # The backup remains a valid, verified artifact. A fixed exit code tells the
  # supervisor that its independently readable status marker was not committed.
  fixed_error BACKUP_SIGNAL_WRITE_FAILED
  exit 1
fi

printf '%s\n' BACKUP_VERIFIED
