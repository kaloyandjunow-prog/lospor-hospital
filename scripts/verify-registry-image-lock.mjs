import { execFileSync } from "node:child_process"
import { readFile } from "node:fs/promises"
import {
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

const arguments_ = process.argv.slice(2)
const immutableOnly = arguments_.at(-1) === "--immutable-only"
if (immutableOnly) arguments_.pop()
const [lockPath, versionArg, imageName, ...extraArguments] = arguments_
if (!lockPath || !versionArg || extraArguments.length > 0 || arguments_.includes("--immutable-only")) {
  throw new Error("Usage: node scripts/verify-registry-image-lock.mjs <image-lock.json> <version> [image-name] [--immutable-only]")
}
const version = validateVersion(versionArg)
const lock = JSON.parse(await readFile(lockPath, "utf8"))
const validated = validateImageLock(lock, version)
if (imageName && !validated.some(image => image.name === imageName)) throw new Error(`Unknown release image '${imageName}'`)
const images = imageName ? validated.filter(image => image.name === imageName) : validated
const docker = (...args) => execFileSync("docker", args, { encoding: "utf8", maxBuffer: 1 << 24 }).trim()

for (const image of images) {
  // Verify the locked immutable descriptor directly. This works before the
  // final version tag exists and binds both the top-level registry digest and
  // the selected linux/amd64 platform manifest/config.
  const immutable = immutableReference(image.reference, image.digest)
  const remote = inspectRegistryImageIdentity(immutable, image.digest)
  if (remote.platformManifestDigest !== image.platformManifestDigest
    || remote.configDigest !== image.configDigest
    || remote.platform !== image.platform) {
    throw new Error(`Registry platform identity changed: ${image.name}`)
  }
  docker("pull", "--platform", image.platform, immutable)
  const immutableLocal = await inspectLocalImageIdentity(immutable)
  if (!samePortableIdentity(immutableLocal, image)) {
    throw new Error(`Immutable digest portable identity changed: ${image.name}`)
  }

  if (!immutableOnly) {
    // Post-promotion verification additionally proves that the human-readable
    // version tag resolves to the same locked descriptor and portable image.
    const tagDigest = resolveRegistryDigest(image.reference)
    if (tagDigest !== image.digest) throw new Error(`Registry tag digest changed: ${image.name}`)
    docker("pull", "--platform", image.platform, image.reference)
    const local = await inspectLocalImageIdentity(image.reference)
    if (!samePortableIdentity(local, image)) throw new Error(`Registry tag portable identity changed: ${image.name}`)
  }
}
console.log(immutableOnly
  ? `All ${images.length} requested immutable registry descriptor(s), platform manifests, and pulled portable identities match Hospital ${version}.`
  : `All ${images.length} requested registry tag(s), immutable descriptors, platform manifests, and portable identities match Hospital ${version}.`)
