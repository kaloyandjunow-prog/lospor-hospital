import { readFile, writeFile } from "node:fs/promises"
import { resolve } from "node:path"
import { createReleaseManifest, serializeManifest } from "./release-artifacts-lib.mjs"

function parseArgs(argv) {
  const result = { offlineParts: [] }
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index]
    const value = argv[index + 1]
    if (!key?.startsWith("--") || value === undefined) throw new Error("Arguments must be --name value pairs")
    if (key === "--offline-part") result.offlineParts.push(value)
    else if (Object.hasOwn(result, key.slice(2))) throw new Error(`Duplicate ${key}`)
    else result[key.slice(2)] = value
  }
  return result
}

const options = parseArgs(process.argv.slice(2))
for (const required of ["version", "commit", "images", "deployment", "evidence", "upstream", "output"]) {
  if (!options[required]) throw new Error(`Missing --${required}`)
}
if (options.offlineParts.length < 1) throw new Error("At least one --offline-part is required")
const imageLock = JSON.parse(await readFile(resolve(options.images), "utf8"))
const manifest = await createReleaseManifest({
  version: options.version,
  commit: options.commit,
  createdAt: options.createdAt ?? new Date().toISOString(),
  imageLock,
  deploymentArchive: resolve(options.deployment),
  securityEvidenceArchive: resolve(options.evidence),
  offlineArchives: options.offlineParts.map(path => resolve(path)),
  upstreamManifest: resolve(options.upstream),
})
await writeFile(resolve(options.output), serializeManifest(manifest), { encoding: "utf8", flag: "wx" })
console.log(`Release manifest written: ${resolve(options.output)}`)
