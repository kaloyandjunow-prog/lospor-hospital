import { createHash } from "node:crypto"
import { readdir, readFile } from "node:fs/promises"

const root = new URL("../vendor/exchange-contract/", import.meta.url)
const manifest = JSON.parse(
  await readFile(new URL("../UPSTREAM_VERSIONS.json", import.meta.url), "utf8"),
)
const expected = manifest.sources.exchangeContract

async function collect(directory, prefix = "") {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = []

  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name
    const url = new URL(entry.name, directory)

    if (entry.isDirectory()) {
      files.push(...await collect(new URL(`${entry.name}/`, directory), relative))
    } else if (
      relative === "package.json"
      || relative.startsWith("schemas/")
      || relative.startsWith("src/")
    ) {
      files.push({ relative, content: await readFile(url) })
    }
  }

  return files
}

const digest = createHash("sha256")
for (const file of await collect(root)) {
  digest.update(file.relative).update("\0").update(file.content).update("\0")
}
const actual = digest.digest("hex")

if (expected.version !== "1.0.0") {
  throw new Error(`Unsupported exchange contract version: ${expected.version}`)
}
if (actual !== expected.sha256) {
  throw new Error(
    `Vendored exchange contract differs from the pinned Central contract: ${actual}`,
  )
}

console.log(`Exchange contract ${expected.version} verified: ${actual}`)
