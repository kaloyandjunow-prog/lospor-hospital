import assert from "node:assert/strict"
import { execFileSync, spawnSync } from "node:child_process"
import { createHash, generateKeyPairSync, sign } from "node:crypto"
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
const imageReference = (name, version) => ({
  caddy: "caddy:2.10.2-alpine",
  "curl-worker": "curlimages/curl:8.17.0",
  postgres: "postgres:17.6-bookworm",
})[name] ?? `ghcr.io/kaloyandjunow-prog/lospor-hospital-${name}:${version}`

async function writeExecutable(path, contents) {
  await writeFile(path, contents)
  await chmod(path, 0o755)
}

async function createKit(fixture, version, { link = false } = {}) {
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

async function createSignedRelease(fixture, keyPair, version, options) {
  const archive = await createKit(fixture, version, options)
  const archiveBytes = await readFile(archive)
  const lock = join(fixture, `release-${version}-${options?.link ? "link" : "plain"}.lock`)
  const signature = `${lock}.sig`
  const publicKey = join(fixture, "trusted-public-key.pem")
  const lines = [
    "LOSPOR-HOSPITAL-RELEASE-LOCK-V1",
    ["release", version, `hospital-${version}`, "a".repeat(40), "linux/amd64", "2026-08-13T00:00:00.000Z", "b".repeat(64)].join("\t"),
    ["artifact", "manifest", "000", `lospor-hospital-${version}-manifest.json`, "1", "c".repeat(64)].join("\t"),
    ["artifact", "deployment", "000", `lospor-hospital-${version}-deployment.tar.gz`, String(archiveBytes.length), hash(archiveBytes)].join("\t"),
    ["artifact", "security-evidence", "000", `lospor-hospital-${version}-security-evidence.tar.gz`, "1", "d".repeat(64)].join("\t"),
    ["artifact", "offline-part", "000", `lospor-hospital-${version}-images.tar.gz.part-000`, "1", "e".repeat(64)].join("\t"),
    ...names.map((name, index) => [
      "image",
      name,
      imageReference(name, version),
      `sha256:${String((index + 1) % 10).repeat(64)}`,
      `sha256:${String(index).repeat(64)}`,
      "linux/amd64",
    ].join("\t")),
  ]
  const bytes = Buffer.from(`${lines.join("\n")}\n`)
  await writeFile(lock, bytes)
  await writeFile(signature, `${sign(null, bytes, keyPair.privateKey).toString("base64")}\n`)
  await writeFile(publicKey, keyPair.publicKey.export({ format: "pem", type: "spki" }))
  return { archive, lock, signature, publicKey }
}

async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), "hospital-release-activation-"))
  const bootstrap = join(directory, "bootstrap")
  const home = join(directory, "home")
  const fakeBin = join(directory, "fake-bin")
  await mkdir(join(bootstrap, "scripts"), { recursive: true })
  await mkdir(home)
  await mkdir(fakeBin)
  for (const script of ["activate-verified-release.sh", "installed-release-state.sh", "verify-release.sh"]) {
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
    [ "$subcommand" = inspect ] || exit 64
    [ "\${1:-}" = --format ] || exit 64
    shift 2
    subject="\${1:-}"
    record="$(awk -F '\t' -v subject="$subject" '$1 == subject || $2 == subject { print; exit }' "$state")"
    if [ -z "$record" ]; then
      printf 'fake docker inspect did not find %s\n' "$subject" >&2
      cat "$state" >&2
      exit 1
    fi
    old_ifs="$IFS"; IFS="$(printf '\t')"; set -- $record; IFS="$old_ifs"
    printf '%s %s\n' "$2" "$3"
    ;;
  tag)
    source_id="\${1:-}"; reference="\${2:-}"
    record="$(awk -F '\t' -v subject="$source_id" '$2 == subject { print; exit }' "$state")"
    [ -n "$record" ] || exit 1
    old_ifs="$IFS"; IFS="$(printf '\t')"; set -- $record; IFS="$old_ifs"
    temporary="$state.tmp.$$"
    awk -F '\t' -v reference="$reference" '$1 != reference' "$state" > "$temporary"
    printf '%s\t%s\t%s\n' "$reference" "$source_id" "$3" >> "$temporary"
    mv "$temporary" "$state"
    ;;
  compose)
    [ "\${1:-}" = up ] || exit 64
    case " $* " in *" --force-recreate "*) ;; *) exit 66 ;; esac
    expected="\${ROLLBACK_EXPECTED_CADDY_ID:-}"
    if [ -n "$expected" ]; then
      actual="$(awk -F '\t' '$1 == "caddy:2.10.2-alpine" { print $2; exit }' "$state")"
      [ "$actual" = "$expected" ] || exit 65
    fi
    printf 'compose-up\n' > "\${ROLLBACK_COMPOSE_MARKER:?}"
    ;;
  *) exit 64 ;;
esac
`)
  return {
    directory,
    bootstrap,
    home,
    fakeBin,
    activation: join(bootstrap, "scripts", "activate-verified-release.sh"),
    keys: generateKeyPairSync("ed25519"),
  }
}

function activate(f, release, command, extraEnv = {}) {
  return spawnSync("sh", [
    f.activation,
    release.lock,
    release.signature,
    release.publicKey,
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

test("verified activation stages a signed kit and promotes only after success", { skip: process.platform === "win32" }, async () => {
  const f = await fixture()
  const release = await createSignedRelease(f.directory, f.keys, "1.0.0")
  const result = activate(f, release, "test -L .env && test -L backups && test -L secrets && test -s .release/release.lock")
  assert.equal(result.status, 0, result.stderr)
  const state = await readFile(join(f.home, ".data", "installed-release.tsv"), "utf8")
  assert.match(state, /^LOSPOR-HOSPITAL-INSTALLED-RELEASE-V1\t1\.0\.0\t/)
  assert.equal(await readlink(join(f.home, "current")), join(f.home, ".data", "releases", "1.0.0", "lospor-hospital-1.0.0"))
})

test("failed candidate restores a changed third-party tag and starts the prior service", { skip: process.platform === "win32" }, async () => {
  const f = await fixture()
  const first = await createSignedRelease(f.directory, f.keys, "1.0.0")
  assert.equal(activate(f, first, "exit 0").status, 0)
  const oldState = await readFile(join(f.home, ".data", "installed-release.tsv"), "utf8")
  const oldCurrent = await readlink(join(f.home, "current"))
  const marker = join(f.directory, "rollback-marker")
  const composeMarker = join(f.directory, "rollback-compose-marker")
  const next = await createSignedRelease(f.directory, f.keys, "1.0.1")
  const oldCaddyId = `sha256:${"2".repeat(64)}`
  const nextCaddyId = `sha256:${"f".repeat(64)}`
  const state = [
    ...names.map((name, index) => {
      const imageId = `sha256:${String(index).repeat(64)}`
      return [imageReference(name, "1.0.0"), imageId, "linux/amd64"].join("\t")
    }),
    ["old-caddy-content", oldCaddyId, "linux/amd64"].join("\t"),
    ["candidate-caddy", nextCaddyId, "linux/amd64"].join("\t"),
  ]
  // Simulate a new release that approved different Caddy bytes behind the same
  // stable third-party version label. The old content-addressed image remains
  // loaded, but its ordinary tag now points at the candidate.
  state[2] = ["caddy:2.10.2-alpine", nextCaddyId, "linux/amd64"].join("\t")
  await writeFile(join(f.directory, "fake-docker-state.tsv"), `${state.join("\n")}\n`)
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
  assert.match(restoredState, new RegExp(`^caddy:2\\.10\\.2-alpine\\t${oldCaddyId}\\tlinux/amd64$`, "m"))
})

test("activation rejects downgrade, same-version reidentity, and linked archives", { skip: process.platform === "win32" }, async () => {
  const f = await fixture()
  const first = await createSignedRelease(f.directory, f.keys, "1.0.0")
  assert.equal(activate(f, first, "exit 0").status, 0)
  const downgrade = await createSignedRelease(f.directory, f.keys, "0.9.0")
  assert.notEqual(activate(f, downgrade, "exit 0").status, 0)
  const changed = await createSignedRelease(f.directory, f.keys, "1.0.0", { link: true })
  assert.notEqual(activate(f, changed, "exit 0").status, 0)
  const linkedUpgrade = await createSignedRelease(f.directory, f.keys, "1.0.2", { link: true })
  const linked = activate(f, linkedUpgrade, "exit 0")
  assert.notEqual(linked.status, 0)
  await assert.rejects(lstat(join(f.home, ".data", "releases", "1.0.2", "lospor-hospital-1.0.2")))
})
