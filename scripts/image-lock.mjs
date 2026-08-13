import { readFile } from "node:fs/promises"
import { parseReleaseManifest, validateImageLock, validateVersion } from "./release-artifacts-lib.mjs"
import { inspectLocalImageIdentity, samePortableIdentity } from "./portable-image-identity.mjs"

const [command, path, versionArg] = process.argv.slice(2)
if (!command || !path) throw new Error("Usage: node scripts/image-lock.mjs <refs|verify-loaded|verify-loaded-lock> <lock-or-manifest.json> [version]")
const parsed = JSON.parse(await readFile(path, "utf8"))

if (command === "refs") {
  const images = validateImageLock(parsed, validateVersion(versionArg))
  for (const image of images) console.log(`${image.reference}\t${image.immutableReference}\t${image.configDigest}`)
} else if (command === "verify-loaded") {
  const manifest = parseReleaseManifest(parsed)
  for (const image of manifest.images) {
    const local = await inspectLocalImageIdentity(image.reference)
    if (!samePortableIdentity(local, image)) throw new Error(`Loaded portable image identity mismatch: ${image.name}`)
  }
  console.log(`All ${manifest.images.length} loaded images match release ${manifest.appliance.version}`)
} else if (command === "verify-loaded-lock") {
  const images = validateImageLock(parsed, validateVersion(versionArg))
  for (const image of images) {
    const local = await inspectLocalImageIdentity(image.reference)
    if (!samePortableIdentity(local, image)) throw new Error(`Local portable image identity mismatch: ${image.name}`)
  }
  console.log(`All ${images.length} local images match release ${versionArg}`)
} else {
  throw new Error(`Unknown image-lock command '${command}'`)
}
