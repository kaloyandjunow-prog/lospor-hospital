import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { generateKeyPairSync } from "node:crypto"
import { chmod, mkdtemp, readFile, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import test from "node:test"
import {
  MAX_OFFLINE_PART_BYTES,
  assertReleaseLockMatchesManifest,
  createReleaseManifest,
  expectedImageReference,
  parseReleaseManifest,
  publicKeyFingerprint,
  resolveRepoDigest,
  serializeManifest,
  serializeReleaseLock,
  signManifest,
  validateImageLock,
  verifyManifestSignature,
} from "./release-artifacts-lib.mjs"

const VERSION = "1.0.0"
const hex = character => `sha256:${character.repeat(64)}`
const imageNames = ["api", "browser", "caddy", "curl-worker", "migrate", "postgres", "pwa", "status", "tools", "web"]

function lock() {
  return {
    schemaVersion: 1,
    images: imageNames.map((name, index) => ({
      name,
      reference: expectedImageReference(name, VERSION),
      digest: hex((index % 10).toString()),
      imageId: hex(((index + 1) % 10).toString()),
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
  const { privateKey, publicKey } = generateKeyPairSync("ed25519")
  const signature = signManifest(bytes, privateKey)
  assert.equal(verifyManifestSignature(bytes, signature, publicKey), true)
  assert.equal(verifyManifestSignature(Buffer.concat([bytes, Buffer.from("x")]), signature, publicKey), false)
  assert.match(publicKeyFingerprint(publicKey), /^[a-f0-9]{64}$/)
  assert.equal(parseReleaseManifest(manifest).images.length, 10)
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

test("OpenSSL host verifier accepts genuine lock and rejects tampering, wrong key and artifact corruption", async () => {
  const { directory, offline, manifest } = await fixture()
  const lockPath = join(directory, "release.lock")
  const signaturePath = join(directory, "release.lock.sig")
  const privatePath = join(directory, "private.pem")
  const publicPath = join(directory, "public.pem")
  const wrongPublicPath = join(directory, "wrong-public.pem")
  const lockBytes = Buffer.from(serializeReleaseLock(manifest))
  const pair = generateKeyPairSync("ed25519")
  const wrongPair = generateKeyPairSync("ed25519")
  await Promise.all([
    writeFile(lockPath, lockBytes),
    writeFile(signaturePath, `${signManifest(lockBytes, pair.privateKey)}\n`),
    writeFile(privatePath, pair.privateKey.export({ type: "pkcs8", format: "pem" })),
    writeFile(publicPath, pair.publicKey.export({ type: "spki", format: "pem" })),
    writeFile(wrongPublicPath, wrongPair.publicKey.export({ type: "spki", format: "pem" })),
    chmod(resolve("scripts/verify-release.sh"), 0o755),
  ])
  const shellPath = process.platform === "win32" ? "C:/Program Files/Git/bin/bash.exe" : "sh"
  const shellArgs = path => process.platform === "win32"
    ? ["scripts/verify-release.sh", ...path.map(value => value.replaceAll("\\", "/"))]
    : ["scripts/verify-release.sh", ...path]
  assert.doesNotThrow(() => execFileSync(shellPath, shellArgs([lockPath, signaturePath, publicPath, directory, "all"])))
  assert.throws(() => execFileSync(shellPath, shellArgs([lockPath, signaturePath, wrongPublicPath, directory, "all"]), { stdio: "ignore" }))
  await writeFile(offline, "corrupted")
  assert.throws(() => execFileSync(shellPath, shellArgs([lockPath, signaturePath, publicPath, directory, "all"]), { stdio: "ignore" }))
  await writeFile(lockPath, Buffer.concat([lockBytes, Buffer.from("x")]))
  assert.throws(() => execFileSync(shellPath, shellArgs([lockPath, signaturePath, publicPath, directory, "none"]), { stdio: "ignore" }))
})

test("JSON serialization is deterministic and validation occurs before signing", async () => {
  const { manifest } = await fixture()
  const first = serializeManifest(manifest)
  const second = serializeManifest(JSON.parse(first))
  assert.equal(first, second)
})

test("rejects a non-Ed25519 release key", async () => {
  const { manifest } = await fixture()
  const bytes = Buffer.from(serializeReleaseLock(manifest))
  const rsa = generateKeyPairSync("rsa", { modulusLength: 2048 })
  assert.throws(() => signManifest(bytes, rsa.privateKey), /Ed25519/)
  assert.throws(() => verifyManifestSignature(bytes, "A".repeat(86) + "==", rsa.publicKey), /Ed25519/)
})
