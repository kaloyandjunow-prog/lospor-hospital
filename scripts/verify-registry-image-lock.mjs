import { execFileSync } from "node:child_process"
import { readFile } from "node:fs/promises"
import {
  immutableReference,
  resolveRepoDigest,
  validateImageLock,
  validateVersion,
} from "./release-artifacts-lib.mjs"

const [lockPath, versionArg, imageName] = process.argv.slice(2)
if (!lockPath || !versionArg) throw new Error("Usage: node scripts/verify-registry-image-lock.mjs <image-lock.json> <version>")
const version = validateVersion(versionArg)
const lock = JSON.parse(await readFile(lockPath, "utf8"))
const validated = validateImageLock(lock, version)
if (imageName && !validated.some(image => image.name === imageName)) throw new Error(`Unknown release image '${imageName}'`)
const images = imageName ? validated.filter(image => image.name === imageName) : validated
const docker = (...args) => execFileSync("docker", args, { encoding: "utf8", maxBuffer: 1 << 24 }).trim()

for (const image of images) {
  docker("pull", "--platform", "linux/amd64", image.reference)
  const inspectedTag = JSON.parse(docker("image", "inspect", image.reference))[0]
  const tagDigest = resolveRepoDigest(inspectedTag.RepoDigests, image.reference)
  if (tagDigest !== image.digest) throw new Error(`Registry tag digest changed: ${image.name}`)
  if (inspectedTag.Id !== image.imageId || inspectedTag.Os !== "linux" || inspectedTag.Architecture !== "amd64") {
    throw new Error(`Registry tag image identity changed: ${image.name}`)
  }
  docker("pull", "--platform", "linux/amd64", immutableReference(image.reference, image.digest))
}
console.log(`All ${images.length} requested registry tag(s) and immutable digest(s) match Hospital ${version}.`)
