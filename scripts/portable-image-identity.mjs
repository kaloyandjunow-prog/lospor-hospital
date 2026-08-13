import { execFileSync, spawn } from "node:child_process"
import { createHash } from "node:crypto"

const SHA256_DIGEST = /^sha256:[a-f0-9]{64}$/
const SAFE_ARCHIVE_CONFIG = /^(?:[a-f0-9]{64}\.json|blobs\/sha256\/[a-f0-9]{64})$/
const MAX_JSON_BYTES = 16 * 1024 * 1024

function sha256(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`
}

function assertDigest(value, label) {
  if (typeof value !== "string" || !SHA256_DIGEST.test(value)) {
    throw new Error(`${label} must be a lowercase SHA-256 digest`)
  }
  return value
}

function assertDiffIds(value, label = "rootfsDiffIds") {
  if (!Array.isArray(value) || value.length < 1 || value.some(item => !SHA256_DIGEST.test(item))) {
    throw new Error(`${label} must be a non-empty ordered list of lowercase SHA-256 digests`)
  }
  return [...value]
}

export function validatePortableIdentity(value, label = "portable image identity") {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object`)
  const configDigest = assertDigest(value.configDigest, `${label}.configDigest`)
  const rootfsDiffIds = assertDiffIds(value.rootfsDiffIds, `${label}.rootfsDiffIds`)
  if (value.platform !== "linux/amd64") throw new Error(`${label}.platform must be linux/amd64`)
  return Object.freeze({ configDigest, rootfsDiffIds: Object.freeze(rootfsDiffIds), platform: value.platform })
}

export function samePortableIdentity(leftValue, rightValue) {
  const left = validatePortableIdentity(leftValue, "left identity")
  const right = validatePortableIdentity(rightValue, "right identity")
  return left.configDigest === right.configDigest
    && left.platform === right.platform
    && left.rootfsDiffIds.length === right.rootfsDiffIds.length
    && left.rootfsDiffIds.every((digest, index) => digest === right.rootfsDiffIds[index])
}

function selectArchiveManifest(manifest, reference) {
  if (!Array.isArray(manifest) || manifest.length < 1) throw new Error("docker image save returned no manifest entries")
  const tagged = manifest.filter(entry => Array.isArray(entry?.RepoTags) && entry.RepoTags.includes(reference))
  const selected = tagged.length === 1 ? tagged[0] : manifest.length === 1 ? manifest[0] : undefined
  if (!selected || typeof selected.Config !== "string" || !SAFE_ARCHIVE_CONFIG.test(selected.Config)) {
    throw new Error(`docker image save did not provide one safe config for ${reference}`)
  }
  return selected
}

export function parseDockerArchiveIdentity({ manifestBytes, configBytes, reference, inspect }) {
  let manifest
  let config
  try {
    manifest = JSON.parse(Buffer.from(manifestBytes).toString("utf8"))
    config = JSON.parse(Buffer.from(configBytes).toString("utf8"))
  } catch (error) {
    throw new Error(`docker image save returned invalid JSON: ${error.message}`)
  }
  const selected = selectArchiveManifest(manifest, reference)
  const archiveConfigDigest = sha256(configBytes)
  const configFilenameDigest = selected.Config.match(/[a-f0-9]{64}/)?.[0]
  if (configFilenameDigest !== archiveConfigDigest.slice(7)) {
    throw new Error(`docker image save config filename does not match its bytes for ${reference}`)
  }
  const portable = validatePortableIdentity({
    configDigest: archiveConfigDigest,
    rootfsDiffIds: config?.rootfs?.diff_ids,
    platform: `${config?.os ?? ""}/${config?.architecture ?? ""}`,
  }, `archive identity for ${reference}`)
  if (!inspect || typeof inspect !== "object" || Array.isArray(inspect)) {
    throw new Error(`docker image inspect returned no object for ${reference}`)
  }
  assertDigest(inspect.Id, `local Docker ID for ${reference}`)
  const inspectedPortable = validatePortableIdentity({
    configDigest: archiveConfigDigest,
    rootfsDiffIds: inspect?.RootFS?.Layers,
    platform: `${inspect.Os ?? ""}/${inspect.Architecture ?? ""}`,
  }, `engine identity for ${reference}`)
  if (!samePortableIdentity(portable, inspectedPortable)) {
    throw new Error(`docker inspect and docker save disagree for ${reference}`)
  }
  return Object.freeze({ localDockerId: inspect.Id, ...portable, configPath: selected.Config })
}

function capturePipeline(reference, tarArgs) {
  return new Promise((resolve, reject) => {
    const docker = spawn("docker", ["image", "save", reference], { stdio: ["ignore", "pipe", "pipe"] })
    const tar = spawn("tar", tarArgs, { stdio: ["pipe", "pipe", "pipe"] })
    const output = []
    const dockerErrors = []
    const tarErrors = []
    let bytes = 0
    let failed
    const fail = error => {
      if (failed) return
      failed = error
      docker.kill()
      tar.kill()
    }
    docker.on("error", fail)
    tar.on("error", fail)
    docker.stderr.on("data", chunk => dockerErrors.push(chunk))
    tar.stderr.on("data", chunk => tarErrors.push(chunk))
    tar.stdout.on("data", chunk => {
      bytes += chunk.length
      if (bytes > MAX_JSON_BYTES) return fail(new Error(`docker image save metadata exceeded ${MAX_JSON_BYTES} bytes`))
      output.push(chunk)
    })
    docker.stdout.pipe(tar.stdin)
    let dockerCode
    let tarCode
    const finish = () => {
      if (dockerCode === undefined || tarCode === undefined) return
      if (failed) return reject(failed)
      if (dockerCode !== 0 || tarCode !== 0) {
        const details = `${Buffer.concat(dockerErrors)}${Buffer.concat(tarErrors)}`.trim()
        return reject(new Error(`Could not read docker archive metadata for ${reference}${details ? `: ${details}` : ""}`))
      }
      resolve(Buffer.concat(output))
    }
    docker.on("close", code => { dockerCode = code; finish() })
    tar.on("close", code => { tarCode = code; finish() })
  })
}

export async function inspectLocalImageIdentity(reference) {
  const inspectOutput = execFileSync("docker", ["image", "inspect", reference], {
    encoding: "utf8",
    maxBuffer: MAX_JSON_BYTES,
  })
  const inspected = JSON.parse(inspectOutput)
  if (!Array.isArray(inspected) || inspected.length !== 1) throw new Error(`docker image inspect was ambiguous for ${reference}`)
  const manifestBytes = await capturePipeline(reference, ["-xOf", "-", "manifest.json"])
  const manifest = JSON.parse(manifestBytes.toString("utf8"))
  const selected = selectArchiveManifest(manifest, reference)
  const configBytes = await capturePipeline(reference, ["-xOf", "-", selected.Config])
  return parseDockerArchiveIdentity({ manifestBytes, configBytes, reference, inspect: inspected[0] })
}

function exactRegistryJson(rawOutput, expectedDigest, label) {
  assertDigest(expectedDigest, `${label} digest`)
  const raw = Buffer.isBuffer(rawOutput) ? rawOutput : Buffer.from(rawOutput)
  const candidates = [raw]
  if (raw.at(-1) === 0x0a) candidates.push(raw.subarray(0, raw.length - 1))
  if (raw.length > 1 && raw.at(-2) === 0x0d && raw.at(-1) === 0x0a) candidates.push(raw.subarray(0, raw.length - 2))
  const exact = candidates.find(bytes => sha256(bytes) === expectedDigest)
  if (!exact) throw new Error(`${label} bytes do not match ${expectedDigest}`)
  try {
    return JSON.parse(exact.toString("utf8"))
  } catch (error) {
    throw new Error(`${label} is not JSON: ${error.message}`)
  }
}

export function parseRegistryImageIdentity({ registryDigest, topBytes, platformBytes }) {
  const top = exactRegistryJson(topBytes, registryDigest, "registry manifest")
  let platformManifestDigest = registryDigest
  let manifest = top
  if (Array.isArray(top.manifests)) {
    const matching = top.manifests.filter(descriptor => descriptor?.platform?.os === "linux"
      && descriptor?.platform?.architecture === "amd64"
      && !descriptor?.platform?.variant
      && SHA256_DIGEST.test(descriptor?.digest ?? ""))
    if (matching.length !== 1) throw new Error("Registry index must contain exactly one linux/amd64 platform manifest")
    platformManifestDigest = matching[0].digest
    manifest = exactRegistryJson(platformBytes, platformManifestDigest, "linux/amd64 platform manifest")
  } else if (platformBytes !== undefined && platformBytes !== null) {
    exactRegistryJson(platformBytes, platformManifestDigest, "linux/amd64 platform manifest")
  }
  if (manifest.schemaVersion !== 2 || !manifest.config || !SHA256_DIGEST.test(manifest.config.digest ?? "")) {
    throw new Error("Registry platform manifest has no valid config digest")
  }
  if (!Array.isArray(manifest.layers) || manifest.layers.length < 1 || manifest.layers.some(layer => !SHA256_DIGEST.test(layer?.digest ?? ""))) {
    throw new Error("Registry platform manifest has invalid layers")
  }
  return Object.freeze({
    registryDigest,
    platformManifestDigest,
    configDigest: manifest.config.digest,
    platform: "linux/amd64",
  })
}

function rawRegistryManifest(reference) {
  return execFileSync("docker", ["buildx", "imagetools", "inspect", "--raw", reference], {
    maxBuffer: MAX_JSON_BYTES,
  })
}

export function parseRegistryDescriptorDigest(output, reference = "registry reference") {
  let descriptor
  try {
    descriptor = JSON.parse(Buffer.isBuffer(output) ? output.toString("utf8") : String(output))
  } catch (error) {
    throw new Error(`Registry descriptor for ${reference} is not JSON: ${error.message}`)
  }
  return assertDigest(descriptor?.digest, `registry descriptor for ${reference}`)
}

export function resolveRegistryDigest(reference) {
  const output = execFileSync("docker", [
    "buildx", "imagetools", "inspect", "--format", "{{json .Manifest}}", reference,
  ], { maxBuffer: MAX_JSON_BYTES })
  return parseRegistryDescriptorDigest(output, reference)
}

export function inspectRegistryImageIdentity(reference, registryDigest) {
  assertDigest(registryDigest, "registryDigest")
  const repository = reference.split("@", 1)[0].replace(/:[^/:]+$/, "")
  const topReference = `${repository}@${registryDigest}`
  const topBytes = rawRegistryManifest(topReference)
  const top = exactRegistryJson(topBytes, registryDigest, "registry manifest")
  let platformBytes
  if (Array.isArray(top.manifests)) {
    const matching = top.manifests.filter(descriptor => descriptor?.platform?.os === "linux"
      && descriptor?.platform?.architecture === "amd64"
      && !descriptor?.platform?.variant
      && SHA256_DIGEST.test(descriptor?.digest ?? ""))
    if (matching.length !== 1) throw new Error("Registry index must contain exactly one linux/amd64 platform manifest")
    platformBytes = rawRegistryManifest(`${repository}@${matching[0].digest}`)
  }
  return parseRegistryImageIdentity({ registryDigest, topBytes, platformBytes })
}

export function trivyRepositoryContext(reference) {
  if (typeof reference !== "string" || !reference.startsWith("ghcr.io/") || reference.includes("@")) {
    throw new Error(`Unsupported Trivy scan reference: ${reference}`)
  }
  const lastSlash = reference.lastIndexOf("/")
  const lastColon = reference.lastIndexOf(":")
  return lastColon > lastSlash ? reference.slice(0, lastColon) : reference
}

export function trivyArtifactId(localDockerId, reference) {
  assertDigest(localDockerId, "Trivy Metadata.ImageID")
  return sha256(Buffer.from(`${localDockerId}:${trivyRepositoryContext(reference)}`))
}

export function trivyCycloneDxRootPurl(localDockerId, reference, platform = "linux/amd64") {
  assertDigest(localDockerId, "Trivy CycloneDX ImageID")
  if (platform !== "linux/amd64") throw new Error(`Unsupported CycloneDX platform: ${platform}`)
  const repository = trivyRepositoryContext(reference)
  const name = repository.slice(repository.lastIndexOf("/") + 1)
  return `pkg:oci/${name}@${localDockerId}?arch=amd64&repository_url=${encodeURIComponent(repository)}`
}
