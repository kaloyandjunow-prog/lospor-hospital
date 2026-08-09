import { execFileSync } from "node:child_process"
import { existsSync } from "node:fs"
import { readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { fileURLToPath } from "node:url"

/**
 * Writes `UPSTREAM_VERSIONS.json` from what is actually committed.
 *
 * The manifest used to be filled in by hand: `vendor-upstream.mjs` printed the
 * commands to run and a note to paste the tree ids in afterwards. That failed
 * exactly the way hand-copied hashes always fail — the pins were stamped, a
 * follow-up commit changed the vendored trees, and nothing re-stamped them. The
 * bundle then claimed to ship trees it did not contain, and the only thing that
 * noticed was `update.sh` running on a hospital's server during their update.
 *
 * So the manifest is generated. There is no supported way to type a tree id
 * into it any more.
 *
 * The one property that matters here is that stamping must never be able to
 * launder a dirty tree. A pin taken while a vendored path has uncommitted edits
 * would describe something no one can reproduce, so a dirty path is refused
 * rather than stamped. `verify-upstream.mjs` makes the same check from the
 * other side.
 *
 * Usage:
 *     node scripts/stamp-upstream.mjs                 re-stamp every tree id
 *     node scripts/stamp-upstream.mjs api 8.5.0       also move api to 8.5.0
 *
 * Run it after committing the vendored tree — it reads `HEAD`, not the working
 * directory, because that is what a hospital receives.
 */

const root = fileURLToPath(new URL("..", import.meta.url))
const manifestPath = new URL("../UPSTREAM_VERSIONS.json", import.meta.url)

/** Which upstream repository backs each vendored path. Mirrors vendor-upstream.mjs. */
const SOURCES = {
  api: "lospor-api",
  web: "lospor-app",
  pwa: "lospor-mobile",
  browser: "lospor-browser",
  core: "lospor-core",
}

function git(cwd, ...args) {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim()
}

function upstreamClone(repo) {
  const base = process.env.LOSPOR_UPSTREAM_ROOT ?? join(root, "..", "LOSPOR")
  const clone = join(base, repo)
  if (!existsSync(join(clone, ".git"))) {
    throw new Error(
      `No upstream clone at ${clone}. Set LOSPOR_UPSTREAM_ROOT to the directory holding the lospor-* clones.`,
    )
  }
  return clone
}

const [sourceName, targetVersion] = process.argv.slice(2)
if (sourceName && !SOURCES[sourceName]) {
  throw new Error(`Unknown source '${sourceName}'. Known: ${Object.keys(SOURCES).join(", ")}`)
}
if (sourceName && !targetVersion) {
  throw new Error(`Usage: node scripts/stamp-upstream.mjs [${Object.keys(SOURCES).join("|")}] [version]`)
}

const manifest = JSON.parse(await readFile(manifestPath, "utf8"))

// Move one source to a new upstream release, if asked. The commit is resolved
// from the upstream tag rather than accepted as an argument: a version and a
// commit that disagree is precisely the class of error this script exists to
// remove.
if (sourceName) {
  const pinned = manifest.sources[sourceName]
  if (!pinned) throw new Error(`'${sourceName}' is not in UPSTREAM_VERSIONS.json`)
  const clone = upstreamClone(SOURCES[sourceName])
  pinned.commit = git(clone, "rev-parse", `v${targetVersion}^{commit}`)
  pinned.version = targetVersion
  console.log(`${sourceName}: pinned to ${targetVersion} (${pinned.commit})`)
}

const problems = []
const stamped = []

for (const [name, source] of Object.entries(manifest.sources)) {
  // The exchange contract has no vendored path; it is pinned by content hash
  // and checked by verify-pinned-contract.mjs against what Central serves.
  if (!source.path) continue

  const dirty = git(root, "status", "--porcelain", "--", source.path)
  if (dirty) {
    problems.push(
      `${name}: ${source.path} has uncommitted changes, refusing to stamp:\n    `
      + dirty.split("\n").join("\n    "),
    )
    continue
  }

  let treeOid
  try {
    treeOid = git(root, "rev-parse", `HEAD:${source.path}`)
  } catch {
    problems.push(`${name}: ${source.path} is not committed`)
    continue
  }

  if (source.treeOid !== treeOid) {
    stamped.push(`${name}: ${source.treeOid ?? "(unset)"} -> ${treeOid}`)
  }
  source.treeOid = treeOid
}

if (problems.length) {
  throw new Error(`Cannot stamp:\n  - ${problems.join("\n  - ")}`)
}

manifest.importedAt = new Date().toISOString()

await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8")

if (stamped.length) {
  console.log("Updated tree ids:")
  for (const line of stamped) console.log(`  ${line}`)
} else {
  console.log("Tree ids already matched; only importedAt changed.")
}
console.log("Wrote UPSTREAM_VERSIONS.json. Commit it, then run `npm run verify:upstream`.")
