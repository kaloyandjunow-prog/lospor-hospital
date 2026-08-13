import { execFileSync } from "node:child_process"
import { writeFile } from "node:fs/promises"
import { resolve } from "node:path"
import {
  OFFICIAL_IMAGE_REGISTRY,
  REQUIRED_IMAGE_NAMES,
  expectedImageReference,
  immutableReference,
  resolveRepoDigest,
  validateImageLock,
  validateVersion,
} from "./release-artifacts-lib.mjs"

function docker(...args) {
  return execFileSync("docker", args, { encoding: "utf8", maxBuffer: 1 << 24 }).trim()
}

function requiredDigestReference(name, environmentName) {
  const value = process.env[environmentName]
  if (!value || !/^[a-z0-9][a-z0-9._:/-]*@sha256:[a-f0-9]{64}$/.test(value)) {
    throw new Error(`${environmentName} must be an approved repository@sha256 digest for ${name}`)
  }
  return value
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
  caddy: requiredDigestReference("caddy", "HOSPITAL_CADDY_SOURCE_IMAGE"),
  "curl-worker": requiredDigestReference("curl-worker", "HOSPITAL_CURL_SOURCE_IMAGE"),
  migrate: `${registry}/lospor-hospital-migrate:${candidateTag}`,
  postgres: requiredDigestReference("postgres", "HOSPITAL_POSTGRES_SOURCE_IMAGE"),
  pwa: `${registry}/lospor-hospital-pwa:${candidateTag}`,
  status: `${registry}/lospor-hospital-status:${candidateTag}`,
  tools: `${registry}/lospor-hospital-tools:${candidateTag}`,
  web: `${registry}/lospor-hospital-web:${candidateTag}`,
}

const images = []
for (const name of REQUIRED_IMAGE_NAMES) {
  const source = sources[name]
  const reference = expectedImageReference(name, version)
  docker("pull", "--platform", "linux/amd64", source)
  const inspected = JSON.parse(docker("image", "inspect", source))[0]
  const digest = resolveRepoDigest(inspected.RepoDigests, source)
  if (source.includes("@") && source.slice(source.lastIndexOf("@") + 1) !== digest) {
    throw new Error(`Registry resolved a different digest for ${source}`)
  }
  if (inspected.Os !== "linux" || inspected.Architecture !== "amd64") {
    throw new Error(`Unexpected platform for ${source}: ${inspected.Os}/${inspected.Architecture}`)
  }
  if (name === "migrate" && process.env.HOSPITAL_MIGRATOR_IMMUTABLE_OUTPUT) {
    await writeFile(resolve(process.env.HOSPITAL_MIGRATOR_IMMUTABLE_OUTPUT), `${immutableReference(source, digest)}\n`, {
      encoding: "utf8",
      flag: "wx",
    })
  }
  docker("tag", immutableReference(source, digest), reference)
  const taggedId = docker("image", "inspect", "--format", "{{.Id}}", reference)
  if (taggedId !== inspected.Id) throw new Error(`Tagging changed the image identity for ${name}`)
  images.push({
    name,
    reference,
    digest,
    imageId: inspected.Id,
    platform: "linux/amd64",
  })
}
const lock = { schemaVersion: 1, images }
validateImageLock(lock, version)
await writeFile(resolve(outputArg), `${JSON.stringify(lock, null, 2)}\n`, { encoding: "utf8", flag: "wx" })
console.log(`Image lock written: ${resolve(outputArg)}`)
