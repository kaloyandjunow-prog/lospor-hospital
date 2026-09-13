#!/bin/sh
set -eu
set +x

# Encrypted off-host copies of verified backups, to a mounted network share or
# an SFTP server.
#
#   sudo sh /opt/lospor-hospital/current/scripts/offhost-copy.sh configure mount /mnt/lospor-backups
#   sudo sh /opt/lospor-hospital/current/scripts/offhost-copy.sh configure sftp HOST PORT USER DIRECTORY
#   sudo sh /opt/lospor-hospital/current/scripts/offhost-copy.sh test | run | drill | state | disable
#
# The copy runs here on the host, not in the backup container: that container
# has no route out of the appliance and cannot see a share mounted on the host.
# A timer runs `run` every 15 minutes.
#
# Each object leaves the host encrypted (AES-256-CTR, key from a generated
# secret) and authenticated (HMAC-SHA256 over its name, manifest digest and
# ciphertext, with a second generated secret). Both secrets live in
# secrets/backup/offhost-encryption.key, which is escrowed with secrets/. A copy
# counts only after it has been read back from the destination and matched, and
# only then is .last-offhost-verified.v1 written. A drill fetches the newest
# acknowledged copy back, authenticates and decrypts it, and restores it into a
# temporary database.
#
# Exit 0 done, 1 failed, 2 wrong usage or not configured, 4 not root,
# 75 deferred (another maintenance operation holds the lock).

root="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd -P)"
. "$root/scripts/installed-release-state.sh"
appliance_home="${LOSPOR_APPLIANCE_HOME:-$(release_state_appliance_home "$root")}"
test_only="${HOSPITAL_OFFHOST_TEST_ONLY:-0}"
[ "$test_only" = 1 ] || { if release_state_apply "$appliance_home"; then root="$state_release_root"; fi; }
. "$root/scripts/operator-locale.sh"
operator_locale_load "$appliance_home"
. "$root/scripts/update-pipeline-lib.sh"
update_appliance_home="$appliance_home"

say() { operator_say "$1" "$2"; }
die() { operator_error "$1" "$2"; exit "${3:-1}"; }
usage() {
  die "Usage: offhost-copy.sh configure mount PATH | configure sftp HOST PORT USER DIRECTORY | test | run | drill | state [--json] | disable" \
      "Употреба: offhost-copy.sh configure mount ПЪТ | configure sftp ХОСТ ПОРТ ПОТРЕБИТЕЛ ДИРЕКТОРИЯ | test | run | drill | state [--json] | disable" 2
}

[ "$test_only" = 1 ] || [ "$(id -u)" -eq 0 ] || die "Run this as root (sudo)." "Изпълнете като root (sudo)." 4

backups="$appliance_home/backups"
secrets="$appliance_home/secrets/backup"
config="$secrets/offhost.v1.conf"
key_file="$secrets/offhost-encryption.key"
ssh_key="$secrets/offhost-ssh-key"
known_hosts="$secrets/offhost-known-hosts"
state_dir="$appliance_home/.data/offhost"
work="$state_dir/work"
results="$state_dir/results.v1.tsv"
drills="$state_dir/drills.v1.tsv"
projection="$appliance_home/.data/runtime/update/state/offhost.v1.json"
marker="$backups/.last-offhost-verified.v1"
suffix=lospor-offhost

umask 077
mkdir -p "$state_dir" "$work"
chmod 700 "$state_dir" "$work"

# ── configuration ────────────────────────────────────────────────────────────

valid_mount_path() {
  printf '%s\n' "$1" | grep -Eq '^/[A-Za-z0-9._/-]{1,200}$' || return 1
  case "/$1/" in */../*|*/./*) return 1 ;; esac
  case "$1" in /|/opt/lospor-hospital|/opt/lospor-hospital/*) return 1 ;; esac
}
valid_host() { printf '%s\n' "$1" | grep -Eq '^[A-Za-z0-9][A-Za-z0-9.:-]{0,252}$'; }
valid_port() { printf '%s\n' "$1" | grep -Eq '^[1-9][0-9]{0,4}$' && [ "$1" -le 65535 ]; }
valid_user() { printf '%s\n' "$1" | grep -Eq '^[a-z_][a-z0-9_.-]{0,31}$'; }
valid_directory() {
  printf '%s\n' "$1" | grep -Eq '^[A-Za-z0-9._/][A-Za-z0-9._/-]{0,199}$' || return 1
  case "/$1/" in */../*) return 1 ;; esac
}

config_value() { sed -n "s/^$1=//p" "$config" | head -n 1; }

read_config() {
  [ -f "$config" ] && [ ! -L "$config" ] || return 10
  [ "$(head -n 1 "$config")" = LOSPOR-HOSPITAL-OFFHOST-V1 ] || return 1
  type="$(config_value type)"
  case "$type" in
    mount) path="$(config_value path)"; valid_mount_path "$path" || return 1 ;;
    sftp)
      host="$(config_value host)"; port="$(config_value port)"; user="$(config_value user)"; directory="$(config_value directory)"
      valid_host "$host" && valid_port "$port" && valid_user "$user" && valid_directory "$directory" || return 1
      [ -s "$ssh_key" ] && [ -s "$known_hosts" ] || return 1
      ;;
    *) return 1 ;;
  esac
  [ -s "$key_file" ] && [ "$(grep -Ec '^[a-f0-9]{64}$' "$key_file")" = 2 ] || return 1
}

require_config() {
  if read_config; then return 0; else config_result=$?; fi
  [ "$config_result" -eq 10 ] && die "Off-host copies are not configured." "Копията извън сървъра не са настроени." 2
  die "The off-host configuration is invalid; run configure again." "Настройката за копия извън сървъра е невалидна; изпълнете configure отново." 1
}

# Generated once and never replaced: every copy already made needs it to decrypt.
ensure_encryption_key() {
  mkdir -p "$secrets"
  [ -s "$key_file" ] && return 0
  { openssl rand -hex 32; openssl rand -hex 32; } > "$key_file.tmp.$$"
  chmod 600 "$key_file.tmp.$$"
  mv "$key_file.tmp.$$" "$key_file"
  say "A new off-host encryption key was created. Copy secrets/ to the hospital's escrow again: without this key no off-host copy can be read." \
      "Създаден е нов ключ за шифроване на копията. Копирайте отново secrets/ в сейфа на болницата: без този ключ никое копие извън сървъра не може да бъде прочетено."
}

key_fingerprint() { sha256sum "$key_file" | cut -c1-16; }

write_config() {
  { printf 'LOSPOR-HOSPITAL-OFFHOST-V1\n'; cat; } > "$config.tmp.$$"
  chmod 600 "$config.tmp.$$"
  mv "$config.tmp.$$" "$config"
}

# ── results and projection ───────────────────────────────────────────────────

record() {
  printf '%s\t%s\t%s\t%s\n' "$1" "$(update_now_epoch)" "$2" "${3:--}" >> "$results"
  tail -n 200 "$results" > "$results.tmp.$$" && mv "$results.tmp.$$" "$results"
  chmod 600 "$results"
  write_projection || true
}

last_result() {
  [ -f "$results" ] || return 0
  awk -F '\t' -v kind="$1" '$1 == kind { line = $0 } END { print line }' "$results"
}

iso() { date -u -d "@$1" +%Y-%m-%dT%H:%M:%SZ; }

# What Status may show: where copies go, the public half of the SSH key and the
# pinned host key fingerprints for Hospital IT to check, and bounded results.
write_projection() {
  mkdir -p "$(dirname "$projection")"
  {
    printf '{"schemaVersion":1,"signalType":"offhost","observedAt":"%s"' "$(update_now_iso)"
    if read_config 2>/dev/null; then
      if [ "$type" = mount ]; then
        printf ',"destination":{"type":"mount","path":"%s"}' "$path"
      else
        printf ',"destination":{"type":"sftp","host":"%s","port":%s,"user":"%s","directory":"%s"}' "$host" "$port" "$user" "$directory"
        printf ',"sshPublicKey":"%s"' "$(cut -d' ' -f1-2 "$ssh_key.pub")"
        printf ',"hostKeyFingerprints":[%s]' "$(ssh-keygen -lf "$known_hosts" 2>/dev/null | awk '{ printf "%s\"%s\"", separator, $2; separator = "," }')"
      fi
      printf ',"encryptionKeyFingerprint":"%s"' "$(key_fingerprint)"
    fi
    for kind in run test drill; do
      line="$(last_result "$kind")"
      [ -n "$line" ] || continue
      printf ',"last%s":{"at":"%s","result":"%s"}' \
        "$(case "$kind" in run) echo Run ;; test) echo Test ;; drill) echo Drill ;; esac)" "$(iso "$(printf '%s' "$line" | cut -f2)")" "$(printf '%s' "$line" | cut -f3)"
    done
    printf ',"drills":[%s]}\n' "$(tail -n 10 "$drills" 2>/dev/null | awk -F '\t' '
      { printf "%s{\"completedAt\":\"%s\",\"result\":\"%s\",\"backup\":\"%s\"}", separator, $1, $2, $3; separator = "," }')"
  } > "$projection.tmp.$$"
  chmod 644 "$projection.tmp.$$"
  mv "$projection.tmp.$$" "$projection"
}

# ── transports ───────────────────────────────────────────────────────────────

sftp_batch() {
  batch="$work/sftp.batch.$$"
  cat > "$batch"
  target_host="$host"
  case "$host" in *:*) target_host="[$host]" ;; esac
  sftp_result=0
  sftp -q -b "$batch" -i "$ssh_key" -P "$port" \
    -o BatchMode=yes -o IdentitiesOnly=yes -o StrictHostKeyChecking=yes \
    -o UserKnownHostsFile="$known_hosts" -o GlobalKnownHostsFile=/dev/null \
    -o ConnectTimeout=20 -o ServerAliveInterval=15 -o ServerAliveCountMax=4 \
    -- "$user@$target_host" > "$work/sftp.log" 2>&1 || sftp_result=$?
  rm -f "$batch"
  return "$sftp_result"
}

mount_ready() {
  [ -d "$path" ] || return 1
  [ "$test_only" = 1 ] || mountpoint -q "$path"
}

# put LOCAL NAME: store under a temporary name, make it durable, then rename.
put_file() {
  case "$type" in
    mount)
      mount_ready || return 1
      cp "$1" "$path/.tmp-$2" && sync "$path/.tmp-$2" && mv -f "$path/.tmp-$2" "$path/$2" && sync "$path"
      ;;
    sftp)
      sftp_batch <<EOF
-mkdir $directory
-rm $directory/.tmp-$2
put $1 $directory/.tmp-$2
-rm $directory/$2
rename $directory/.tmp-$2 $directory/$2
EOF
      ;;
  esac
}

get_file() {
  rm -f "$2"
  case "$type" in
    mount) mount_ready && cp "$path/$1" "$2" ;;
    sftp) printf 'get %s/%s %s\n' "$directory" "$1" "$2" | sftp_batch ;;
  esac
}

remove_file() {
  case "$type" in
    mount) rm -f "$path/$1" ;;
    sftp) printf '%s\n' "-rm $directory/$1" | sftp_batch ;;
  esac
}

# Stored, then read back and compared; nothing else counts as a copy.
put_verified() {
  put_file "$1" "$2" || return 1
  get_file "$2" "$work/readback.$$" || { rm -f "$work/readback.$$"; return 1; }
  readback_result=0
  cmp -s "$1" "$work/readback.$$" || readback_result=1
  rm -f "$work/readback.$$"
  return "$readback_result"
}

# ── encryption ───────────────────────────────────────────────────────────────

hmac_object() {
  python3 - "$key_file" "$1" "$2" "$3" <<'PY'
import hashlib, hmac, sys
key = bytes.fromhex(open(sys.argv[1]).read().split()[1])
mac = hmac.new(key, f"LOSPOR-HOSPITAL-OFFHOST-OBJECT-V1\n{sys.argv[2]}\n{sys.argv[3]}\n".encode(), hashlib.sha256)
with open(sys.argv[4], "rb") as stream:
    for chunk in iter(lambda: stream.read(1 << 20), b""):
        mac.update(chunk)
print(mac.hexdigest())
PY
}

# The passphrase is read from the first line of the key file, never from argv.
encrypt() { openssl enc -aes-256-ctr -pbkdf2 -iter 100000 -md sha256 -salt -pass "file:$key_file" -out "$1"; }
decrypt() { openssl enc -d -aes-256-ctr -pbkdf2 -iter 100000 -md sha256 -pass "file:$key_file" -in "$1"; }

# ── the newest verified local backup ─────────────────────────────────────────

marker_field() { sed -n "s/^$2=//p" "$1" 2>/dev/null | head -n 1; }

newest_verified() {
  object="$(marker_field "$backups/.last-verified.v1" objectName)"
  manifest_sha="$(marker_field "$backups/.last-verified.v1" manifestSha256)"
  printf '%s\n' "$object" | grep -Eq '^lospor-[0-9]{8}T[0-9]{6}Z-[A-Za-z0-9]{6,32}\.backup$' \
    && printf '%s\n' "$manifest_sha" | grep -Eq '^[a-f0-9]{64}$' \
    && [ -d "$backups/$object" ] && [ ! -L "$backups/$object" ] \
    && [ "$(sha256sum "$backups/$object/manifest.json" | awk '{print $1}')" = "$manifest_sha" ]
}

write_marker() {
  printf 'schemaVersion=1\nacknowledgedAtEpoch=%s\nobjectName=%s\nmanifestSha256=%s\n' \
    "$(update_now_epoch)" "$1" "$2" > "$marker.tmp.$$"
  chmod 600 "$marker.tmp.$$"
  sync "$marker.tmp.$$"
  mv -f "$marker.tmp.$$" "$marker"
  sync "$backups"
}

cleanup_work() { rm -rf "$work"/* 2>/dev/null || true; }

# ── commands ─────────────────────────────────────────────────────────────────

command="${1:-}"
[ "$#" -eq 0 ] || shift

case "$command" in
  configure)
    kind="${1:-}"
    case "$kind" in
      mount)
        [ "$#" -eq 2 ] || usage
        valid_mount_path "$2" || die "The share path must be an absolute path outside the appliance." "Пътят до споделената папка трябва да е абсолютен и извън системата." 2
        path="$2"
        [ -d "$path" ] || die "$path does not exist. Mount the share there first." "$path не съществува. Първо монтирайте споделената папка там." 1
        [ "$test_only" = 1 ] || mountpoint -q "$path" \
          || die "$path is not a mounted share. Copies would stay on this server's own disk." "$path не е монтирана споделена папка. Копията биха останали на диска на този сървър." 1
        ensure_encryption_key
        printf 'type=mount\npath=%s\n' "$path" | write_config
        say "Configured copies to the share at $path. Run: offhost-copy.sh test" "Настроени са копия в споделената папка $path. Изпълнете: offhost-copy.sh test"
        ;;
      sftp)
        [ "$#" -eq 5 ] || usage
        host="$2"; port="$3"; user="$4"; directory="$5"
        valid_host "$host" && valid_port "$port" && valid_user "$user" && valid_directory "$directory" \
          || die "The host, port, user or directory is not valid." "Хостът, портът, потребителят или директорията са невалидни." 2
        ensure_encryption_key
        if [ ! -s "$ssh_key" ]; then
          ssh-keygen -q -t ed25519 -N '' -C "lospor-hospital-offhost" -f "$ssh_key" >/dev/null
          chmod 600 "$ssh_key"
        fi
        ssh-keyscan -T 10 -p "$port" "$host" 2>/dev/null | grep -v '^#' > "$known_hosts.tmp.$$" || true
        [ -s "$known_hosts.tmp.$$" ] || { rm -f "$known_hosts.tmp.$$"; die "The SFTP server did not answer at $host:$port." "SFTP сървърът не отговори на $host:$port." 1; }
        chmod 600 "$known_hosts.tmp.$$"
        mv "$known_hosts.tmp.$$" "$known_hosts"
        printf 'type=sftp\nhost=%s\nport=%s\nuser=%s\ndirectory=%s\n' "$host" "$port" "$user" "$directory" | write_config
        say "Pinned the server's host keys. Check these fingerprints with the server's administrator:" "Ключовете на сървъра са закрепени. Проверете тези отпечатъци с администратора на сървъра:"
        ssh-keygen -lf "$known_hosts" | awk '{ print "  " $2 " " $NF }'
        say "Install this public key for user $user on the server, then run: offhost-copy.sh test" "Инсталирайте този публичен ключ за потребител $user на сървъра и изпълнете: offhost-copy.sh test"
        cat "$ssh_key.pub"
        ;;
      *) usage ;;
    esac
    write_projection
    ;;

  disable)
    [ "$#" -eq 0 ] || usage
    rm -f "$config"
    write_projection
    say "Off-host copies are disabled. The encryption and SSH keys are kept." "Копията извън сървъра са изключени. Ключовете за шифроване и SSH са запазени."
    ;;

  state)
    [ "$#" -le 1 ] || usage
    write_projection
    if [ "${1:-}" = --json ]; then cat "$projection"; exit 0; fi
    [ -z "${1:-}" ] || usage
    if read_config 2>/dev/null; then
      if [ "$type" = mount ]; then say "Destination: share at $path" "Място: споделена папка $path"
      else say "Destination: sftp://$user@$host:$port/$directory" "Място: sftp://$user@$host:$port/$directory"; fi
      say "Encryption key fingerprint: $(key_fingerprint)" "Отпечатък на ключа за шифроване: $(key_fingerprint)"
    else
      say "Off-host copies are not configured." "Копията извън сървъра не са настроени."
    fi
    for kind in run test drill; do
      line="$(last_result "$kind")"
      [ -z "$line" ] || printf '  %s: %s at %s\n' "$kind" "$(printf '%s' "$line" | cut -f3)" "$(iso "$(printf '%s' "$line" | cut -f2)")"
    done
    ;;

  test)
    [ "$#" -eq 0 ] || usage
    require_config
    probe="$work/probe.$$"
    probe_name=".lospor-probe-$(openssl rand -hex 8)"
    openssl rand -out "$probe" 4096
    if put_verified "$probe" "$probe_name"; then
      remove_file "$probe_name" || true
      rm -f "$probe"
      record test OFFHOST_TEST_PASSED
      say "The destination accepted a test file, returned it unchanged, and deleted it." "Мястото прие пробен файл, върна го непроменен и го изтри."
    else
      rm -f "$probe"
      record test OFFHOST_TEST_FAILED
      [ "$type" != sftp ] || sed 's/^/  /' "$work/sftp.log" >&2 2>/dev/null || true
      die "The destination could not store and return a test file." "Мястото не можа да съхрани и върне пробен файл." 1
    fi
    ;;

  run)
    [ "$#" -eq 0 ] || usage
    if read_config; then :; else
      config_result=$?
      [ "$config_result" -eq 10 ] && exit 0
      record run OFFHOST_CONFIG_INVALID; exit 1
    fi
    newest_verified || { say "There is no verified backup to copy yet." "Все още няма проверен архив за копиране."; exit 0; }
    if [ "$(marker_field "$marker" objectName)" = "$object" ] && [ "$(marker_field "$marker" manifestSha256)" = "$manifest_sha" ]; then
      exit 0
    fi
    cleanup_work
    update_io_lock_acquire offhost-copy || { record run OFFHOST_BUSY "$object"; exit 75; }
    available="$(df -Pk "$work" | awk 'NR == 2 { print $4 }')"
    needed="$(du -sk "$backups/$object" | awk '{ print $1 }')"
    if [ "$available" -lt $((needed + needed / 10 + 1048576)) ]; then
      update_io_lock_release
      record run OFFHOST_CAPACITY_REFUSED "$object"
      die "Not enough free disk to prepare the encrypted copy." "Няма достатъчно свободно място за подготовка на шифрованото копие." 1
    fi
    ciphertext="$work/$object.$suffix"
    if ! tar -C "$backups" --numeric-owner -cf - "$object" | encrypt "$ciphertext"; then
      update_io_lock_release
      cleanup_work
      record run OFFHOST_ENCRYPT_FAILED "$object"
      die "The backup could not be encrypted." "Архивът не можа да бъде шифрован." 1
    fi
    # The ciphertext is complete; retention may prune the local object from here on.
    update_io_lock_release
    {
      printf 'LOSPOR-HOSPITAL-OFFHOST-OBJECT-V1\n'
      printf 'objectName=%s\nmanifestSha256=%s\n' "$object" "$manifest_sha"
      printf 'ciphertextSha256=%s\n' "$(sha256sum "$ciphertext" | awk '{print $1}')"
      printf 'hmacSha256=%s\n' "$(hmac_object "$object" "$manifest_sha" "$ciphertext")"
    } > "$ciphertext.meta"
    # The data first and the metadata last: a copy without metadata is incomplete.
    if put_verified "$ciphertext" "$object.$suffix" && put_verified "$ciphertext.meta" "$object.$suffix.meta"; then
      write_marker "$object" "$manifest_sha"
      cleanup_work
      record run OFFHOST_COPY_ACKNOWLEDGED "$object"
      say "Copied $object off-host, read it back and matched it." "Архивът $object е копиран извън сървъра, прочетен обратно и съвпада."
    else
      cleanup_work
      record run OFFHOST_COPY_FAILED "$object"
      die "The encrypted copy could not be stored and read back. It will be retried." "Шифрованото копие не можа да бъде съхранено и прочетено обратно. Ще бъде опитано отново." 1
    fi
    ;;

  drill)
    [ "$#" -eq 0 ] || usage
    require_config
    object="$(marker_field "$marker" objectName)"
    manifest_sha="$(marker_field "$marker" manifestSha256)"
    printf '%s\n' "$object" | grep -Eq '^lospor-[0-9]{8}T[0-9]{6}Z-[A-Za-z0-9]{6,32}\.backup$' \
      || die "No copy has been acknowledged off-host yet. Run: offhost-copy.sh run" "Все още няма потвърдено копие извън сървъра. Изпълнете: offhost-copy.sh run" 1
    cleanup_work
    drill_fail() {
      cleanup_work
      printf '%s\tfailed\t%s\t%s\n' "$(update_now_iso)" "$object" "$1" >> "$drills"
      chmod 600 "$drills"
      record drill "$1" "$object"
      die "$2" "$3" 1
    }
    ciphertext="$work/$object.$suffix"
    get_file "$object.$suffix.meta" "$ciphertext.meta" && get_file "$object.$suffix" "$ciphertext" \
      || drill_fail OFFHOST_DRILL_FETCH_FAILED "The copy could not be fetched from the destination." "Копието не можа да бъде изтеглено от мястото."
    [ "$(sed -n 1p "$ciphertext.meta")" = LOSPOR-HOSPITAL-OFFHOST-OBJECT-V1 ] \
      && [ "$(marker_field "$ciphertext.meta" objectName)" = "$object" ] \
      && [ "$(marker_field "$ciphertext.meta" manifestSha256)" = "$manifest_sha" ] \
      && [ "$(marker_field "$ciphertext.meta" hmacSha256)" = "$(hmac_object "$object" "$manifest_sha" "$ciphertext")" ] \
      || drill_fail OFFHOST_DRILL_AUTHENTICATION_FAILED "The fetched copy failed authentication: it is not the copy this appliance made." "Изтегленото копие не премина удостоверяване: то не е копието, направено от тази система."
    decrypt "$ciphertext" > "$work/object.tar" 2>/dev/null \
      || drill_fail OFFHOST_DRILL_DECRYPT_FAILED "The fetched copy could not be decrypted." "Изтегленото копие не можа да бъде дешифровано."
    rm -f "$ciphertext"
    # Authenticated, but the archive is still checked before anything is extracted.
    tar -tvf "$work/object.tar" | awk -v name="$object" '
      { type = substr($1, 1, 1); entry = $NF; sub(/\/$/, "", entry)
        if ((type != "-" && type != "d") || (entry != name && index(entry, name "/") != 1) || entry ~ /\.\./) bad = 1 }
      END { exit bad }' \
      || drill_fail OFFHOST_DRILL_ARCHIVE_UNSAFE "The decrypted archive holds unexpected entries." "Дешифрованият архив съдържа неочаквани записи."
    mkdir -p "$work/extract"
    tar -C "$work/extract" --no-same-owner -xf "$work/object.tar" && rm -f "$work/object.tar" \
      && [ "$(sha256sum "$work/extract/$object/manifest.json" | awk '{print $1}')" = "$manifest_sha" ] \
      || drill_fail OFFHOST_DRILL_MANIFEST_MISMATCH "The decrypted backup's manifest does not match the acknowledged copy." "Манифестът на дешифрования архив не съвпада с потвърденото копие."
    # Restored from the fetched bytes under a name of its own, so a local object
    # with the same name is never touched. The lock keeps retention from
    # pruning it mid-drill; the restore itself does not take the lock.
    update_io_lock_acquire offhost-drill || { cleanup_work; record drill OFFHOST_BUSY "$object"; exit 75; }
    drill_object="${object%-*}-offhostdrill$(openssl rand -hex 6).backup"
    mv "$work/extract/$object" "$backups/$drill_object"
    drill_result=0
    sh "$root/scripts/restore-backup.sh" --drill "backups/$drill_object" > "$state_dir/last-drill.log" 2>&1 || drill_result=$?
    rm -rf "${backups:?}/$drill_object"
    update_io_lock_release
    cleanup_work
    if [ "$drill_result" -ne 0 ]; then
      drill_fail OFFHOST_DRILL_RESTORE_FAILED "The fetched copy decrypted but did not restore; see .data/offhost/last-drill.log." "Изтегленото копие беше дешифровано, но не се възстанови; вижте .data/offhost/last-drill.log."
    fi
    printf '%s\tpassed\t%s\tOFFHOST_DRILL_PASSED\n' "$(update_now_iso)" "$object" >> "$drills"
    chmod 600 "$drills"
    record drill OFFHOST_DRILL_PASSED "$object"
    say "Drill passed: $object was fetched from off-host, authenticated, decrypted and restored into a temporary database, then removed." \
        "Проверката премина: $object беше изтеглен отвън, удостоверен, дешифрован и възстановен във временна база данни, след което беше премахнат."
    ;;

  *) usage ;;
esac
