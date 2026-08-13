import { execFileSync } from "node:child_process"
import { writeFile } from "node:fs/promises"
import { resolve } from "node:path"
import {
  OFFICIAL_IMAGE_REGISTRY,
  IMAGE_LOCK_SCHEMA_VERSION,
  REQUIRED_IMAGE_NAMES,
  expectedImageReference,
  immutableReference,
  validateImageLock,
  validateVersion,
} from "./release-artifacts-lib.mjs"
import {
  inspectLocalImageIdentity,
  inspectRegistryImageIdentity,
  resolveRegistryDigest,
  samePortableIdentity,
} from "./portable-image-identity.mjs"

function docker(...args) {
  return execFileSync("docker", args, { encoding: "utf8", maxBuffer: 1 << 24 }).trim()
}

const [versionArg, outputArg] = process.argv.slice(2)
if (!versionArg || !outputArg) throw new Error("Usage: node scripts/create-image-lock.mjs <version> <output.json>")
const version = validateVersion(versionArg)
const registry = (process.env.HOSPITAL_IMAGE_REGISTRY ?? OFFICIAL_IMAGE_REGISTRY).replace(/\/$/, "")
if (registry !== OFFICIAL_IMAGE_REGISTRY) {
  throw new Error(`HOSPITAL_IMAGE_REGISTRY must be the official registry ${OFFICIAL_IMAGE_REGISTRY}`)
}
const candidateTag = process.env.HOSPITAL_CANDIDATE_TAG
if (!candidateTag || !/^candidate-[a-f0-9]{40}-[1-9][0-9]*-[a-f0-9]{16}$/.test(candidateTag)) {
  throw new Error("HOSPITAL_CANDIDATE_TAG must identify one full Git commit, workflow run, and build-input identity")
}

const sources = {
  api: `${registry}/lospor-hospital-api:${candidateTag}`,
  browser: `${registry}/lospor-hospital-browser:${candidateTag}`,
  caddy: `${registry}/lospor-hospital-caddy:${candidateTag}`,
  "curl-worker": `${registry}/lospor-hospital-curl-worker:${candidateTag}`,
  migrate: `${registry}/lospor-hospital-migrate:${candidateTag}`,
  postgres: `${registry}/lospor-hospital-postgres:${candidateTag}`,
  pwa: `${registry}/lospor-hospital-pwa:${candidateTag}`,
  status: `${registry}/lospor-hospital-status:${candidateTag}`,
  tools: `${registry}/lospor-hospital-tools:${candidateTag}`,
  web: `${registry}/lospor-hospital-web:${candidateTag}`,
}

const images = []
for (const name of REQUIRED_IMAGE_NAMES) {
  const source = sources[name]
  const reference = expectedImageReference(name, version)
  const digest = resolveRegistryDigest(source)
  const registryIdentity = inspectRegistryImageIdentity(source, digest)
  const immutable = immutableReference(source, digest)
  docker("pull", "--platform", "linux/amd64", immutable)
  const localIdentity = await inspectLocalImageIdentity(immutable)
  if (registryIdentity.configDigest !== localIdentity.configDigest
    || registryIdentity.platform !== localIdentity.platform) {
    throw new Error(`Pulled local image does not match the registry platform manifest for ${source}`)
  }
  if (resolveRegistryDigest(source) !== digest) {
    throw new Error(`Candidate registry tag changed while creating the image lock: ${source}`)
  }
  if (name === "migrate" && process.env.HOSPITAL_MIGRATOR_IMMUTABLE_OUTPUT) {
    await writeFile(resolve(process.env.HOSPITAL_MIGRATOR_IMMUTABLE_OUTPUT), `${immutable}\n`, {
      encoding: "utf8",
      flag: "wx",
    })
  }
  docker("tag", immutable, reference)
  const taggedIdentity = await inspectLocalImageIdentity(reference)
  if (!samePortableIdentity(localIdentity, taggedIdentity)) {
    throw new Error(`Tagging changed the portable image identity for ${name}`)
  }
  images.push({
    name,
    reference,
    digest,
    platformManifestDigest: registryIdentity.platformManifestDigest,
    configDigest: localIdentity.configDigest,
    rootfsDiffIds: localIdentity.rootfsDiffIds,
    platform: localIdentity.platform,
  })
}
const lock = { schemaVersion: IMAGE_LOCK_SCHEMA_VERSION, images }
validateImageLock(lock, version)
await writeFile(resolve(outputArg), `${JSON.stringify(lock, null, 2)}\n`, { encoding: "utf8", flag: "wx" })
console.log(`Image lock written: ${resolve(outputArg)}`)
