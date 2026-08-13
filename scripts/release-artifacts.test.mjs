import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { chmod, mkdtemp, readFile, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import test from "node:test"
import {
  MAX_OFFLINE_PART_BYTES,
  assertReleaseLockChecksum,
  assertReleaseLockMatchesManifest,
  createReleaseManifest,
  expectedImageReference,
  parseReleaseManifest,
  resolveRepoDigest,
  serializeManifest,
  serializeReleaseLock,
  serializeReleaseLockChecksum,
  validateImageLock,
} from "./release-artifacts-lib.mjs"

const VERSION = "1.0.0"
const hex = character => `sha256:${character.repeat(64)}`
const imageNames = ["api", "browser", "caddy", "curl-worker", "migrate", "postgres", "pwa", "status", "tools", "web"]

function lock() {
  return {
    schemaVersion: 2,
    images: imageNames.map((name, index) => ({
      name,
      reference: expectedImageReference(name, VERSION),
      digest: hex((index % 10).toString()),
      platformManifestDigest: hex(((index + 1) % 10).toString()),
      configDigest: hex(((index + 2) % 10).toString()),
      rootfsDiffIds: [hex(((index + 3) % 10).toString()), hex(((index + 4) % 10).toString())],
      platform: "linux/amd64",
    })),
  }
}

async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), "hospital-release-"))
  const deployment = join(directory, "lospor-hospital-1.0.0-deployment.tar.gz")
  const evidence = join(directory, "lospor-hospital-1.0.0-security-evidence.tar.gz")
  const offline = join(directory, "lospor-hospital-1.0.0-images.tar.gz.part-000")
  const manifestPath = join(directory, "lospor-hospital-1.0.0-manifest.json")
  const upstream = join(directory, "UPSTREAM_VERSIONS.json")
  await Promise.all([writeFile(deployment, "deployment"), writeFile(evidence, "evidence"), writeFile(offline, "offline-images"), writeFile(upstream, "{}\n")])
  const manifest = await createReleaseManifest({
    version: VERSION,
    commit: "a".repeat(40),
    createdAt: "2026-08-13T00:00:00.000Z",
    imageLock: lock(),
    deploymentArchive: deployment,
    securityEvidenceArchive: evidence,
    offlineArchives: [offline],
    upstreamManifest: upstream,
  })
  await writeFile(manifestPath, serializeManifest(manifest))
  return { directory, deployment, evidence, offline, manifestPath, upstream, manifest }
}

test("creates matching JSON and canonical lock records for the same ten image identities", async () => {
  const { deployment, manifest } = await fixture()
  const bytes = Buffer.from(serializeReleaseLock(manifest))
  const checksum = serializeReleaseLockChecksum(bytes, "release.lock")
  assert.match(checksum, /^[a-f0-9]{64}  release\.lock\n$/)
  assert.match(assertReleaseLockChecksum(bytes, checksum, "release.lock"), /^[a-f0-9]{64}$/)
  assert.throws(
    () => assertReleaseLockChecksum(Buffer.concat([bytes, Buffer.from("x")]), checksum, "release.lock"),
    /canonical SHA-256 sidecar/,
  )
  assert.equal(parseReleaseManifest(manifest).images.length, 10)
  assert.match(bytes.toString("utf8"), /\tsha256:[a-f0-9]{64}\tsha256:[a-f0-9]{64}\tlinux\/amd64\tsha256:[a-f0-9]{64},sha256:[a-f0-9]{64}\n/)
  assert.equal(await readFile(deployment, "utf8"), "deployment")
  assert.equal(assertReleaseLockMatchesManifest(bytes, manifest), true)
  assert.throws(() => assertReleaseLockMatchesManifest(Buffer.concat([bytes, Buffer.from("x")]), manifest), /does not exactly match/)
})

test("rejects wrong references, missing images, duplicate services and wrong platforms", () => {
  const latest = lock()
  latest.images[0].reference = "ghcr.io/kaloyandjunow-prog/lospor-hospital-api:latest"
  assert.throws(() => validateImageLock(latest, VERSION), /must use/)
  const wrongRegistry = lock()
  wrongRegistry.images[0].reference = "ghcr.io/attacker/lospor-hospital-api:1.0.0"
  assert.throws(() => validateImageLock(wrongRegistry, VERSION), /must use/)
  const missing = lock()
  missing.images.pop()
  assert.throws(() => validateImageLock(missing, VERSION), /missing/)
  const duplicate = lock()
  duplicate.images[1].name = duplicate.images[0].name
  assert.throws(() => validateImageLock(duplicate, VERSION), /Duplicate/)
  const platform = lock()
  platform.images[0].platform = "linux/arm64"
  assert.throws(() => validateImageLock(platform, VERSION), /unsupported platform/)
  const config = lock()
  config.images[0].configDigest = hex("a").toUpperCase()
  assert.throws(() => validateImageLock(config, VERSION), /invalid config digest/)
  const rootfs = lock()
  rootfs.images[0].rootfsDiffIds.reverse()
  assert.doesNotThrow(() => validateImageLock(rootfs, VERSION), "order is data and may be any valid order")
  rootfs.images[0].rootfsDiffIds = []
  assert.throws(() => validateImageLock(rootfs, VERSION), /invalid rootfs diff IDs/)
  const extra = lock()
  extra.images[0].extra = "ignored-no-more"
  assert.throws(() => validateImageLock(extra, VERSION), /unexpected or missing fields/)
})

test("normalizes Docker Hub RepoDigests and rejects ambiguity", () => {
  assert.equal(resolveRepoDigest([`docker.io/library/postgres@${hex("a")}`], "postgres:17.6-bookworm"), hex("a"))
  assert.equal(resolveRepoDigest([`docker.io/curlimages/curl@${hex("b")}`], "curlimages/curl:8.17.0"), hex("b"))
  assert.throws(() => resolveRepoDigest([], "postgres:17.6-bookworm"), /unambiguous/)
  assert.throws(() => resolveRepoDigest([
    `postgres@${hex("a")}`,
    `docker.io/library/postgres@${hex("b")}`,
  ], "postgres:17.6-bookworm"), /unambiguous/)
})

test("rejects malformed manifests, unsafe artifacts, oversize parts and inconsistent immutable references", async () => {
  const { manifest } = await fixture()
  assert.throws(() => parseReleaseManifest({}), /unexpected or missing fields/)
  const badBytes = structuredClone(manifest)
  badBytes.artifacts.offlineImages[0].bytes = 0
  assert.throws(() => parseReleaseManifest(badBytes), /byte count/)
  const traversal = structuredClone(manifest)
  traversal.artifacts.deployment.file = "../deployment.tar.gz"
  assert.throws(() => parseReleaseManifest(traversal), /unsafe/)
  const tooLarge = structuredClone(manifest)
  tooLarge.artifacts.offlineImages[0].bytes = MAX_OFFLINE_PART_BYTES + 1
  assert.throws(() => parseReleaseManifest(tooLarge), /exceeds/)
  const immutable = structuredClone(manifest)
  immutable.images[0].immutableReference = `ghcr.io/attacker/api@${hex("a")}`
  assert.throws(() => parseReleaseManifest(immutable), /inconsistent/)
  const unknown = structuredClone(manifest)
  unknown.untrusted = true
  assert.throws(() => parseReleaseManifest(unknown), /unexpected or missing fields/)
})

test("host verifier accepts an exact lock checksum and rejects sidecar, lock, and artifact corruption", async () => {
  const { directory, offline, manifest } = await fixture()
  const lockPath = join(directory, "release.lock")
  const checksumPath = join(directory, "release.lock.sha256")
  const lockBytes = Buffer.from(serializeReleaseLock(manifest))
  const checksum = serializeReleaseLockChecksum(lockBytes, "release.lock")
  await Promise.all([
    writeFile(lockPath, lockBytes),
    writeFile(checksumPath, checksum),
    chmod(resolve("scripts/verify-release.sh"), 0o755),
  ])
  const shellPath = process.platform === "win32" ? "C:/Program Files/Git/bin/bash.exe" : "sh"
  const shellArgs = path => process.platform === "win32"
    ? ["scripts/verify-release.sh", ...path.map(value => value.replaceAll("\\", "/"))]
    : ["scripts/verify-release.sh", ...path]
  assert.doesNotThrow(() => execFileSync(shellPath, shellArgs([lockPath, checksumPath, directory, "all"])))
  await writeFile(checksumPath, checksum.toUpperCase())
  assert.throws(() => execFileSync(shellPath, shellArgs([lockPath, checksumPath, directory, "none"]), { stdio: "ignore" }))
  await writeFile(checksumPath, checksum.replace("\n", "\r\n"))
  assert.throws(() => execFileSync(shellPath, shellArgs([lockPath, checksumPath, directory, "none"]), { stdio: "ignore" }))
  await writeFile(checksumPath, checksum)
  await writeFile(offline, "corrupted")
  assert.throws(() => execFileSync(shellPath, shellArgs([lockPath, checksumPath, directory, "all"]), { stdio: "ignore" }))
  await writeFile(lockPath, Buffer.concat([lockBytes, Buffer.from("x")]))
  assert.throws(() => execFileSync(shellPath, shellArgs([lockPath, checksumPath, directory, "none"]), { stdio: "ignore" }))
})

test("Node artifact verifier binds canonical manifest, lock, checksum, and every release artifact", async () => {
  const { directory, manifestPath, manifest } = await fixture()
  const lockPath = join(directory, "lospor-hospital-1.0.0-release.lock")
  const checksumPath = `${lockPath}.sha256`
  const lockBytes = Buffer.from(serializeReleaseLock(manifest))
  const checksum = serializeReleaseLockChecksum(lockBytes, "lospor-hospital-1.0.0-release.lock")
  await Promise.all([writeFile(lockPath, lockBytes), writeFile(checksumPath, checksum)])
  const args = [resolve("scripts/verify-release-artifacts.mjs"), manifestPath, lockPath, checksumPath, directory]
  assert.doesNotThrow(() => execFileSync(process.execPath, args))
  await writeFile(checksumPath, checksum.replace(/^[a-f0-9]/, value => value === "a" ? "b" : "a"))
  assert.throws(() => execFileSync(process.execPath, args, { stdio: "ignore" }))
})

test("JSON serialization is deterministic and validation occurs before publication", async () => {
  const { manifest } = await fixture()
  const first = serializeManifest(manifest)
  const second = serializeManifest(JSON.parse(first))
  assert.equal(first, second)
})

test("checksum sidecar is bound to the exact safe release-lock filename", async () => {
  const { manifest } = await fixture()
  const bytes = Buffer.from(serializeReleaseLock(manifest))
  const checksum = serializeReleaseLockChecksum(bytes, "release.lock")
  assert.throws(() => assertReleaseLockChecksum(bytes, checksum, "other.lock"), /canonical SHA-256 sidecar/)
  assert.throws(() => serializeReleaseLockChecksum(bytes, "../release.lock"), /unsafe/)
})
