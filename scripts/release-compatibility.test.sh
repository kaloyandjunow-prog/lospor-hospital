#!/bin/sh
set -eu

root="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd -P)"
. "$root/scripts/release-compatibility.sh"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT HUP INT TERM
tests=0
ok() { tests=$((tests + 1)); printf 'ok %s - %s\n' "$tests" "$1"; }
refuse() {
  name="$1"; shift
  if release_compatibility_read "$work/value.tsv" >/dev/null 2>&1; then
    echo "FAIL: accepted $name" >&2
    exit 1
  fi
  ok "refuses $name"
}

cp "$root/release-compatibility.tsv" "$work/value.tsv"
release_compatibility_read "$work/value.tsv"
release_compatibility_assert_version 1.2.0
[ "$compatibility_rollback_policy" = backup-required ]
ok "reads the shipped backup-recovery policy"

printf 'LOSPOR-HOSPITAL-RELEASE-COMPATIBILITY-V1\t1.3.0\t20260530000000_init\t20260822180000_additive\tservice-compatible\t%s\t30\n' \
  "$(printf proof | sha256sum | awk '{print $1}')" > "$work/value.tsv"
release_compatibility_read "$work/value.tsv"
[ "$compatibility_rollback_policy" = service-compatible ]
ok "accepts a service rollback only with proof and a window"

printf 'LOSPOR-HOSPITAL-RELEASE-COMPATIBILITY-V1\t1.3.0\t20260530000000_init\t20260822180000_additive\tservice-compatible\t-\t30\n' > "$work/value.tsv"
refuse "a proofless service rollback"
printf 'LOSPOR-HOSPITAL-RELEASE-COMPATIBILITY-V1\t1.3.0\t20260822180000_additive\t20260530000000_init\tbackup-required\t-\t0\n' > "$work/value.tsv"
refuse "a reversed schema range"
printf 'LOSPOR-HOSPITAL-RELEASE-COMPATIBILITY-V1\t1.3.0\t20260530000000_init\t20260822180000_additive\tservice-compatible\t%s\t999999999999999999\n' "$(printf proof | sha256sum | awk '{print $1}')" > "$work/value.tsv"
refuse "an unbounded rollback window"
printf 'LOSPOR-HOSPITAL-RELEASE-COMPATIBILITY-V1\t1.3.0\t../../etc/passwd\t20260822180000_additive\tbackup-required\t-\t0\n' > "$work/value.tsv"
refuse "a malformed schema boundary"
printf 'LOSPOR-HOSPITAL-RELEASE-COMPATIBILITY-V1\t1.3.0\t20260530000000_init\t20260822180000_additive\tbackup-required\t%s\t0\n' "$(printf fake | sha256sum | awk '{print $1}')" > "$work/value.tsv"
refuse "a backup-only release claiming proof"
printf 'LOSPOR-HOSPITAL-RELEASE-COMPATIBILITY-V1\t1.3.0\t20260530000000_init\t20260822180000_additive\tbackup-required\t-\t0\textra\n' > "$work/value.tsv"
refuse "an extra field"
printf 'LOSPOR-HOSPITAL-RELEASE-COMPATIBILITY-V1\t1.3.0\t20260530000000_init\t20260822180000_additive\tbackup-required\t-\t0\t\n' > "$work/value.tsv"
refuse "an empty trailing field"
printf 'release compatibility tests passed (%s)\n' "$tests"
