import { readFile, writeFile } from "node:fs/promises"
import { resolve } from "node:path"
import { serializeReleaseLock } from "./release-artifacts-lib.mjs"

const [manifestArg, outputArg] = process.argv.slice(2)
if (!manifestArg || !outputArg) {
  throw new Error("Usage: node scripts/create-release-lock.mjs <manifest.json> <release.lock>")
}
const manifest = JSON.parse(await readFile(resolve(manifestArg), "utf8"))
await writeFile(resolve(outputArg), serializeReleaseLock(manifest), { encoding: "utf8", flag: "wx" })
console.log(`Canonical release lock written: ${resolve(outputArg)}`)
