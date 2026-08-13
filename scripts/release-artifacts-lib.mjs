import { createHash, createPrivateKey, createPublicKey, sign, verify } from "node:crypto"
import { createReadStream } from "node:fs"
import { stat } from "node:fs/promises"
import { basename } from "node:path"

export const RELEASE_SCHEMA_VERSION = 2
export const RELEASE_LOCK_HEADER = "LOSPOR-HOSPITAL-RELEASE-LOCK-V1"
export const OFFICIAL_IMAGE_REGISTRY = "ghcr.io/kaloyandjunow-prog"
export const MAX_OFFLINE_PART_BYTES = 1_900 * 1024 * 1024
export const REQUIRED_IMAGE_NAMES = Object.freeze([
  "api",
  "browser",
  "caddy",
  "curl-worker",
  "migrate",
  "postgres",
  "pwa",
  "status",
  "tools",
  "web",
])

export const THIRD_PARTY_IMAGE_REFERENCES = Object.freeze({
  caddy: "caddy:2.10.2-alpine",
  "curl-worker": "curlimages/curl:8.17.0",
  postgres: "postgres:17.6-bookworm",
})

const SHA256_DIGEST = /^sha256:[a-f0-9]{64}$/
const SHA256_HEX = /^[a-f0-9]{64}$/
const VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/
const COMMIT = /^[a-f0-9]{40}$/
const SAFE_FILENAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/
const SAFE_IMAGE_REFERENCE = /^[a-z0-9][a-z0-9._:/-]*$/

function requireString(value, label) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} must be a non-empty string`)
  return value
}

function strictKeys(value, expected, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object`)
  const actual = Object.keys(value).sort()
  const wanted = [...expected].sort()
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    throw new Error(`${label} has unexpected or missing fields`)
  }
}

export function validateVersion(version) {
  requireString(version, "version")
  if (!VERSION.test(version)) throw new Error(`Invalid release version '${version}'`)
  return version
}

export function expectedImageReference(name, version) {
  if (Object.hasOwn(THIRD_PARTY_IMAGE_REFERENCES, name)) return THIRD_PARTY_IMAGE_REFERENCES[name]
  return `${OFFICIAL_IMAGE_REGISTRY}/lospor-hospital-${name}:${validateVersion(version)}`
}

export function repositoryFromReference(reference) {
  const withoutDigest = reference.split("@", 1)[0]
  const lastSlash = withoutDigest.lastIndexOf("/")
  const lastColon = withoutDigest.lastIndexOf(":")
  return lastColon > lastSlash ? withoutDigest.slice(0, lastColon) : withoutDigest
}

function canonicalRepository(repository) {
  const lowered = repository.toLowerCase()
  const segments = lowered.split("/")
  if (segments.length === 1) return `docker.io/library/${lowered}`
  if (!segments[0].includes(".") && !segments[0].includes(":") && segments[0] !== "localhost") {
    return `docker.io/${lowered}`
  }
  return lowered
}

export function resolveRepoDigest(repoDigests, expectedReference) {
  const wanted = canonicalRepository(repositoryFromReference(expectedReference))
  const matches = (Array.isArray(repoDigests) ? repoDigests : []).filter(value => {
    const at = typeof value === "string" ? value.lastIndexOf("@") : -1
    return at > 0
      && canonicalRepository(value.slice(0, at)) === wanted
      && SHA256_DIGEST.test(value.slice(at + 1))
  })
  const unique = [...new Set(matches.map(value => value.slice(value.lastIndexOf("@") + 1)))]
  if (unique.length !== 1) {
    throw new Error(`Docker did not report one unambiguous registry digest for ${expectedReference}`)
  }
  return unique[0]
}

export function immutableReference(reference, digest) {
  return `${repositoryFromReference(reference)}@${digest}`
}

export function validateImageLock(lock, version) {
  validateVersion(version)
  strictKeys(lock, ["schemaVersion", "images"], "image lock")
  if (lock.schemaVersion !== 1 || !Array.isArray(lock.images)) {
    throw new Error("Image lock must use schemaVersion 1 and contain images")
  }

  const expected = new Set(REQUIRED_IMAGE_NAMES)
  const seen = new Set()
  const images = lock.images.map((image, index) => {
    strictKeys(image, ["name", "reference", "digest", "imageId", "platform"], `images[${index}]`)
    const name = requireString(image.name, `images[${index}].name`)
    const reference = requireString(image.reference, `images[${index}].reference`)
    const digest = requireString(image.digest, `images[${index}].digest`)
    const imageId = requireString(image.imageId, `images[${index}].imageId`)
    const platform = requireString(image.platform, `images[${index}].platform`)
    if (!expected.has(name)) throw new Error(`Unexpected image '${name}'`)
    if (seen.has(name)) throw new Error(`Duplicate image '${name}'`)
    if (!SAFE_IMAGE_REFERENCE.test(reference) || reference.includes("@") || reference.includes("..")) {
      throw new Error(`Image '${name}' has an unsafe reference`)
    }
    const wantedReference = expectedImageReference(name, version)
    if (reference !== wantedReference) {
      throw new Error(`Image '${name}' must use ${wantedReference}; got ${reference}`)
    }
    if (!SHA256_DIGEST.test(digest)) throw new Error(`Image '${name}' has an invalid registry digest`)
    if (!SHA256_DIGEST.test(imageId)) throw new Error(`Image '${name}' has an invalid image ID`)
    if (platform !== "linux/amd64") throw new Error(`Image '${name}' has unsupported platform '${platform}'`)
    seen.add(name)
    return Object.freeze({
      name,
      reference,
      digest,
      imageId,
      platform,
      immutableReference: immutableReference(reference, digest),
    })
  })
  const missing = [...expected].filter(name => !seen.has(name))
  if (missing.length) throw new Error(`Image lock is missing: ${missing.join(", ")}`)
  return images.sort((a, b) => a.name.localeCompare(b.name))
}

export async function sha256File(path) {
  const hash = createHash("sha256")
  await new Promise((resolve, reject) => {
    const input = createReadStream(path)
    input.on("error", reject)
    input.on("data", chunk => hash.update(chunk))
    input.on("end", resolve)
  })
  return hash.digest("hex")
}

export async function artifactRecord(path) {
  const details = await stat(path)
  const file = basename(path)
  if (!details.isFile() || details.size < 1) throw new Error(`Artifact is missing or empty: ${path}`)
  if (!SAFE_FILENAME.test(file) || file.startsWith("-")) throw new Error(`Artifact has an unsafe filename: ${file}`)
  return { file, bytes: details.size, sha256: await sha256File(path) }
}

function expectedPartFile(version, index) {
  return `lospor-hospital-${version}-images.tar.gz.part-${String(index).padStart(3, "0")}`
}

function validateArtifactRecord(value, label, { maxBytes, expectedFile } = {}) {
  strictKeys(value, ["file", "bytes", "sha256"], label)
  if (!SAFE_FILENAME.test(value.file) || value.file.startsWith("-")) throw new Error(`${label} filename is unsafe`)
  if (expectedFile && value.file !== expectedFile) throw new Error(`${label} must be named ${expectedFile}`)
  if (!Number.isSafeInteger(value.bytes) || value.bytes < 1) throw new Error(`${label} byte count is invalid`)
  if (maxBytes && value.bytes > maxBytes) throw new Error(`${label} exceeds ${maxBytes} bytes`)
  if (!SHA256_HEX.test(value.sha256)) throw new Error(`${label} SHA-256 is invalid`)
  return value
}

export async function createReleaseManifest({
  version,
  commit,
  createdAt,
  imageLock,
  deploymentArchive,
  securityEvidenceArchive,
  offlineArchives,
  upstreamManifest,
}) {
  validateVersion(version)
  if (!COMMIT.test(commit)) throw new Error("commit must be a full 40-character Git commit")
  const timestamp = new Date(createdAt)
  if (!Number.isFinite(timestamp.valueOf())) throw new Error("createdAt must be an ISO timestamp")
  if (timestamp.toISOString() !== createdAt) throw new Error("createdAt must be canonical UTC ISO-8601")
  if (!Array.isArray(offlineArchives) || offlineArchives.length < 1 || offlineArchives.length > 999) {
    throw new Error("At least one and at most 999 offline archive parts are required")
  }
  const images = validateImageLock(imageLock, version)
  const deployment = await artifactRecord(deploymentArchive)
  const securityEvidence = await artifactRecord(securityEvidenceArchive)
  const offlineImages = []
  for (let index = 0; index < offlineArchives.length; index += 1) {
    const part = await artifactRecord(offlineArchives[index])
    validateArtifactRecord(part, `offline part ${index}`, {
      maxBytes: MAX_OFFLINE_PART_BYTES,
      expectedFile: expectedPartFile(version, index),
    })
    offlineImages.push(part)
  }
  return {
    schemaVersion: RELEASE_SCHEMA_VERSION,
    appliance: {
      version,
      gitTag: `hospital-${version}`,
      gitCommit: commit,
      platform: "linux/amd64",
    },
    createdAt: timestamp.toISOString(),
    provenance: { upstreamManifestSha256: await sha256File(upstreamManifest) },
    images,
    artifacts: { deployment, securityEvidence, offlineImages },
  }
}

export function serializeManifest(manifest) {
  return `${JSON.stringify(parseReleaseManifest(manifest), null, 2)}\n`
}

export function signManifest(bytes, privateKeyPem) {
  const key = privateKeyPem?.type === "private" ? privateKeyPem : createPrivateKey(privateKeyPem)
  if (key.asymmetricKeyType !== "ed25519") throw new Error("Release signing key must be Ed25519")
  return sign(null, bytes, key).toString("base64")
}

function ed25519PublicKey(publicKeyPem) {
  const key = publicKeyPem?.type === "public" ? publicKeyPem : createPublicKey(publicKeyPem)
  if (key.asymmetricKeyType !== "ed25519") throw new Error("Release key must be Ed25519")
  return key
}

export function verifyManifestSignature(bytes, signatureBase64, publicKeyPem) {
  if (typeof signatureBase64 !== "string" || !/^[A-Za-z0-9+/]+={0,2}\s*$/.test(signatureBase64)) return false
  const signature = Buffer.from(signatureBase64.trim(), "base64")
  if (signature.length !== 64) return false
  return verify(null, bytes, ed25519PublicKey(publicKeyPem), signature)
}

export function publicKeyFingerprint(publicKeyPem) {
  const key = ed25519PublicKey(publicKeyPem)
  const der = key.export({ type: "spki", format: "der" })
  return createHash("sha256").update(der).digest("hex")
}

export function parseReleaseManifest(value) {
  strictKeys(value, ["schemaVersion", "appliance", "createdAt", "provenance", "images", "artifacts"], "release manifest")
  if (value.schemaVersion !== RELEASE_SCHEMA_VERSION) throw new Error("Unsupported release manifest schema")
  strictKeys(value.appliance, ["version", "gitTag", "gitCommit", "platform"], "appliance")
  const version = validateVersion(value.appliance.version)
  if (value.appliance.gitTag !== `hospital-${version}` || !COMMIT.test(value.appliance.gitCommit ?? "")) {
    throw new Error("Release manifest Git identity is invalid")
  }
  if (value.appliance.platform !== "linux/amd64") throw new Error("Unsupported appliance platform")
  const parsedTime = new Date(value.createdAt)
  if (!Number.isFinite(parsedTime.valueOf()) || parsedTime.toISOString() !== value.createdAt) {
    throw new Error("Release manifest timestamp is not canonical ISO-8601")
  }
  strictKeys(value.provenance, ["upstreamManifestSha256"], "provenance")
  if (!SHA256_HEX.test(value.provenance.upstreamManifestSha256)) throw new Error("Invalid upstream manifest SHA-256")
  if (!Array.isArray(value.images)) throw new Error("Release manifest images must be an array")
  const images = validateImageLock({
    schemaVersion: 1,
    images: value.images.map(image => {
      const { immutableReference: claimedImmutable, ...lockImage } = image ?? {}
      const expectedImmutable = image?.reference && image?.digest
        ? immutableReference(image.reference, image.digest)
        : ""
      if (claimedImmutable !== expectedImmutable) throw new Error(`Image '${image?.name ?? "unknown"}' immutable reference is inconsistent`)
      return lockImage
    }),
  }, version)
  strictKeys(value.artifacts, ["deployment", "securityEvidence", "offlineImages"], "artifacts")
  validateArtifactRecord(value.artifacts.deployment, "deployment artifact", {
    expectedFile: `lospor-hospital-${version}-deployment.tar.gz`,
  })
  validateArtifactRecord(value.artifacts.securityEvidence, "security evidence artifact", {
    expectedFile: `lospor-hospital-${version}-security-evidence.tar.gz`,
  })
  if (!Array.isArray(value.artifacts.offlineImages) || value.artifacts.offlineImages.length < 1 || value.artifacts.offlineImages.length > 999) {
    throw new Error("Offline artifact list is invalid")
  }
  value.artifacts.offlineImages.forEach((artifact, index) => validateArtifactRecord(artifact, `offline part ${index}`, {
    maxBytes: MAX_OFFLINE_PART_BYTES,
    expectedFile: expectedPartFile(version, index),
  }))
  const files = [value.artifacts.deployment.file, value.artifacts.securityEvidence.file, ...value.artifacts.offlineImages.map(item => item.file)]
  if (new Set(files).size !== files.length) throw new Error("Release manifest contains duplicate artifact filenames")
  return {
    schemaVersion: RELEASE_SCHEMA_VERSION,
    appliance: { ...value.appliance },
    createdAt: value.createdAt,
    provenance: { ...value.provenance },
    images,
    artifacts: {
      deployment: { ...value.artifacts.deployment },
      securityEvidence: { ...value.artifacts.securityEvidence },
      offlineImages: value.artifacts.offlineImages.map(item => ({ ...item })),
    },
  }
}

export function serializeReleaseLock(manifestValue) {
  const manifest = parseReleaseManifest(manifestValue)
  const release = manifest.appliance
  const manifestBytes = serializeManifest(manifest)
  const manifestRecord = {
    file: `lospor-hospital-${release.version}-manifest.json`,
    bytes: Buffer.byteLength(manifestBytes),
    sha256: createHash("sha256").update(manifestBytes).digest("hex"),
  }
  const lines = [
    RELEASE_LOCK_HEADER,
    [
      "release",
      release.version,
      release.gitTag,
      release.gitCommit,
      release.platform,
      manifest.createdAt,
      manifest.provenance.upstreamManifestSha256,
    ].join("\t"),
    [
      "artifact",
      "manifest",
      "000",
      manifestRecord.file,
      manifestRecord.bytes,
      manifestRecord.sha256,
    ].join("\t"),
    [
      "artifact",
      "deployment",
      "000",
      manifest.artifacts.deployment.file,
      manifest.artifacts.deployment.bytes,
      manifest.artifacts.deployment.sha256,
    ].join("\t"),
    [
      "artifact",
      "security-evidence",
      "000",
      manifest.artifacts.securityEvidence.file,
      manifest.artifacts.securityEvidence.bytes,
      manifest.artifacts.securityEvidence.sha256,
    ].join("\t"),
    ...manifest.artifacts.offlineImages.map((part, index) => [
      "artifact",
      "offline-part",
      String(index).padStart(3, "0"),
      part.file,
      part.bytes,
      part.sha256,
    ].join("\t")),
    ...manifest.images.map(image => [
      "image",
      image.name,
      image.reference,
      image.digest,
      image.imageId,
      image.platform,
    ].join("\t")),
  ]
  return `${lines.join("\n")}\n`
}

export function assertReleaseLockMatchesManifest(lockBytes, manifestValue) {
  const expected = serializeReleaseLock(manifestValue)
  const actual = Buffer.isBuffer(lockBytes) ? lockBytes.toString("utf8") : String(lockBytes)
  if (actual !== expected) throw new Error("Release lock does not exactly match the signed JSON manifest")
  return true
}
