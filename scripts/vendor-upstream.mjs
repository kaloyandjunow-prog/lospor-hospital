import { execFileSync } from "node:child_process"
import { mkdtempSync, rmSync, mkdirSync, existsSync, readdirSync } from "node:fs"
import { readFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"

/**
 * Re-vendors an upstream client into the appliance.
 *
 * Vendoring is not a copy. Each vendored tree carries deliberate appliance
 * changes on top of upstream — deployment files removed, `@lospor/core` pointed
 * at `vendor/lospor-core` with a `file:` dependency, hospital-only routes,
 * models, scripts and one appliance-only migration, and a `package.json`
 * version held at the bundle's own. Overwriting with a fresh export destroys
 * all of it, silently, and the result still builds.
 *
 * So this is a three-way merge, and git does it rather than a hand-rolled
 * ruleset:
 *
 *     base     the upstream tree at the currently pinned commit
 *     ours     what the appliance ships today
 *     theirs   the upstream tree at the requested version
 *
 * Anything upstream changed that the appliance never touched merges silently.
 * Anything the appliance owns is preserved. A file both sides changed — the
 * six real source deltas, `schema.prisma`, the generated clients — conflicts
 * and is reported, which is the only honest outcome: those need a human.
 *
 * Every tree is materialised through `git archive`, so all content is
 * LF-normalised and the merge never sees the CRLF the Windows working tree
 * holds. That noise would otherwise make every text file look conflicted.
 *
 * Usage:
 *     node scripts/vendor-upstream.mjs <source> <version>
 *     node scripts/vendor-upstream.mjs api 8.2.0
 *
 * The upstream clones are found via LOSPOR_UPSTREAM_ROOT (default C:\LOSAR).
 * Nothing is written to the appliance until the merge succeeds; on conflict the
 * staging directory is left in place so it can be resolved by hand.
 */

const root = fileURLToPath(new URL("..", import.meta.url))
const upstreamRoot = process.env.LOSPOR_UPSTREAM_ROOT ?? "C:\\LOSAR"

/** Which upstream repository backs each vendored path. */
const SOURCES = {
  api: { repo: "lospor-api", path: "apps/api" },
  web: { repo: "lospor-app", path: "apps/web" },
  pwa: { repo: "lospor-mobile", path: "apps/pwa" },
  browser: { repo: "lospor-browser", path: "apps/browser" },
  core: { repo: "lospor-core", path: "vendor/lospor-core" },
}

function git(cwd, ...args) {
  return execFileSync("git", args, { cwd, encoding: "utf8", maxBuffer: 1 << 28 }).trim()
}

function gitQuiet(cwd, ...args) {
  try {
    return { ok: true, out: git(cwd, ...args) }
  } catch (error) {
    return { ok: false, out: `${error.stdout ?? ""}${error.stderr ?? ""}` }
  }
}

/**
 * Materialise a tree from `repo` at `ref` into `into`, LF-normalised.
 *
 * `ref` may be a subtree such as `HEAD:apps/api`, which git unpacks at the
 * root — that is how the appliance's vendored directory is compared against a
 * whole upstream repository without any path juggling.
 */
function exportTree(repo, ref, into) {
  mkdirSync(into, { recursive: true })
  const tar = execFileSync("git", ["archive", "--format=tar", ref],
    { cwd: repo, maxBuffer: 1 << 28 })
  // Extract via cwd rather than `tar -C <dir>`: on Windows the tar on PATH is
  // the MSYS build, which cannot open a native `C:\...` path given as -C.
  execFileSync("tar", ["-x"], { cwd: into, input: tar, maxBuffer: 1 << 28 })
}

/** Replace a git worktree's content wholesale, then commit it. */
function commitTree(repo, message) {
  git(repo, "add", "-A")
  git(repo, "-c", "user.email=vendor@lospor.local", "-c", "user.name=vendor",
    "commit", "--allow-empty", "-m", message)
}

function emptyDirExcept(dir, keep) {
  for (const entry of readdirSync(dir)) {
    if (entry === keep) continue
    rmSync(join(dir, entry), { recursive: true, force: true })
  }
}

const [sourceName, targetVersion] = process.argv.slice(2)
if (!sourceName || !targetVersion) {
  throw new Error(
    `Usage: node scripts/vendor-upstream.mjs <${Object.keys(SOURCES).join("|")}> <version>`,
  )
}

const source = SOURCES[sourceName]
if (!source) throw new Error(`Unknown source '${sourceName}'`)

const manifest = JSON.parse(await readFile(
  new URL("../UPSTREAM_VERSIONS.json", import.meta.url),
  "utf8",
))
const pinned = manifest.sources[sourceName]
if (!pinned) throw new Error(`'${sourceName}' is not in UPSTREAM_VERSIONS.json`)

const upstreamRepo = join(upstreamRoot, source.repo)
if (!existsSync(join(upstreamRepo, ".git"))) {
  throw new Error(
    `No upstream clone at ${upstreamRepo}. Set LOSPOR_UPSTREAM_ROOT to the directory holding the lospor-* clones.`,
  )
}

const targetRef = `v${targetVersion}`
const targetCommit = git(upstreamRepo, "rev-parse", `${targetRef}^{commit}`)

console.log(`${sourceName}: ${pinned.version} -> ${targetVersion}`)
console.log(`  base   ${pinned.commit} (pinned)`)
console.log(`  target ${targetCommit} (${targetRef})`)
console.log(`  into   ${source.path}`)

const stage = mkdtempSync(join(tmpdir(), `lospor-vendor-${sourceName}-`))
const work = join(stage, "merge")
mkdirSync(work, { recursive: true })

git(work, "init", "--quiet")
git(work, "config", "merge.conflictStyle", "diff3")

// base: upstream at the pinned commit
exportTree(upstreamRepo, pinned.commit, work)
commitTree(work, `upstream ${pinned.version}`)
const base = git(work, "rev-parse", "HEAD")

// ours: the appliance's current vendored tree, tracked files only
git(work, "checkout", "--quiet", "-b", "appliance")
emptyDirExcept(work, ".git")
exportTree(root, `HEAD:${source.path}`, work)
commitTree(work, `appliance ${pinned.version}`)

// theirs: upstream at the requested version
git(work, "checkout", "--quiet", "-b", "upstream", base)
emptyDirExcept(work, ".git")
exportTree(upstreamRepo, targetCommit, work)
commitTree(work, `upstream ${targetVersion}`)

git(work, "checkout", "--quiet", "appliance")
const merge = gitQuiet(work, "-c", "user.email=vendor@lospor.local", "-c", "user.name=vendor",
  "merge", "--no-edit", "upstream")

const conflicts = gitQuiet(work, "diff", "--name-only", "--diff-filter=U")
  .out.split("\n").filter(Boolean)

console.log()
if (conflicts.length) {
  console.log(`  ${conflicts.length} file(s) need a human — both sides changed them:`)
  for (const file of conflicts) console.log(`    ${file}`)
  console.log()
  console.log(`  Resolve in: ${work}`)
  console.log("  Then re-run with the same arguments once the tree is clean, or")
  console.log(`  copy the resolved tree over ${source.path} yourself.`)
  process.exitCode = 1
} else if (!merge.ok) {
  console.log(`  Merge failed:\n${merge.out}`)
  process.exitCode = 1
} else {
  console.log("  Merged cleanly.")
  console.log(`  Result: ${work}`)
  console.log()
  console.log("  Nothing has been written to the appliance. Review the tree, then:")
  console.log(`    rm -rf ${source.path} && cp -a "${work}/." ${source.path} && rm -rf ${source.path}/.git`)
  console.log("  and update UPSTREAM_VERSIONS.json:")
  console.log(`    version ${targetVersion}, commit ${targetCommit},`)
  console.log(`    treeOid  <git rev-parse HEAD:${source.path}> after committing`)
}
