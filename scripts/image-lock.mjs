import { execFileSync } from "node:child_process"
import { readFile } from "node:fs/promises"
import { parseReleaseManifest, validateImageLock, validateVersion } from "./release-artifacts-lib.mjs"

const [command, path, versionArg] = process.argv.slice(2)
if (!command || !path) throw new Error("Usage: node scripts/image-lock.mjs <refs|verify-loaded|verify-loaded-lock> <lock-or-manifest.json> [version]")
const parsed = JSON.parse(await readFile(path, "utf8"))

if (command === "refs") {
  const images = validateImageLock(parsed, validateVersion(versionArg))
  for (const image of images) console.log(`${image.reference}\t${image.immutableReference}\t${image.imageId}`)
} else if (command === "verify-loaded") {
  const manifest = parseReleaseManifest(parsed)
  for (const image of manifest.images) {
    const id = execFileSync("docker", ["image", "inspect", "--format", "{{.Id}}", image.reference], { encoding: "utf8" }).trim()
    if (id !== image.imageId) throw new Error(`Loaded image identity mismatch: ${image.name}`)
  }
  console.log(`All ${manifest.images.length} loaded images match release ${manifest.appliance.version}`)
} else if (command === "verify-loaded-lock") {
  const images = validateImageLock(parsed, validateVersion(versionArg))
  for (const image of images) {
    const actual = execFileSync("docker", ["image", "inspect", "--format", "{{.Id}} {{.Os}}/{{.Architecture}}", image.reference], { encoding: "utf8" }).trim()
    if (actual !== `${image.imageId} ${image.platform}`) throw new Error(`Local image identity mismatch: ${image.name}`)
  }
  console.log(`All ${images.length} local images match release ${versionArg}`)
} else {
  throw new Error(`Unknown image-lock command '${command}'`)
}
