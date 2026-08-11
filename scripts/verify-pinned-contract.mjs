import { createHash } from "node:crypto"
import { readdir, readFile } from "node:fs/promises"

/**
 * Verifies the vendored exchange contract against the hash Central publishes.
 *
 * The hash is taken over normalised text, not raw bytes. This repository sets
 * `* text=auto` and Windows checkouts set `core.autocrlf=true`, so the same
 * committed file is CRLF on a maintainer's machine and LF on a Linux runner. A
 * byte-level hash therefore describes the checkout rather than the contract,
 * and the two sides can never agree -- which is exactly what happened: the
 * pinned value was recorded on Windows and every Linux run computed something
 * else. `verify-upstream.mjs` sidesteps the same trap by comparing git tree
 * ids; there is no tree here to compare against, so the text is normalised
 * instead.
 *
 * Run with `--print` to output the computed hash without verifying, which is
 * how the pin is produced. Do not transcribe it by eye.
 */

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
  // Every collected path is text (package.json, schemas/, src/), so normalising
  // CRLF to LF is safe and makes the hash describe the contract rather than the
  // platform it was checked out on.
  const normalized = file.content.toString("utf8").replaceAll("\r\n", "\n")
  digest.update(file.relative).update("\0").update(normalized, "utf8").update("\0")
}
const actual = digest.digest("hex")

if (process.argv.includes("--print")) {
  console.log(actual)
  process.exit(0)
}

// Which contract majors this appliance knows how to speak. 2.0.0 added a
// required `dataDictionary` to VersionSet: Central rejects a manifest without
// it, so an appliance still emitting 1.0.0 manifests is refused at ingest
// before any ciphertext moves.
const SUPPORTED_CONTRACT_VERSIONS = ["2.0.0"]

if (!SUPPORTED_CONTRACT_VERSIONS.includes(expected.version)) {
  throw new Error(
    `Unsupported exchange contract version: ${expected.version}`
    + ` (this appliance speaks ${SUPPORTED_CONTRACT_VERSIONS.join(", ")})`,
  )
}
if (actual !== expected.sha256) {
  throw new Error(
    `Vendored exchange contract differs from the pinned Central contract: ${actual}`,
  )
}

console.log(`Exchange contract ${expected.version} verified: ${actual}`)
