// Fixture for driving the real prepare/apply release pipeline.
//
// scripts/prepare-verified-release.sh and scripts/apply-prepared-release.sh
// download a release, authenticate it, verify an Ed25519 signature, pull images
// by digest and switch the live release. Every other suite either stubs them out
// or greps their source, so this builds a whole publication -- metadata, six
// byte-exact assets, a real signature, a deployment kit -- and runs the actual
// scripts against it.
//
// Nothing here approximates the scripts under test. The only substitutions are
// the two hooks the pipeline itself defines for this purpose
// (HOSPITAL_UPDATE_TEST_ONLY with HOSPITAL_UPDATE_LOCAL_ASSET_DIRECTORY, which
// replaces the GitHub API and asset downloads with a local directory) and a
// fake docker that records every invocation so a test can prove which
// operations did and did not reach the engine.

import { execFileSync, spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
import {
  chmodSync,
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readlinkSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"

export const repository = resolve(import.meta.dirname, "..")
export const imageNames = [
  "api", "browser", "caddy", "curl-worker", "migrate",
  "postgres", "pwa", "status", "tools", "web",
]
export const owner = "kaloyandjunow-prog/lospor-hospital"
const tab = "\t"

export const hash = bytes => createHash("sha256").update(bytes).digest("hex")
const digestOf = label => `sha256:${hash(label)}`
const commitOf = version => hash(`commit-${version}`).slice(0, 40)

// The tools this pipeline is written against. A host without them cannot run
// these scripts at all, and a suite that quietly passes on such a host is worse
// than no suite: flock is the whole mutual-exclusion story, python3 parses the
// release metadata, and sync is what makes a published state durable.
export function missingPrerequisites() {
  const missing = []
  for (const tool of ["sh", "flock", "openssl", "tar", "sync", "sha256sum", "df", "ln"]) {
    if (spawnSync("sh", ["-c", `command -v ${tool}`], { encoding: "utf8" }).status !== 0) {
      missing.push(tool)
    }
  }
  // Windows resolves python3 to an App Execution Alias that prints an install
  // notice and runs nothing, so presence on PATH proves nothing here.
  const python = spawnSync("python3", ["-c", "import json,sys;print(json.dumps(1))"], { encoding: "utf8" })
  if (python.status !== 0 || python.stdout.trim() !== "1") missing.push("python3")
  if (!missing.includes("ln")) {
    const probe = mkdtempSync(join(tmpdir(), "hospital-symlink-probe-"))
    try {
      writeFileSync(join(probe, "target"), "x")
      symlinkSync(join(probe, "target"), join(probe, "link"))
      if (readlinkSync(join(probe, "link")) !== join(probe, "target")) missing.push("symlinks")
    } catch {
      missing.push("symlinks")
    } finally {
      rmSync(probe, { recursive: true, force: true })
    }
  }
  return missing
}

export function skipReason() {
  const missing = missingPrerequisites()
  if (missing.length === 0) return null
  const reason = `the real prepare/apply pipeline needs a POSIX host; this one lacks: ${missing.join(", ")}`
  if (process.env.HOSPITAL_REQUIRE_FULL_UPDATE_TESTS === "1") {
    throw new Error(`HOSPITAL_REQUIRE_FULL_UPDATE_TESTS=1 but ${reason}`)
  }
  return reason
}

// One image's portable OCI identity: the config document whose digest and
// rootfs layers the pipeline verifies instead of trusting docker's local .Id.
export function portableIdentity(version, index) {
  const diffIds = [
    digestOf(`${version}-layer-a-${index}`),
    digestOf(`${version}-layer-b-${index}`),
  ]
  const configBytes = Buffer.from(JSON.stringify({
    architecture: "amd64",
    os: "linux",
    release: version,
    rootfs: { type: "layers", diff_ids: diffIds },
  }))
  return { configBytes, configDigest: `sha256:${hash(configBytes)}`, diffIds }
}

export function imageRecords(version) {
  return imageNames.map((name, index) => {
    const identity = portableIdentity(version, index)
    return {
      name,
      index,
      reference: `ghcr.io/${owner}-${name}:${version}`,
      repositoryPath: `ghcr.io/${owner}-${name}`,
      registryDigest: digestOf(`${version}-registry-${name}`),
      platformDigest: digestOf(`${version}-platform-${name}`),
      configDigest: identity.configDigest,
      platform: "linux/amd64",
      diffIds: identity.diffIds.join(","),
      identity,
    }
  })
}

function writeExecutable(path, contents) {
  writeFileSync(path, contents)
  chmodSync(path, 0o755)
}

const proofFor = version => Buffer.from(`${JSON.stringify({
  schemaVersion: 1,
  releaseVersion: version,
  previousVersion: "1.0.0",
  previousLockSha256: hash(`previous-${version}`),
  newSchemaMigration: "20260822180000_additive",
  testedAt: "2026-08-22T00:00:00Z",
  checks: [
    "previous-api-live", "previous-api-ready", "previous-web-smoke",
    "previous-pwa-smoke", "clinical-read", "clinical-write", "doctor",
  ],
})}\n`)

const compatibilityFor = version => `LOSPOR-HOSPITAL-RELEASE-COMPATIBILITY-V1\t${version}\t20260530000000_init\t20260822180000_additive\tservice-compatible\t${hash(proofFor(version))}\t30\n`

// A deployment kit that an activation can really extract, link, run and promote.
// scripts/update.sh is the operation activate-verified-release.sh executes
// inside the candidate; it records the transition environment it was handed so a
// test can prove exactly which release identity reached the live switch.
export function createDeploymentKit(directory, version) {
  const prefix = `lospor-hospital-${version}`
  const source = join(directory, `kit-${version}`)
  const root = join(source, prefix)
  mkdirSync(join(root, "scripts"), { recursive: true })
  mkdirSync(join(root, "backups"), { recursive: true })
  mkdirSync(join(root, "secrets"), { recursive: true })
  for (const migration of ["20260530000000_init", "20260822180000_additive"]) {
    mkdirSync(join(root, "apps", "api", "prisma", "migrations", migration), { recursive: true })
    writeFileSync(join(root, "apps", "api", "prisma", "migrations", migration, "migration.sql"), "SELECT 1;\n")
  }
  writeFileSync(join(root, "compose.yaml"), "services: {}\n")
  writeFileSync(join(root, "compose.release.yaml"), "services: {}\n")
  writeFileSync(join(root, "backups", ".gitkeep"), "")
  writeFileSync(join(root, "secrets", ".gitkeep"), "")
  writeFileSync(join(root, "release-compatibility.tsv"), compatibilityFor(version))
  writeFileSync(join(root, "rollback-compatibility-proof.json"), proofFor(version))
  for (const script of [
    "installed-release-state.sh", "operator-locale.sh", "release-compatibility.sh",
    "rollback-compatibility-evidence.py", "update-pipeline-lib.sh",
    "verify-loaded-release-images.sh", "verify-rollback-compatibility.sh",
  ]) {
    cpSync(join(repository, "scripts", script), join(root, "scripts", script))
  }
  writeExecutable(join(root, "scripts", "doctor.sh"), `#!/bin/sh
set -eu
printf 'doctor\\t%s\\n' "${version}" >> "\${PIPELINE_RECORD:?}"
`)
  const operation = `#!/bin/sh
set -eu
[ "\${HOSPITAL_RELEASE_TRANSITION:-}" = 1 ] || { echo "candidate ran without a verified transition" >&2; exit 1; }
[ "\${HOSPITAL_IMAGES_VERIFIED:-}" = 1 ] || { echo "candidate ran without image authorization" >&2; exit 1; }
printf 'candidate\\t%s\\t%s\\t%s\\n' \\
  "\${HOSPITAL_RELEASE:-}" "\${HOSPITAL_VERIFIED_RELEASE_LOCK_SHA256:-}" "\${HOSPITAL_ACTIVATION_LOCK:-}" \\
  >> "\${PIPELINE_RECORD:?}"
`
  writeExecutable(join(root, "scripts", "update.sh"), operation)
  writeExecutable(join(root, "scripts", "install.sh"), operation)
  const archive = join(directory, `${prefix}-deployment.tar.gz`)
  execFileSync("tar", ["-C", source, "-czf", archive, prefix])
  rmSync(source, { recursive: true, force: true })
  return archive
}

// One published release: the six assets prepare downloads, the offline part its
// metadata parser requires, a signed lock, and the GitHub release document.
//
// mutateLock rewrites the lock before it is signed, so a refusal proves the
// pipeline rejected the content itself rather than a broken signature.
// corruptLockAfterSigning rewrites it afterwards and re-states every digest the
// publisher controls, which is what an attacker holding the download but not
// the signing key can do. The returned corruptStagedLock() goes further and
// edits the asset after publication, leaving the published record intact.
export function publishRelease(directory, version, {
  privateKey,
  mutateLock = lines => lines,
  corruptLockAfterSigning = false,
  releaseId = 40000 + Number(version.replaceAll(".", "")),
} = {}) {
  const assets = join(directory, `assets-${version}`)
  mkdirSync(assets, { recursive: true })
  const prefix = `lospor-hospital-${version}`
  const archive = createDeploymentKit(directory, version)
  const archiveBytes = readFileSync(archive)
  const manifestBytes = Buffer.from(`${JSON.stringify({ release: version, images: imageNames })}\n`)
  const evidenceBytes = Buffer.from(`security-evidence-${version}\n`)
  const offlineBytes = Buffer.from(`offline-part-${version}\n`)
  writeFileSync(join(assets, `${prefix}-deployment.tar.gz`), archiveBytes)
  rmSync(archive, { force: true })
  writeFileSync(join(assets, `${prefix}-manifest.json`), manifestBytes)
  writeFileSync(join(assets, `${prefix}-security-evidence.tar.gz`), evidenceBytes)

  const commit = commitOf(version)
  const images = imageRecords(version)
  const lines = mutateLock([
    "LOSPOR-HOSPITAL-RELEASE-LOCK-V2",
    ["release", version, `hospital-${version}`, commit, "linux/amd64", "2026-08-22T00:00:00.000Z", hash(`provenance-${version}`)].join(tab),
    ["artifact", "manifest", "000", `${prefix}-manifest.json`, String(manifestBytes.length), hash(manifestBytes)].join(tab),
    ["artifact", "deployment", "000", `${prefix}-deployment.tar.gz`, String(archiveBytes.length), hash(archiveBytes)].join(tab),
    ["artifact", "security-evidence", "000", `${prefix}-security-evidence.tar.gz`, String(evidenceBytes.length), hash(evidenceBytes)].join(tab),
    ["artifact", "offline-part", "000", `${prefix}-images.tar.gz.part-000`, String(offlineBytes.length), hash(offlineBytes)].join(tab),
    ...images.map(image => [
      "image", image.name, image.reference, image.registryDigest,
      image.platformDigest, image.configDigest, image.platform, image.diffIds,
    ].join(tab)),
  ], images)

  const lock = join(assets, `${prefix}-release.lock`)
  writeFileSync(lock, `${lines.join("\n")}\n`)
  // Reuse the shipped signing command rather than calling openssl directly, so
  // the fixture cannot drift from how a release is actually signed.
  execFileSync("sh", [join(repository, "scripts", "sign-release-lock.sh"), lock], {
    input: readFileSync(privateKey),
  })
  if (corruptLockAfterSigning) {
    writeFileSync(lock, readFileSync(lock, "utf8")
      .replace(hash(`provenance-${version}`), hash(`tampered-${version}`)))
  }
  const lockBytes = readFileSync(lock)
  const signatureBytes = readFileSync(`${lock}.sig`)
  writeFileSync(`${lock}.sha256`, `${hash(lockBytes)}  ${prefix}-release.lock\n`)

  const asset = (name, bytes, id) => ({
    name, id, size: bytes.length, state: "uploaded", digest: `sha256:${hash(bytes)}`,
  })
  const metadata = {
    id: releaseId,
    tag_name: `hospital-${version}`,
    name: `LOSPOR Hospital ${version}`,
    draft: false,
    prerelease: false,
    immutable: true,
    target_commitish: commit,
    body: [
      "LOSPOR-HOSPITAL-PUBLICATION-V1",
      `version=${version}`,
      `commit=${commit}`,
      "candidate=4711/1",
      `lock-sha256=${hash(lockBytes)}`,
      `signature-sha256=${hash(signatureBytes)}`,
    ].join(" ") + "\n\nPublished by the release workflow.\n",
    assets: [
      asset(`${prefix}-deployment.tar.gz`, archiveBytes, 9001),
      asset(`${prefix}-manifest.json`, manifestBytes, 9002),
      asset(`${prefix}-release.lock`, lockBytes, 9003),
      asset(`${prefix}-release.lock.sha256`, readFileSync(`${lock}.sha256`), 9004),
      asset(`${prefix}-release.lock.sig`, signatureBytes, 9005),
      asset(`${prefix}-security-evidence.tar.gz`, evidenceBytes, 9006),
      asset(`${prefix}-images.tar.gz.part-000`, offlineBytes, 9007),
    ],
  }
  writeFileSync(join(assets, "release.json"), `${JSON.stringify(metadata, null, 2)}\n`)
  return {
    version, assets, commit, images,
    lock,
    lockSha: hash(lockBytes),
    signatureSha: hash(signatureBytes),
    releaseId,
    imageSetSha: hash(`${lines.filter(line => line.startsWith("image\t")).join("\n")}\n`),
    // Edit the published bytes without touching the publication record, the
    // way a compromised download path can.
    corruptStagedLock() {
      writeFileSync(lock, readFileSync(lock, "utf8")
        .replace(hash(`provenance-${version}`), hash(`substituted-${version}`)))
    },
  }
}

const fakeDocker = `#!/bin/sh
set -eu
state="\${FAKE_DOCKER_STATE:?}"
printf '%s\\n' "$*" >> "\${FAKE_DOCKER_LOG:?}"
subcommand_of() { printf '%s' "\${1:-}"; }
command="\${1:-}"; shift || true
lookup() {
  awk -F '\\t' -v subject="\${1:-}" '$1 == subject || $2 == subject { print; exit }' "$state"
}
case "$command" in
  info)
    [ "\${1:-}" = --format ] || exit 64
    printf '%s\\n' "\${FAKE_DOCKER_ROOT:?}"
    ;;
  login)
    printf 'release supply must be anonymous; docker login was attempted\\n' >&2
    exit 97
    ;;
  pull)
    subject=""
    for argument do
      case "$argument" in -*|linux/*) ;; *) subject="$argument" ;; esac
    done
    [ -n "$(lookup "$subject")" ] || { printf 'fake docker cannot pull %s\\n' "$subject" >&2; exit 1; }
    ;;
  tag)
    source_subject="\${1:-}"; reference="\${2:-}"
    record="$(lookup "$source_subject")"
    [ -n "$record" ] || exit 1
    old_ifs="$IFS"; IFS="$(printf '\\t')"; set -- $record; IFS="$old_ifs"
    temporary="$state.tmp.$$"
    awk -F '\\t' -v reference="$reference" '$1 != reference' "$state" > "$temporary"
    printf '%s\\t%s\\t%s\\t%s\\t%s\\t%s\\n' "$reference" "$2" "$3" "$4" "$5" "$6" >> "$temporary"
    mv "$temporary" "$state"
    ;;
  image)
    subcommand="\${1:-}"; shift || true
    case "$subcommand" in
      inspect)
        if [ "\${1:-}" = --format ]; then
          format="\${2:-}"; subject="\${3:-}"
          record="$(lookup "$subject")"
          [ -n "$record" ] || exit 1
          old_ifs="$IFS"; IFS="$(printf '\\t')"; set -- $record; IFS="$old_ifs"
          case "$format" in
            '{{.Os}}/{{.Architecture}}') printf '%s\\n' "$3" ;;
            '{{join .RootFS.Layers ","}}') printf '%s\\n' "$4" ;;
            '{{json .Descriptor}}') printf 'null\\n' ;;
            '{{.Id}}') printf 'sha256:%s\\n' "$5" ;;
            *) exit 64 ;;
          esac
        else
          [ -n "$(lookup "\${1:-}")" ] || exit 1
        fi
        ;;
      ls)
        awk -F '\\t' '$2 ~ /^sha256:/ && !seen[$2]++ { print $2 }' "$state"
        ;;
      save)
        record="$(lookup "\${1:-}")"
        [ -n "$record" ] || exit 1
        printf '%s\\n' "$record"
        ;;
      rm)
        printf '%s\\n' "\${1:-}" >> "\${FAKE_DOCKER_REMOVED:?}"
        temporary="$state.tmp.$$"
        awk -F '\\t' -v reference="\${1:-}" '$1 != reference' "$state" > "$temporary"
        mv "$temporary" "$state"
        ;;
      *) exit 64 ;;
    esac
    ;;
  compose)
    printf 'compose %s\\n' "$*" >> "\${FAKE_DOCKER_COMPOSE:?}"
    ;;
  *) exit 64 ;;
esac
`

// docker image save streams an image archive; the pipeline reads the config
// blob out of it to recompute a portable identity. Only that stdin form is
// intercepted -- every real archive operation goes to the system tar.
const fakeTar = `#!/bin/sh
set -eu
case "\${1:-}" in
  -tf)
    [ "\${2:-}" = - ] || exec /bin/tar "$@"
    record="$(cat)"
    printf '%s.json\\n' "$(printf '%s\\n' "$record" | awk -F '\\t' '{ print $5 }')"
    ;;
  -xOf)
    [ "\${2:-}" = - ] || exec /bin/tar "$@"
    requested="\${3:-}"
    record="$(cat)"
    config_hex="$(printf '%s\\n' "$record" | awk -F '\\t' '{ print $5 }')"
    [ "$requested" = "$config_hex.json" ] || exit 1
    printf '%s\\n' "$record" | awk -F '\\t' '{ print $6 }' | base64 -d
    ;;
  *) exec /bin/tar "$@" ;;
esac
`

// What the registry can serve. `tagged` is what an already-installed release
// looks like locally; a release that has not been pulled yet exists only under
// its immutable digest, so a stable tag can only appear because the pipeline
// pulled the digest and tagged it itself.
function dockerStateLines(version, { tagged = false } = {}) {
  return imageRecords(version).flatMap(image => {
    const localId = digestOf(`${version}-local-${image.name}`)
    const row = subject => [
      subject, localId, image.platform, image.diffIds,
      image.configDigest.slice(7), image.identity.configBytes.toString("base64"),
    ].join(tab)
    const rows = [row(`${image.repositoryPath}@${image.registryDigest}`)]
    if (tagged) rows.push(row(image.reference))
    return rows
  })
}

// A whole appliance: a site tree that runs the real scripts, an appliance home
// with one installed release, no registry credential, a pinned signing key, and a
// docker that records what it was asked to do.
export function createAppliance({ installedVersion = "1.0.0" } = {}) {
  const directory = mkdtempSync(join(tmpdir(), "hospital-update-pipeline-"))
  const site = join(directory, "site")
  const home = join(directory, "home")
  const fakeBin = join(directory, "fake-bin")
  const dockerRoot = join(directory, "docker-root")
  mkdirSync(fakeBin, { recursive: true })
  mkdirSync(dockerRoot, { recursive: true })
  mkdirSync(join(home, ".data"), { recursive: true })
  mkdirSync(join(home, "backups"), { recursive: true })
  mkdirSync(join(home, "secrets"), { recursive: true })
  cpSync(join(repository, "scripts"), join(site, "scripts"), { recursive: true })
  symlinkSync(home, join(site, ".lospor-home"))
  writeFileSync(join(home, ".env"), "LOSPOR_DEFAULT_LOCALE=en\n")
  writeFileSync(join(home, ".data", "io-mutation.lock"), "")
  chmodSync(join(home, ".data", "io-mutation.lock"), 0o600)

  const maintainerKey = join(directory, "maintainer.key")
  const maintainerPublic = join(directory, "maintainer.pub")
  const attackerKey = join(directory, "attacker.key")
  execFileSync("openssl", ["genpkey", "-algorithm", "ED25519", "-out", maintainerKey], { stdio: "ignore" })
  execFileSync("openssl", ["pkey", "-in", maintainerKey, "-pubout", "-out", maintainerPublic], { stdio: "ignore" })
  execFileSync("openssl", ["genpkey", "-algorithm", "ED25519", "-out", attackerKey], { stdio: "ignore" })
  // openssl base64 emits CRLF on some builds; a carriage return welded to a
  // fingerprint compares unequal forever, so strip both.
  const fingerprint = `SHA256:${execFileSync("sh", ["-c",
    `openssl pkey -pubin -in "$1" -outform DER | openssl dgst -sha256 -binary | openssl base64 | tr -d '\\r\\n='`,
    "sh", maintainerPublic], { encoding: "utf8" }).trim()}`
  const pinned = spawnSync("sh", [join(site, "scripts", "pin-release-signing-key.sh"), maintainerPublic], {
    encoding: "utf8",
    env: { ...process.env, HOSPITAL_RELEASE_SIGNING_FINGERPRINT: fingerprint },
  })
  if (pinned.status !== 0) throw new Error(`could not pin the signing key: ${pinned.stderr}`)

  const state = join(directory, "docker-state.tsv")
  const log = join(directory, "docker-invocations.log")
  const removed = join(directory, "docker-removed.log")
  const compose = join(directory, "docker-compose.log")
  const record = join(directory, "pipeline-record.tsv")
  writeFileSync(state, `${dockerStateLines(installedVersion, { tagged: true }).join("\n")}\n`)
  for (const path of [log, removed, compose]) writeFileSync(path, "")
  writeExecutable(join(fakeBin, "docker"), fakeDocker)
  writeExecutable(join(fakeBin, "tar"), fakeTar)

  // The installed release, exactly as an earlier activation would have left it.
  const releaseRoot = join(home, ".data", "releases", installedVersion, `lospor-hospital-${installedVersion}`)
  mkdirSync(join(releaseRoot, ".release"), { recursive: true })
  mkdirSync(join(releaseRoot, "scripts"), { recursive: true })
  for (const script of [
    "installed-release-state.sh", "operator-locale.sh", "release-compatibility.sh",
    "rollback-compatibility-evidence.py", "update-pipeline-lib.sh",
    "verify-loaded-release-images.sh", "verify-rollback-compatibility.sh",
  ]) {
    cpSync(join(repository, "scripts", script), join(releaseRoot, "scripts", script))
  }
  writeExecutable(join(releaseRoot, "scripts", "doctor.sh"), `#!/bin/sh
set -eu
printf 'doctor\\t%s\\n' "${installedVersion}" >> "\${PIPELINE_RECORD:?}"
`)
  writeFileSync(join(releaseRoot, "compose.yaml"), "services: {}\n")
  writeFileSync(join(releaseRoot, "compose.release.yaml"), "services: {}\n")
  writeFileSync(join(releaseRoot, "release-compatibility.tsv"), compatibilityFor(installedVersion))
  const installedImages = imageRecords(installedVersion)
  const installedLockBytes = Buffer.from(`${[
    "LOSPOR-HOSPITAL-RELEASE-LOCK-V2",
    ["release", installedVersion, `hospital-${installedVersion}`, commitOf(installedVersion), "linux/amd64", "2026-08-01T00:00:00.000Z", hash(`provenance-${installedVersion}`)].join(tab),
    ...installedImages.map(image => [
      "image", image.name, image.reference, image.registryDigest,
      image.platformDigest, image.configDigest, image.platform, image.diffIds,
    ].join(tab)),
  ].join("\n")}\n`)
  writeFileSync(join(releaseRoot, ".release", "release.lock"), installedLockBytes)
  writeFileSync(join(releaseRoot, ".release", "release.lock.sha256"), `${hash(installedLockBytes)}  release.lock\n`)
  writeFileSync(join(home, ".data", "installed-release.tsv"),
    `LOSPOR-HOSPITAL-INSTALLED-RELEASE-V1\t${installedVersion}\t.data/releases/${installedVersion}/lospor-hospital-${installedVersion}\t${hash(installedLockBytes)}\n`)
  chmodSync(join(home, ".data", "installed-release.tsv"), 0o600)
  symlinkSync(releaseRoot, join(home, "current"))

  const environment = extra => ({
    ...process.env,
    PATH: `${fakeBin}${process.platform === "win32" ? ";" : ":"}${process.env.PATH}`,
    HOSPITAL_UPDATE_TEST_ONLY: "1",
    LOSPOR_DEFAULT_LOCALE: "en",
    FAKE_DOCKER_STATE: state,
    FAKE_DOCKER_LOG: log,
    FAKE_DOCKER_REMOVED: removed,
    FAKE_DOCKER_COMPOSE: compose,
    FAKE_DOCKER_ROOT: dockerRoot,
    PIPELINE_RECORD: record,
    // Reserve policy, not disk truth: the capacity gate defaults to tens of
    // gigabytes, which no temporary directory is guaranteed to have.
    HOSPITAL_UPDATE_IMAGE_UPPER_BOUND_BYTES: "1",
    HOSPITAL_UPDATE_DOCKER_RESERVE_BYTES: "1",
    HOSPITAL_UPDATE_DATA_RESERVE_BYTES: "1",
    HOSPITAL_UPDATE_BACKUP_RESERVE_BYTES: "1",
    ...extra,
  })

  return {
    directory, site, home, fakeBin, state, log, removed, compose, record,
    installedVersion, installedLockSha: hash(installedLockBytes), releaseRoot,
    maintainerKey, maintainerPublic, attackerKey, fingerprint,
    preparedDirectory: join(home, ".data", "update-private", "prepared"),
    // Add a release's images to what the registry can serve, by digest only.
    serveImages(version, { omit = [] } = {}) {
      const lines = dockerStateLines(version)
        .filter(line => !omit.some(name => line.startsWith(`ghcr.io/${owner}-${name}@`)))
      writeFileSync(state, `${readFileSync(state, "utf8")}${lines.join("\n")}\n`)
    },
    prepare(version, published, extra = {}) {
      return spawnSync("sh", [join(site, "scripts", "prepare-verified-release.sh"), version, extra.requestId ?? "-"], {
        encoding: "utf8",
        env: environment({ HOSPITAL_UPDATE_LOCAL_ASSET_DIRECTORY: published.assets, ...extra.env }),
      })
    },
    apply(version, extra = {}) {
      return spawnSync("sh", [join(site, "scripts", "apply-prepared-release.sh"), version, extra.requestId ?? "-"], {
        encoding: "utf8",
        env: environment(extra.env ?? {}),
      })
    },
    read: path => readFileSync(path, "utf8"),
    cleanup() {
      rmSync(directory, { recursive: true, force: true, maxRetries: 5 })
    },
  }
}

// Everything an update must not have touched before it is entitled to.
export function observe(appliance) {
  const read = path => {
    try {
      return readFileSync(path, "utf8")
    } catch {
      return null
    }
  }
  const list = path => {
    try {
      return execFileSync("sh", ["-c", `ls -A "$1" 2>/dev/null || true`, "sh", path], { encoding: "utf8" }).trim()
    } catch {
      return ""
    }
  }
  return {
    installedState: read(join(appliance.home, ".data", "installed-release.tsv")),
    current: (() => {
      try {
        return readlinkSync(join(appliance.home, "current"))
      } catch {
        return null
      }
    })(),
    backups: list(join(appliance.home, "backups")),
    releases: list(join(appliance.home, ".data", "releases")),
    activationHistory: list(join(appliance.home, ".data", "release-activation-history")),
    compose: read(appliance.compose) ?? "",
    removedImages: read(appliance.removed) ?? "",
    candidateRuns: read(appliance.record) ?? "",
    dockerInvocations: read(appliance.log) ?? "",
  }
}

export const descriptorFields = [
  "header", "version", "tag", "commit", "candidateRun", "candidateAttempt",
  "lockSha", "signatureSha", "releaseId", "root", "preparedEpoch",
  "installedVersion", "imageSetSha", "schemaMin", "schemaMax",
  "rollbackPolicy", "proofSha",
]

export function readDescriptor(appliance, version) {
  const path = join(appliance.preparedDirectory, version, "prepared-release.v2.tsv")
  const values = readFileSync(path, "utf8").replace(/\n$/, "").split(tab)
  return { path, ...Object.fromEntries(descriptorFields.map((name, index) => [name, values[index]])) }
}

export function imageRowsOf(lockPath) {
  return readFileSync(lockPath, "utf8")
    .split("\n")
    .filter(line => line.startsWith("image\t"))
}

export { join, dirname }
