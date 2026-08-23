import assert from "node:assert/strict"
import { execFileSync, spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
import {
  chmod,
  cp,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readlink,
  symlink,
  writeFile,
} from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import test from "node:test"

const repository = resolve(import.meta.dirname, "..")
const names = ["api", "browser", "caddy", "curl-worker", "migrate", "postgres", "pwa", "status", "tools", "web"]

const hash = bytes => createHash("sha256").update(bytes).digest("hex")
const imageReference = (name, version) => `ghcr.io/kaloyandjunow-prog/lospor-hospital-${name}:${version}`
const repeatedByteDigest = byte => `sha256:${byte.toString(16).padStart(2, "0").repeat(32)}`
const portableIdentityFor = index => {
  const rootfsDiffIds = [repeatedByteDigest(index + 16), repeatedByteDigest(index + 32)]
  const configBytes = Buffer.from(JSON.stringify({
    architecture: "amd64",
    os: "linux",
    rootfs: { type: "layers", diff_ids: rootfsDiffIds },
  }))
  return {
    configBytes,
    configDigest: `sha256:${hash(configBytes)}`,
    rootfsDiffIds,
  }
}

async function writeExecutable(path, contents) {
  await writeFile(path, contents)
  await chmod(path, 0o755)
}

async function createKit(fixture, version, { link = false, brokenVerifier = false } = {}) {
  const prefix = `lospor-hospital-${version}`
  const source = join(fixture, `kit-source-${version}-${link ? "link" : "plain"}`)
  const root = join(source, prefix)
  await mkdir(join(root, "scripts"), { recursive: true })
  await mkdir(join(root, "backups"), { recursive: true })
  await mkdir(join(root, "secrets"), { recursive: true })
  await writeFile(join(root, "compose.yaml"), "services: {}\n")
  await writeFile(join(root, "compose.release.yaml"), "services: {}\n")
  await writeFile(join(root, "backups", ".gitkeep"), "")
  await writeFile(join(root, "secrets", ".gitkeep"), "")
  await cp(join(repository, "scripts", "installed-release-state.sh"), join(root, "scripts", "installed-release-state.sh"))
  await cp(join(repository, "scripts", "verify-loaded-release-images.sh"), join(root, "scripts", "verify-loaded-release-images.sh"))
  await cp(join(repository, "scripts", "release-compatibility.sh"), join(root, "scripts", "release-compatibility.sh"))
  await cp(join(repository, "scripts", "verify-rollback-compatibility.sh"), join(root, "scripts", "verify-rollback-compatibility.sh"))
  await cp(join(repository, "scripts", "rollback-compatibility-evidence.py"), join(root, "scripts", "rollback-compatibility-evidence.py"))
  const proof = Buffer.from(`${JSON.stringify({
    schemaVersion: 1,
    releaseVersion: version,
    previousVersion: "1.0.0",
    previousLockSha256: "9".repeat(64),
    newSchemaMigration: "20260822180000_additive",
    testedAt: "2026-08-22T00:00:00Z",
    checks: ["previous-api-live", "previous-api-ready", "previous-web-smoke", "previous-pwa-smoke", "clinical-read", "clinical-write", "doctor"],
  })}\n`)
  await writeFile(join(root, "rollback-compatibility-proof.json"), proof)
  await writeFile(
    join(root, "release-compatibility.tsv"),
    `LOSPOR-HOSPITAL-RELEASE-COMPATIBILITY-V1\t${version}\t20260530000000_init\t20260822180000_additive\tservice-compatible\t${hash(proof)}\t30\n`,
  )
  if (brokenVerifier) {
    await writeExecutable(join(root, "scripts", "verify-loaded-release-images.sh"), "#!/bin/sh\nexit 88\n")
  }
  await writeExecutable(join(root, "scripts", "doctor.sh"), `#!/bin/sh
set -eu
[ "\${HOSPITAL_RELEASE_TRANSITION:-}" != 1 ]
[ -z "\${HOSPITAL_VERIFIED_RELEASE_LOCK:-}" ]
printf 'rollback-ok\\n' > "\${ROLLBACK_MARKER:?}"
`)
  if (link) await symlink("/tmp/forbidden-release-link", join(root, "forbidden-link"))
  const archive = join(fixture, `lospor-hospital-${version}-deployment.tar.gz`)
  execFileSync("tar", ["-C", source, "-czf", archive, prefix])
  return archive
}

async function createVerifiedRelease(fixture, version, options) {
  const archive = await createKit(fixture, version, options)
  const archiveBytes = await readFile(archive)
  const lock = join(fixture, `release-${version}-${options?.link ? "link" : "plain"}.lock`)
  const checksum = `${lock}.sha256`
  const signature = `${lock}.sig`
  const lines = [
    "LOSPOR-HOSPITAL-RELEASE-LOCK-V2",
    ["release", version, `hospital-${version}`, "a".repeat(40), "linux/amd64", "2026-08-13T00:00:00.000Z", "b".repeat(64)].join("\t"),
    ["artifact", "manifest", "000", `lospor-hospital-${version}-manifest.json`, "1", "c".repeat(64)].join("\t"),
    ["artifact", "deployment", "000", `lospor-hospital-${version}-deployment.tar.gz`, String(archiveBytes.length), hash(archiveBytes)].join("\t"),
    ["artifact", "security-evidence", "000", `lospor-hospital-${version}-security-evidence.tar.gz`, "1", "d".repeat(64)].join("\t"),
    ["artifact", "offline-part", "000", `lospor-hospital-${version}-images.tar.gz.part-000`, "1", "e".repeat(64)].join("\t"),
    ...names.map((name, index) => {
      const identity = portableIdentityFor(index)
      return [
        "image",
        name,
        imageReference(name, version),
        `sha256:${String((index + 1) % 10).repeat(64)}`,
        `sha256:${String((index + 2) % 10).repeat(64)}`,
        identity.configDigest,
        "linux/amd64",
        identity.rootfsDiffIds.join(","),
      ].join("\t")
    }),
  ]
  const bytes = Buffer.from(`${lines.join("\n")}\n`)
  await writeFile(lock, bytes)
  await writeFile(checksum, `${hash(bytes)}  ${lock.split(/[\\/]/).at(-1)}\n`)
  await writeFile(signature, Buffer.alloc(64, 0x5a))
  return { archive, lock, checksum, signature }
}

async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), "hospital-release-activation-"))
  const bootstrap = join(directory, "bootstrap")
  const home = join(directory, "home")
  const fakeBin = join(directory, "fake-bin")
  await mkdir(join(bootstrap, "scripts"), { recursive: true })
  await mkdir(home)
  await mkdir(fakeBin)
  for (const script of ["activate-verified-release.sh", "installed-release-state.sh", "operator-locale.sh", "recover-release-activation.sh", "verify-release.sh"]) {
    await cp(join(repository, "scripts", script), join(bootstrap, "scripts", script))
  }
  await symlink(home, join(bootstrap, ".lospor-home"))
  await writeExecutable(join(fakeBin, "docker"), `#!/bin/sh
set -eu
state="\${FAKE_DOCKER_STATE:?}"
command="\${1:-}"; shift || true
case "$command" in
  image)
    subcommand="\${1:-}"; shift || true
    case "$subcommand" in
      inspect)
        [ "\${1:-}" = --format ] || exit 64
        format="\${2:-}"; subject="\${3:-}"
        record="$(awk -F '\t' -v subject="$subject" '$1 == subject || $2 == subject { print; exit }' "$state")"
        if [ -z "$record" ]; then
          printf 'fake docker inspect did not find %s\n' "$subject" >&2
          cat "$state" >&2
          exit 1
        fi
        old_ifs="$IFS"; IFS="$(printf '\t')"; set -- $record; IFS="$old_ifs"
        case "$format" in
          '{{.Os}}/{{.Architecture}}') printf '%s\n' "$3" ;;
          '{{join .RootFS.Layers ","}}') printf '%s\n' "$4" ;;
          *) exit 64 ;;
        esac
        ;;
      ls)
        awk -F '\t' '$2 ~ /^sha256:/ && !seen[$2]++ { print $2 }' "$state"
        ;;
      save)
        subject="\${1:-}"
        record="$(awk -F '\t' -v subject="$subject" '$1 == subject || $2 == subject { print; exit }' "$state")"
        [ -n "$record" ] || exit 1
        printf '%s\n' "$record"
        ;;
      *) exit 64 ;;
    esac
    ;;
  tag)
    source_id="\${1:-}"; reference="\${2:-}"
    record="$(awk -F '\t' -v subject="$source_id" '$1 == subject || $2 == subject { print; exit }' "$state")"
    [ -n "$record" ] || exit 1
    old_ifs="$IFS"; IFS="$(printf '\t')"; set -- $record; IFS="$old_ifs"
    temporary="$state.tmp.$$"
    awk -F '\t' -v reference="$reference" '$1 != reference' "$state" > "$temporary"
    printf '%s\t%s\t%s\t%s\t%s\t%s\n' "$reference" "$2" "$3" "$4" "$5" "$6" >> "$temporary"
    mv "$temporary" "$state"
    ;;
  compose)
    [ "\${1:-}" = up ] || exit 64
    case " $* " in *" --force-recreate "*) ;; *) exit 66 ;; esac
    expected="\${ROLLBACK_EXPECTED_CADDY_ID:-}"
    if [ -n "$expected" ]; then
      actual="$(awk -F '\t' '$1 == "ghcr.io/kaloyandjunow-prog/lospor-hospital-caddy:1.0.0" { print $2; exit }' "$state")"
      [ "$actual" = "$expected" ] || exit 65
    fi
    printf 'compose-up\n' > "\${ROLLBACK_COMPOSE_MARKER:?}"
    ;;
  *) exit 64 ;;
esac
`)
  await writeExecutable(join(fakeBin, "tar"), `#!/bin/sh
set -eu
case "\${1:-}" in
  -tf)
    [ "\${2:-}" = - ] || exec /bin/tar "$@"
    record="$(cat)"
    config_hex="$(printf '%s\n' "$record" | awk -F '\t' '{ print $5 }')"
    printf '%s.json\n' "$config_hex"
    ;;
  -xOf)
    [ "\${2:-}" = - ] || exec /bin/tar "$@"
    requested="\${3:-}"
    record="$(cat)"
    config_hex="$(printf '%s\n' "$record" | awk -F '\t' '{ print $5 }')"
    [ "$requested" = "$config_hex.json" ] || exit 1
    printf '%s\n' "$record" | awk -F '\t' '{ print $6 }' | base64 -d
    ;;
  *) exec /bin/tar "$@" ;;
esac
`)
  await writeExecutable(join(fakeBin, "mv"), `#!/bin/sh
set -eu
destination=""
for argument do destination="$argument"; done
suffix="\${FAIL_MV_TARGET_SUFFIX:-}"
marker="\${FAIL_MV_MARKER:-}"
if [ -n "$suffix" ] && [ -n "$marker" ] && [ ! -e "$marker" ]; then
  case "$destination" in
    *"$suffix")
      : > "$marker"
      printf 'injected mv failure for %s\n' "$destination" >&2
      exit 73
      ;;
  esac
fi
exec /bin/mv "$@"
`)
  return {
    directory,
    bootstrap,
    home,
    fakeBin,
    activation: join(bootstrap, "scripts", "activate-verified-release.sh"),
  }
}

async function writeRollbackDockerState(f) {
  const oldCaddyId = `sha256:${"2".repeat(64)}`
  const nextCaddyId = `sha256:${"f".repeat(64)}`
  const record = (subject, localDockerId, identity) => [
    subject,
    localDockerId,
    "linux/amd64",
    identity.rootfsDiffIds.join(","),
    identity.configDigest.slice(7),
    identity.configBytes.toString("base64"),
  ].join("\t")
  const state = [
    ...names.map((name, index) => {
      const imageId = `sha256:${String(index).repeat(64)}`
      return record(imageReference(name, "1.0.0"), imageId, portableIdentityFor(index))
    }),
    record("old-caddy-content", oldCaddyId, portableIdentityFor(names.indexOf("caddy"))),
    record("candidate-caddy", nextCaddyId, portableIdentityFor(99)),
  ]
  // Simulate a candidate moving a stable release tag while the prior
  // content-addressed image remains available for rollback.
  state[2] = record(imageReference("caddy", "1.0.0"), nextCaddyId, portableIdentityFor(99))
  await writeFile(join(f.directory, "fake-docker-state.tsv"), `${state.join("\n")}\n`)
  return { oldCaddyId, nextCaddyId }
}

function activate(f, release, command, extraEnv = {}) {
  return spawnSync("sh", [
    f.activation,
    release.lock,
    release.checksum,
    f.directory,
    "--",
    "sh",
    "-c",
    command,
  ], {
    encoding: "utf8",
    env: {
      ...process.env,
      HOSPITAL_RELEASE_TEST_ONLY: "1",
      FAKE_DOCKER_STATE: join(f.directory, "fake-docker-state.tsv"),
      PATH: `${f.fakeBin}:${process.env.PATH}`,
      ...extraEnv,
    },
  })
}

test("verified activation stages an integrity-checked kit and promotes only after success", { skip: process.platform === "win32" }, async () => {
  const f = await fixture()
  const release = await createVerifiedRelease(f.directory, "1.0.0")
  const result = activate(f, release, "test -L .env && test -L backups && test -L secrets && test -s .release/release.lock && test \"$(wc -c < .release/release.lock.sig | tr -d '[:space:]')\" = 64 && (cd .release && sha256sum -c release.lock.sha256)")
  assert.equal(result.status, 0, result.stderr)
  const state = await readFile(join(f.home, ".data", "installed-release.tsv"), "utf8")
  assert.match(state, /^LOSPOR-HOSPITAL-INSTALLED-RELEASE-V1\t1\.0\.0\t/)
  assert.equal(await readlink(join(f.home, "current")), join(f.home, ".data", "releases", "1.0.0", "lospor-hospital-1.0.0"))
})

test("failed candidate restores a changed release tag and starts the prior service", { skip: process.platform === "win32" }, async () => {
  const f = await fixture()
  const first = await createVerifiedRelease(f.directory, "1.0.0")
  assert.equal(activate(f, first, "exit 0").status, 0)
  const oldState = await readFile(join(f.home, ".data", "installed-release.tsv"), "utf8")
  const oldCurrent = await readlink(join(f.home, "current"))
  const marker = join(f.directory, "rollback-marker")
  const composeMarker = join(f.directory, "rollback-compose-marker")
  const next = await createVerifiedRelease(f.directory, "1.0.1")
  const { oldCaddyId } = await writeRollbackDockerState(f)
  const failed = activate(f, next, "exit 37", {
    ROLLBACK_MARKER: marker,
    ROLLBACK_COMPOSE_MARKER: composeMarker,
    ROLLBACK_EXPECTED_CADDY_ID: oldCaddyId,
  })
  assert.equal(failed.status, 37, failed.stderr)
  assert.equal(await readFile(join(f.home, ".data", "installed-release.tsv"), "utf8"), oldState)
  assert.equal(await readlink(join(f.home, "current")), oldCurrent)
  assert.equal(await readFile(marker, "utf8"), "rollback-ok\n")
  assert.equal(await readFile(composeMarker, "utf8"), "compose-up\n")
  const restoredState = await readFile(join(f.directory, "fake-docker-state.tsv"), "utf8")
  assert.match(restoredState, new RegExp(`^ghcr\\.io/kaloyandjunow-prog/lospor-hospital-caddy:1\\.0\\.0\\t${oldCaddyId}\\tlinux/amd64\\t`, "m"))
})

test("state-write and current-promotion failures fully restore the prior activation", { skip: process.platform === "win32" }, async t => {
  for (const failure of [
    { name: "installed-release state write", suffix: "installed-release.tsv", message: /Could not commit the new installed-release state/ },
    { name: "current symlink promotion", suffix: "/current", message: /Could not atomically promote the new current symlink/ },
  ]) {
    await t.test(failure.name, async () => {
      const f = await fixture()
      const first = await createVerifiedRelease(f.directory, "1.0.0")
      assert.equal(activate(f, first, "exit 0").status, 0)
      const oldState = await readFile(join(f.home, ".data", "installed-release.tsv"), "utf8")
      const oldCurrent = await readlink(join(f.home, "current"))
      const next = await createVerifiedRelease(f.directory, "1.0.1", { brokenVerifier: true })
      const { oldCaddyId } = await writeRollbackDockerState(f)
      const rollbackMarker = join(f.directory, `rollback-marker-${failure.suffix.replace(/\W/g, "-")}`)
      const composeMarker = join(f.directory, `rollback-compose-${failure.suffix.replace(/\W/g, "-")}`)
      const failureMarker = join(f.directory, `mv-failure-${failure.suffix.replace(/\W/g, "-")}`)

      const result = activate(f, next, "exit 0", {
        FAIL_MV_TARGET_SUFFIX: failure.suffix,
        FAIL_MV_MARKER: failureMarker,
        ROLLBACK_MARKER: rollbackMarker,
        ROLLBACK_COMPOSE_MARKER: composeMarker,
        ROLLBACK_EXPECTED_CADDY_ID: oldCaddyId,
      })
      assert.equal(result.status, 73, result.stderr)
      assert.match(result.stderr, failure.message)
      assert.match(result.stderr, /prior activation state, image tags, and services were restored/i)
      assert.equal(await readFile(join(f.home, ".data", "installed-release.tsv"), "utf8"), oldState)
      assert.equal(await readlink(join(f.home, "current")), oldCurrent)
      assert.equal(await readFile(rollbackMarker, "utf8"), "rollback-ok\n")
      assert.equal(await readFile(composeMarker, "utf8"), "compose-up\n")
      await readFile(failureMarker)
      await assert.rejects(lstat(join(f.home, ".data", "release-activation.lock")))
      const restoredState = await readFile(join(f.directory, "fake-docker-state.tsv"), "utf8")
      assert.match(restoredState, new RegExp(`^ghcr\\.io/kaloyandjunow-prog/lospor-hospital-caddy:1\\.0\\.0\\t${oldCaddyId}\\tlinux/amd64\\t`, "m"))
    })
  }
})

test("activation rejects downgrade, same-version reidentity, and linked archives", { skip: process.platform === "win32" }, async () => {
  const f = await fixture()
  const first = await createVerifiedRelease(f.directory, "1.0.0")
  assert.equal(activate(f, first, "exit 0").status, 0)
  const downgrade = await createVerifiedRelease(f.directory, "0.9.0")
  assert.notEqual(activate(f, downgrade, "exit 0").status, 0)
  const changed = await createVerifiedRelease(f.directory, "1.0.0", { link: true })
  assert.notEqual(activate(f, changed, "exit 0").status, 0)
  const linkedUpgrade = await createVerifiedRelease(f.directory, "1.0.2", { link: true })
  const linked = activate(f, linkedUpgrade, "exit 0")
  assert.notEqual(linked.status, 0)
  await assert.rejects(lstat(join(f.home, ".data", "releases", "1.0.2", "lospor-hospital-1.0.2")))
})

test("a crash after every durable activation boundary leaves an inspectable exact journal", { skip: process.platform === "win32" }, async t => {
  const phases = [
    "LOCKED", "CANDIDATE_STAGED", "PRE_MUTATION_VERIFIED", "MUTATION_STARTED",
    "CANDIDATE_SUCCEEDED", "STATE_COMMITTED", "CURRENT_SWITCHED", "VERIFIED",
  ]
  for (const phase of phases) {
    await t.test(phase, async () => {
      const f = await fixture()
      const release = await createVerifiedRelease(f.directory, "1.0.0")
      const crashed = activate(f, release, "exit 0", {
        HOSPITAL_RELEASE_TEST_CRASH_AFTER_PHASE: phase,
      })
      assert.equal(crashed.status, 97, crashed.stderr)
      assert.match(crashed.stderr, new RegExp(`durable phase ${phase}`))
      const journal = await readFile(join(f.home, ".data", "release-activation.lock", "journal.v1.tsv"), "utf8")
      assert.match(journal, new RegExp(`^LOSPOR-HOSPITAL-ACTIVATION-JOURNAL-V1\\t[0-9]+\\t${phase}\\t`))
      const inspected = spawnSync("sh", [join(f.bootstrap, "scripts", "recover-release-activation.sh"), "inspect"], {
        encoding: "utf8",
        env: process.env,
      })
      assert.equal(inspected.status, 0, inspected.stderr)
      assert.match(inspected.stdout, new RegExp(`Activation phase: ${phase}|Етап на активирането: ${phase}`))
      await lstat(join(f.home, ".data", "release-activation.lock"))
    })
  }
})
