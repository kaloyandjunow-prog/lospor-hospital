import { createHash } from "node:crypto"
import { execFileSync } from "node:child_process"
import { readFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import { vendoredVersionProblem } from "./upstream-version-lib.mjs"

/**
 * Verifies that the vendored upstream trees are the ones the manifest pins.
 *
 * This used to check only that the manifest was well formed — that each source
 * carried a version and a 40-character commit. Nothing compared it to what was
 * actually on disk, so a half-finished re-vendor produced a bundle claiming
 * versions it did not contain, and every check passed.
 *
 * The comparison uses git's own tree object id for each vendored path rather
 * than hashing files here. The repository sets `* text=auto` and Windows
 * checkouts set `core.autocrlf=true`, so the working tree holds CRLF while git
 * stores LF: any byte-level hash would differ between a Windows checkout and
 * the Linux runner in CI. Git normalises on the way in, so a tree id is the
 * same on both, and it costs nothing to compute.
 *
 * The pinned id is the *appliance's* tree, not upstream's. The vendored copies
 * deliberately differ from upstream — removed deployment files, a `file:` Core
 * dependency, and the hospital-only routes, models and migration — so there is
 * no upstream id to compare against. What this proves is that the tree has not
 * drifted since it was pinned, which is the failure worth catching.
 */

const root = fileURLToPath(new URL("..", import.meta.url))

function git(...args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim()
}

const manifest = JSON.parse(await readFile(
  new URL("../UPSTREAM_VERSIONS.json", import.meta.url),
  "utf8",
))

const problems = []

for (const [name, source] of Object.entries(manifest.sources)) {
  if (!source.version) {
    problems.push(`${name}: no pinned version`)
    continue
  }
  if (source.repository && !/^[a-f0-9]{40}$/.test(source.commit ?? "")) {
    problems.push(`${name}: no pinned 40-character commit`)
    continue
  }

  // The exchange contract is verified by verify-pinned-contract.mjs against
  // Central's published hash, which is a different question: not "has this
  // drifted" but "is this the contract Central actually serves".
  if (!source.path) continue

  if (!/^[a-f0-9]{40}$/.test(source.treeOid ?? "")) {
    problems.push(`${name}: no pinned treeOid for ${source.path}`)
    continue
  }

  let actual
  try {
    actual = git("rev-parse", `HEAD:${source.path}`)
  } catch {
    problems.push(`${name}: ${source.path} is not committed`)
    continue
  }

  if (actual !== source.treeOid) {
    problems.push(
      `${name}: ${source.path} is ${actual}, pinned ${source.treeOid}. `
      + "The vendored tree is not the one this bundle claims to ship.",
    )
    continue
  }

  // A matching committed tree says nothing about uncommitted edits sitting on
  // top of it, and those are what ship if someone builds from a dirty checkout.
  const dirty = git("status", "--porcelain", "--", source.path)
  if (dirty) {
    problems.push(
      `${name}: ${source.path} has uncommitted changes:\n    `
      + dirty.split("\n").join("\n    "),
    )
  }

  // The tree id says the path has not drifted; it cannot say the path holds the
  // version pinned for it. See upstream-version-lib.mjs for why that gap is real
  // and which sources can be checked at all.
  let vendored = null
  try {
    vendored = JSON.parse(git("show", `HEAD:${source.path}/package.json`))
  } catch {
    // Not every vendored path is an npm package.
  }
  const versionProblem = vendoredVersionProblem(name, source, vendored)
  if (versionProblem) problems.push(versionProblem)
}

if (problems.length) {
  throw new Error(`Upstream verification failed:\n  - ${problems.join("\n  - ")}`)
}

const digest = createHash("sha256")
  .update(JSON.stringify(manifest.sources))
  .digest("hex")

const pinned = Object.entries(manifest.sources)
  .map(([name, source]) => `${name} ${source.version}`)
  .join(", ")

console.log(`Upstream manifest verified: ${digest}`)
console.log(`Vendored trees match their pins: ${pinned}`)
