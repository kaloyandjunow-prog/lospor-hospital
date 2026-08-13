import { createHash } from "node:crypto"
import { createReadStream } from "node:fs"
import { readFile, readdir, stat, writeFile } from "node:fs/promises"
import { basename, join } from "node:path"
import { pathToFileURL } from "node:url"

const SAFE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/
const SHA256 = /^sha256:[a-f0-9]{64}$/

async function localIdentity(directory, name, includeDigest) {
  const path = join(directory, name)
  const metadata = await stat(path)
  if (!metadata.isFile()) throw new Error(`Approved release asset is not a regular file: ${name}`)
  let digest = null
  if (includeDigest) {
    const hash = createHash("sha256")
    for await (const chunk of createReadStream(path)) hash.update(chunk)
    digest = `sha256:${hash.digest("hex")}`
  }
  return { size: metadata.size, digest }
}

export async function inspectReleaseAssets(release, localDirectory, allowStarter = false) {
  if (!release || !Array.isArray(release.assets)) throw new Error("GitHub release REST response has no asset array")
  const localNames = new Set()
  // The caller's exact allowlist is the regular files present in the already
  // verified local final-asset directory.
  for (const entry of await readdir(localDirectory, { withFileTypes: true })) {
    if (entry.isFile()) localNames.add(entry.name)
  }
  const seen = new Set()
  const uploaded = []
  const starter = []
  for (const asset of release.assets) {
    const name = asset?.name
    if (typeof name !== "string" || !SAFE_NAME.test(name) || name.startsWith("-") || basename(name) !== name) {
      throw new Error("GitHub Release contains an unsafe asset name")
    }
    if (seen.has(name)) throw new Error(`GitHub Release contains duplicate asset name: ${name}`)
    seen.add(name)
    if (!localNames.has(name)) throw new Error(`Unexpected release asset: ${name}`)
    if (!Number.isSafeInteger(asset.id) || asset.id <= 0) throw new Error(`Release asset has no safe numeric REST ID: ${name}`)
    if (!Number.isSafeInteger(asset.size) || asset.size < 0) throw new Error(`Release asset has invalid size: ${name}`)
    if (asset.digest !== null && asset.digest !== undefined && !SHA256.test(asset.digest)) {
      throw new Error(`Release asset has invalid digest: ${name}`)
    }

    if (asset.state === "uploaded") {
      const local = await localIdentity(localDirectory, name, asset.digest != null)
      if (asset.size !== local.size) throw new Error(`Uploaded release asset size differs from the approved file: ${name}`)
      if (asset.digest != null && asset.digest !== local.digest) {
        throw new Error(`Uploaded release asset digest differs from the approved file: ${name}`)
      }
      uploaded.push(name)
      continue
    }
    if (asset.state === "starter" && allowStarter && asset.size === 0 && asset.digest == null) {
      starter.push({ id: asset.id, name })
      continue
    }
    throw new Error(`Release asset is not a completed upload or an exact empty starter: ${name}`)
  }
  uploaded.sort()
  starter.sort((left, right) => left.name.localeCompare(right.name))
  return { uploaded, starter }
}

async function main() {
  const arguments_ = process.argv.slice(2)
  const allowStarter = arguments_.at(-1) === "--allow-starter"
  if (allowStarter) arguments_.pop()
  const [releasePath, localDirectory, uploadedPath, starterPath, ...extra] = arguments_
  if (!releasePath || !localDirectory || !uploadedPath || !starterPath || extra.length > 0) {
    throw new Error("Usage: node scripts/inspect-release-assets.mjs <release-rest.json> <local-assets-dir> <uploaded-output> <starter-output> [--allow-starter]")
  }
  const release = JSON.parse(await readFile(releasePath, "utf8"))
  const result = await inspectReleaseAssets(release, localDirectory, allowStarter)
  await writeFile(uploadedPath, result.uploaded.map(name => `${name}\n`).join(""), { flag: "wx" })
  await writeFile(starterPath, result.starter.map(asset => `${asset.id}\t${asset.name}\n`).join(""), { flag: "wx" })
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main()
}
