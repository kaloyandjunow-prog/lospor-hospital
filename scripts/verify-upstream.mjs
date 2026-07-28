import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"

const manifest = JSON.parse(await readFile(
  new URL("../UPSTREAM_VERSIONS.json", import.meta.url),
  "utf8",
))

for (const [name, source] of Object.entries(manifest.sources)) {
  if (!source.version) throw new Error(`${name} has no pinned version`)
  if (source.repository && !/^[a-f0-9]{40}$/.test(source.commit ?? "")) {
    throw new Error(`${name} has no pinned 40-character commit`)
  }
}

const digest = createHash("sha256")
  .update(JSON.stringify(manifest.sources))
  .digest("hex")
console.log(`Upstream manifest verified: ${digest}`)
