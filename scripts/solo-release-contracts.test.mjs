import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { execFileSync } from "node:child_process"
import { mkdir, mkdtemp, rm, unlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"
import {
  createReleaseManifest,
  expectedImageReference,
  serializeManifest,
  serializeReleaseLock,
} from "./release-artifacts-lib.mjs"
import {
  expectedReleaseAssetNames,
  verifyReleaseAssetSet,
  verifyReleaseCandidate,
} from "./release-candidate-lib.mjs"
import {
  CANDIDATE_WORKFLOW,
  HANDOFF_HEADER,
  OFFICIAL_REPOSITORY,
  parseReleaseHandoff,
  serializeReleaseHandoff,
  validateReleaseHandoff,
} from "./release-handoff-lib.mjs"
import { parseReleaseInputs, releaseEnvironmentLines } from "./release-inputs.mjs"

const VERSION = "1.2.3"
const COMMIT = "a".repeat(40)
const IMAGE_NAMES = ["api", "browser", "caddy", "curl-worker", "migrate", "postgres", "pwa", "status", "tools", "web"]
const sha256 = value => createHash("sha256").update(value).digest("hex")
const digest = digit => `sha256:${digit.repeat(64)}`

const RELEASE_INPUTS = {
  schemaVersion: 1,
  platform: "linux/amd64",
  images: {
    node: `node:24-bookworm-slim@sha256:${"1".repeat(64)}`,
    nginx: `nginx:1.29.1-alpine@sha256:${"2".repeat(64)}`,
    postgres: `postgres:17.6-bookworm@sha256:${"3".repeat(64)}`,
    caddy: `caddy:2.10.2-alpine@sha256:${"4".repeat(64)}`,
    curl: `curlimages/curl:8.17.0@sha256:${"5".repeat(64)}`,
    trivy: `aquasec/trivy:0.72.0@sha256:${"6".repeat(64)}`,
  },
}

function imageLock() {
  return {
    schemaVersion: 1,
    images: IMAGE_NAMES.map((name, index) => ({
      name,
      reference: expectedImageReference(name, VERSION),
      digest: digest(String(index % 10)),
      imageId: digest(String((index + 1) % 10)),
      platform: "linux/amd64",
    })),
  }
}

async function candidateFixture(t) {
  const directory = await mkdtemp(join(tmpdir(), "hospital-solo-release-"))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const sourceDirectory = join(directory, "source")
  await mkdir(sourceDirectory)
  const prefix = `lospor-hospital-${VERSION}`
  const deployment = join(directory, `${prefix}-deployment.tar.gz`)
  const evidence = join(directory, `${prefix}-security-evidence.tar.gz`)
  const offline = join(directory, `${prefix}-images.tar.gz.part-000`)
  const manifestPath = join(directory, `${prefix}-manifest.json`)
  const lockPath = join(directory, `${prefix}-release.lock`)
  const checksumPath = join(directory, `${prefix}-release.lock.sha256`)
  const imageLockPath = join(directory, `${prefix}-images.json`)
  const publicationRequestPath = join(directory, `${prefix}-publication-request.tsv`)
  const upstream = join(sourceDirectory, "UPSTREAM_VERSIONS.json")
  const lockValue = imageLock()
  await Promise.all([
    writeFile(deployment, "deployment"),
    writeFile(evidence, "security-evidence"),
    writeFile(offline, "offline-images"),
    writeFile(upstream, "{}\n"),
  ])
  const manifest = await createReleaseManifest({
    version: VERSION,
    commit: COMMIT,
    createdAt: "2026-08-13T00:00:00.000Z",
    imageLock: lockValue,
    deploymentArchive: deployment,
    securityEvidenceArchive: evidence,
    offlineArchives: [offline],
    upstreamManifest: upstream,
  })
  const lockBytes = serializeReleaseLock(manifest)
  await Promise.all([
    writeFile(manifestPath, serializeManifest(manifest)),
    writeFile(lockPath, lockBytes),
    writeFile(checksumPath, `${sha256(lockBytes)}  ${prefix}-release.lock\n`),
    writeFile(imageLockPath, `${JSON.stringify(lockValue, null, 2)}\n`),
    writeFile(publicationRequestPath, "publication-request\n"),
  ])
  return {
    directory,
    deployment,
    checksumPath,
    imageLockPath,
    lockPath,
    manifest,
    manifestPath,
    publicationRequestPath,
  }
}

test("release inputs accept the strict pinned contract and emit only canonical build variables", () => {
  const parsed = parseReleaseInputs(RELEASE_INPUTS)
  assert.deepEqual(parsed, RELEASE_INPUTS)
  assert(Object.isFrozen(parsed))
  assert(Object.isFrozen(parsed.images))
  const lines = releaseEnvironmentLines(parsed)
  assert.equal(lines.length, 10)
  assert.deepEqual(lines, [
    `NODE_API_BASE_IMAGE=${RELEASE_INPUTS.images.node}`,
    `NODE_BROWSER_BASE_IMAGE=${RELEASE_INPUTS.images.node}`,
    `NODE_PWA_BUILD_BASE_IMAGE=${RELEASE_INPUTS.images.node}`,
    `NODE_STATUS_BASE_IMAGE=${RELEASE_INPUTS.images.node}`,
    `NODE_WEB_BASE_IMAGE=${RELEASE_INPUTS.images.node}`,
    `NGINX_PWA_BASE_IMAGE=${RELEASE_INPUTS.images.nginx}`,
    `HOSPITAL_POSTGRES_SOURCE_IMAGE=${RELEASE_INPUTS.images.postgres}`,
    `HOSPITAL_CADDY_SOURCE_IMAGE=${RELEASE_INPUTS.images.caddy}`,
    `HOSPITAL_CURL_SOURCE_IMAGE=${RELEASE_INPUTS.images.curl}`,
    `TRIVY_IMAGE=${RELEASE_INPUTS.images.trivy}`,
  ])
})

test("release inputs reject tampered, missing, and extra pins", () => {
  const tampered = structuredClone(RELEASE_INPUTS)
  tampered.images.node = `node:24-bookworm-slim@sha256:${"A".repeat(64)}`
  assert.throws(() => parseReleaseInputs(tampered), /node.*lowercase hex/)

  const missing = structuredClone(RELEASE_INPUTS)
  delete missing.images.trivy
  assert.throws(() => parseReleaseInputs(missing), /unexpected or missing fields/)

  const extra = structuredClone(RELEASE_INPUTS)
  extra.unreviewed = true
  assert.throws(() => parseReleaseInputs(extra), /unexpected or missing fields/)
})

test("publication request round-trips as one canonical, strict record", () => {
  const lock = Buffer.from("canonical release lock\n")
  const value = {
    repository: OFFICIAL_REPOSITORY,
    workflow: CANDIDATE_WORKFLOW,
    runId: "123456789",
    runAttempt: "2",
    version: VERSION,
    tag: `hospital-${VERSION}`,
    commit: COMMIT,
    lockFile: `lospor-hospital-${VERSION}-release.lock`,
    lockBytes: lock.length,
    lockSha256: sha256(lock),
  }
  const text = serializeReleaseHandoff(value)
  assert.equal(text.split("\n", 1)[0], HANDOFF_HEADER)
  assert.equal(text.endsWith("\n"), true)
  assert.deepEqual(parseReleaseHandoff(text), validateReleaseHandoff(value))
  assert.equal(serializeReleaseHandoff(parseReleaseHandoff(text)), text)
})

test("publication request rejects non-canonical and tampered identities", () => {
  const value = {
    repository: OFFICIAL_REPOSITORY,
    workflow: CANDIDATE_WORKFLOW,
    runId: "123456789",
    runAttempt: "2",
    version: VERSION,
    tag: `hospital-${VERSION}`,
    commit: COMMIT,
    lockFile: `lospor-hospital-${VERSION}-release.lock`,
    lockBytes: 42,
    lockSha256: "b".repeat(64),
  }
  const canonical = serializeReleaseHandoff(value)
  assert.throws(() => parseReleaseHandoff(canonical.replaceAll("\n", "\r\n")), /canonical LF/)
  assert.throws(() => parseReleaseHandoff(canonical.trimEnd()), /canonical LF/)

  const attacker = { ...value, repository: "attacker/lospor-hospital" }
  assert.throws(() => serializeReleaseHandoff(attacker), /repository is not official/)
  const mismatchedTag = { ...value, tag: "hospital-9.9.9" }
  assert.throws(() => serializeReleaseHandoff(mismatchedTag), /tag does not match/)
  const extra = { ...value, unreviewed: true }
  assert.throws(() => serializeReleaseHandoff(extra), /unexpected or missing fields/)
})

test("publication request verifier rejects replayed run metadata and a tampered lock", async t => {
  const directory = await mkdtemp(join(tmpdir(), "hospital-solo-handoff-"))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const lockPath = join(directory, `lospor-hospital-${VERSION}-release.lock`)
  const handoffPath = join(directory, `lospor-hospital-${VERSION}-publication-request.tsv`)
  const lock = Buffer.from("canonical release lock\n")
  await Promise.all([
    writeFile(lockPath, lock),
    writeFile(handoffPath, serializeReleaseHandoff({
      repository: OFFICIAL_REPOSITORY,
      workflow: CANDIDATE_WORKFLOW,
      runId: "123456789",
      runAttempt: "2",
      version: VERSION,
      tag: `hospital-${VERSION}`,
      commit: COMMIT,
      lockFile: `lospor-hospital-${VERSION}-release.lock`,
      lockBytes: lock.length,
      lockSha256: sha256(lock),
    })),
  ])
  const verifier = fileURLToPath(new URL("./verify-release-handoff.mjs", import.meta.url))
  const verify = (runId = "123456789", runAttempt = "2") => execFileSync(process.execPath, [
    verifier,
    handoffPath,
    lockPath,
    VERSION,
    COMMIT,
    runId,
    runAttempt,
  ], { stdio: "pipe" })
  assert.doesNotThrow(() => verify())
  assert.throws(() => verify("123456788"), /Command failed/)
  assert.throws(() => verify("123456789", "1"), /Command failed/)
  await writeFile(lockPath, Buffer.concat([lock, Buffer.from("tamper")]))
  assert.throws(() => verify(), /Command failed/)
})

test("release candidate accepts matching canonical metadata and artifacts", async t => {
  const fixture = await candidateFixture(t)
  const result = await verifyReleaseCandidate({
    version: VERSION,
    manifestPath: fixture.manifestPath,
    lockPath: fixture.lockPath,
    checksumPath: fixture.checksumPath,
    imageLockPath: fixture.imageLockPath,
    artifactDirectory: fixture.directory,
    expectedCommit: COMMIT,
  })
  assert.equal(result.manifest.appliance.version, VERSION)
  assert.equal(result.manifest.appliance.gitCommit, COMMIT)
  assert.match(result.lockSha256, /^[a-f0-9]{64}$/)
  assert.equal(await verifyReleaseAssetSet(fixture.directory, result.manifest, "candidate"), true)
  assert.deepEqual(expectedReleaseAssetNames(result.manifest, "candidate"), [
    `lospor-hospital-${VERSION}-deployment.tar.gz`,
    `lospor-hospital-${VERSION}-images.json`,
    `lospor-hospital-${VERSION}-images.tar.gz.part-000`,
    `lospor-hospital-${VERSION}-manifest.json`,
    `lospor-hospital-${VERSION}-publication-request.tsv`,
    `lospor-hospital-${VERSION}-release.lock`,
    `lospor-hospital-${VERSION}-release.lock.sha256`,
    `lospor-hospital-${VERSION}-security-evidence.tar.gz`,
  ])
})

test("release candidate rejects canonical, commit, lock, image, and artifact mismatches", async t => {
  const fixture = await candidateFixture(t)
  const verify = overrides => verifyReleaseCandidate({
    version: VERSION,
    manifestPath: fixture.manifestPath,
    lockPath: fixture.lockPath,
    checksumPath: fixture.checksumPath,
    imageLockPath: fixture.imageLockPath,
    artifactDirectory: fixture.directory,
    expectedCommit: COMMIT,
    ...overrides,
  })

  await assert.rejects(verify({ version: "1.2.4" }), /version does not match/)
  await assert.rejects(verify({ expectedCommit: "b".repeat(40) }), /commit does not match/)

  await writeFile(fixture.manifestPath, `${serializeManifest(fixture.manifest)}\n`)
  await assert.rejects(verify(), /manifest is not canonical/i)
  await writeFile(fixture.manifestPath, serializeManifest(fixture.manifest))

  await writeFile(fixture.lockPath, `${serializeReleaseLock(fixture.manifest)}tamper`)
  await assert.rejects(verify(), /lock does not exactly match/)
  await writeFile(fixture.lockPath, serializeReleaseLock(fixture.manifest))

  await writeFile(fixture.checksumPath, `${"f".repeat(64)}  lospor-hospital-${VERSION}-release.lock\n`)
  await assert.rejects(verify(), /sidecar is not canonical or does not match/)
  const lockBytes = serializeReleaseLock(fixture.manifest)
  await writeFile(fixture.checksumPath, `${sha256(lockBytes)}  lospor-hospital-${VERSION}-release.lock\n`)

  const mismatchedImages = imageLock()
  mismatchedImages.images[0].digest = digest("f")
  await writeFile(fixture.imageLockPath, `${JSON.stringify(mismatchedImages, null, 2)}\n`)
  await assert.rejects(verify(), /Image lock does not exactly match/)
  await writeFile(fixture.imageLockPath, `${JSON.stringify(imageLock(), null, 2)}\n`)

  await writeFile(fixture.deployment, "deploymenx")
  await assert.rejects(verify(), /checksum mismatch/i)
})

test("release asset set rejects both missing and extra candidate assets", async t => {
  const fixture = await candidateFixture(t)
  await unlink(fixture.publicationRequestPath)
  await assert.rejects(
    verifyReleaseAssetSet(fixture.directory, fixture.manifest, "candidate"),
    /incomplete or contains unexpected files/,
  )
  await writeFile(fixture.publicationRequestPath, "publication-request\n")
  await writeFile(join(fixture.directory, "unreviewed.txt"), "unexpected\n")
  await assert.rejects(
    verifyReleaseAssetSet(fixture.directory, fixture.manifest, "candidate"),
    /incomplete or contains unexpected files/,
  )
})
