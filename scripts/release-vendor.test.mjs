import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import test from "node:test"
import { ReleaseVendorError, parseTargets, releaseVendor } from "./release-vendor.mjs"

function git(cwd, ...args) {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim()
}
function write(path, value) {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, value)
}
function init(path) {
  mkdirSync(path, { recursive: true })
  git(path, "init", "--quiet")
  for (const [key, value] of [["user.email", "tests@lospor.local"], ["user.name", "tests"], ["core.autocrlf", "false"], ["commit.gpgSign", "false"]]) git(path, "config", key, value)
}
function commitAll(path, message) {
  git(path, "add", "-A")
  git(path, "commit", "--quiet", "-m", message)
  return git(path, "rev-parse", "HEAD")
}
const json = value => `${JSON.stringify(value, null, 2)}\n`

/**
 * An upstream lospor-api at v1.0.0 and v1.1.0, and a Hospital that vendored
 * 1.0.0 with its usual edits: renamed package, its own changelog note, and a
 * hospital-only file. `conflictingCode` also edits a source file on both sides.
 */
function fixture(t, { conflictingCode = false } = {}) {
  const sandbox = mkdtempSync(join(tmpdir(), "hospital-release-vendor-"))
  t.after(() => rmSync(sandbox, { recursive: true, force: true }))
  const upstreamRoot = join(sandbox, "upstream")
  const upstream = join(upstreamRoot, "lospor-api")
  init(upstream)
  const pkg = version => json({ name: "lospor-api", version, dependencies: { "@lospor/core": `github:x/core#v${version}`, next: version === "1.0.0" ? "16.3.7" : "16.3.8" } })
  write(join(upstream, "package.json"), pkg("1.0.0"))
  write(join(upstream, "CHANGELOG.md"), "# API\n\n## [1.0.0] - 2026-10-01\n\n- First.\n")
  write(join(upstream, "src", "route.ts"), "export const answer = 1\n")
  const base = commitAll(upstream, "1.0.0")
  git(upstream, "tag", "v1.0.0")
  write(join(upstream, "package.json"), pkg("1.1.0"))
  write(join(upstream, "CHANGELOG.md"), "# API\n\n## [1.1.0] - 2026-10-04\n\n- **Second.** Text.\n\n## [1.0.0] - 2026-10-01\n\n- First.\n")
  write(join(upstream, "src", "new.ts"), "export const added = true\n")
  if (conflictingCode) write(join(upstream, "src", "route.ts"), "export const answer = 2\n")
  commitAll(upstream, "1.1.0")
  git(upstream, "tag", "v1.1.0")

  const root = join(sandbox, "hospital")
  init(root)
  write(join(root, ".gitignore"), ".data/\nnode_modules/\n")
  write(join(root, "apps", "api", "package.json"), json({ name: "@lospor/hospital-api", version: "1.0.0", dependencies: { "@lospor/core": "file:../../vendor/lospor-core", next: "16.3.7" } }))
  write(join(root, "apps", "api", "CHANGELOG.md"), "# API\n\n## [1.4.21] - 2026-10-02\n\n- Hospital note.\n\n## [1.0.0] - 2026-10-01\n\n- First.\n")
  write(join(root, "apps", "api", "src", "route.ts"), conflictingCode ? "export const answer = 3 // hospital\n" : "export const answer = 1\n")
  write(join(root, "apps", "api", "src", "hospital-only.ts"), "export const hospital = true\n")
  commitAll(root, "vendored 1.0.0")
  write(join(root, "UPSTREAM_VERSIONS.json"), json({ sources: { api: { repository: "x/lospor-api", version: "1.0.0", commit: base, path: "apps/api", treeOid: git(root, "rev-parse", "HEAD:apps/api") } } }))
  commitAll(root, "pin")
  return { root, upstreamRoot, read: path => readFileSync(join(root, path), "utf8") }
}

test("vendors a release whose conflicts are all covered by the rules, then refreshes, stamps and verifies", t => {
  const { root, upstreamRoot, read } = fixture(t)
  const runs = []
  const lines = []
  releaseVendor({ root, upstreamRoot, targets: parseTargets(["api=1.1.0"]), say: line => lines.push(line), run: (command, args, cwd) => runs.push([command.split(/[\\/]/).at(-1), ...args, cwd === root ? "<root>" : cwd.slice(root.length + 1).replace(/\\/g, "/")]) })

  assert.deepEqual(JSON.parse(read("apps/api/package.json")), { name: "@lospor/hospital-api", version: "1.0.0", dependencies: { "@lospor/core": "file:../../vendor/lospor-core", next: "16.3.8" } })
  assert.equal(read("apps/api/CHANGELOG.md"), "# API\n\n## [1.1.0] - 2026-10-04\n\n- **Second.** Text.\n\n## [1.4.21] - 2026-10-02\n\n- Hospital note.\n\n## [1.0.0] - 2026-10-01\n\n- First.\n")
  assert.equal(read("apps/api/src/new.ts"), "export const added = true\n")
  assert.equal(read("apps/api/src/hospital-only.ts"), "export const hospital = true\n")

  const log = git(root, "log", "--format=%B%x00", "-1", "HEAD")
  assert.match(log, /^Vendor api 1\.1\.0/)
  assert.match(log, /resolved by the release:vendor rules/)
  assert.match(log, /package\.json \(package-json\): version: appliance identity kept/)
  assert.match(log, /CHANGELOG\.md \(changelog\)/)
  assert.equal(git(root, "status", "--porcelain", "--untracked-files=no"), "")
  assert.deepEqual(runs, [
    ["npm", "install", "apps/api"],
    ["node", join(root, "scripts", "stamp-upstream.mjs"), "api", "1.1.0", "<root>"].map((part, index) => index === 1 ? part : part),
    ["npm", "run", "verify:upstream", "<root>"],
    ["npm", "run", "verify:hospital-overlays", "<root>"],
  ].map(entry => entry[0] === "node" ? [process.execPath.split(/[\\/]/).at(-1), ...entry.slice(1)] : entry))
})

test("stamps a Hospital edit inside the vendored path first, then vendors onto it", t => {
  const { root, upstreamRoot, read } = fixture(t)
  write(join(root, "apps", "api", "src", "hospital-only.ts"), "export const hospital = 2\n")
  commitAll(root, "hospital edit after the last stamp")
  const bareStamps = []
  const run = (command, args) => {
    if (args.length === 1 && args[0].endsWith("stamp-upstream.mjs")) {
      bareStamps.push(args[0])
      const manifest = JSON.parse(read("UPSTREAM_VERSIONS.json"))
      manifest.sources.api.treeOid = git(root, "rev-parse", "HEAD:apps/api")
      writeFileSync(join(root, "UPSTREAM_VERSIONS.json"), json(manifest))
    }
  }
  assert.throws(() => releaseVendor({ root, upstreamRoot, targets: parseTargets(["api=1.1.0"]), check: true, say: () => {}, run }), /changed since the last stamp/)
  releaseVendor({ root, upstreamRoot, targets: parseTargets(["api=1.1.0"]), say: () => {}, run })
  assert.equal(bareStamps.length, 1)
  assert.match(git(root, "log", "--format=%s", "-2"), /Vendor api 1\.1\.0\nStamp Hospital edits in apps\/api before vendoring/)
  assert.equal(read("apps/api/src/hospital-only.ts"), "export const hospital = 2\n")
})

test("--check reports and changes nothing", t => {
  const { root, upstreamRoot } = fixture(t)
  const head = git(root, "rev-parse", "HEAD")
  const lines = []
  const result = releaseVendor({ root, upstreamRoot, targets: parseTargets(["api=1.1.0"]), check: true, say: line => lines.push(line), run: () => assert.fail("nothing runs in --check") })
  assert.equal(result.applied, false)
  assert.equal(git(root, "rev-parse", "HEAD"), head)
  assert.ok(lines.includes("  package.json: package-json"))
  assert.ok(lines.includes("  CHANGELOG.md: changelog"))
})

test("a conflict outside the rules changes nothing and names the file", t => {
  const { root, upstreamRoot, read } = fixture(t, { conflictingCode: true })
  const head = git(root, "rev-parse", "HEAD")
  assert.throws(
    () => releaseVendor({ root, upstreamRoot, targets: parseTargets(["api=1.1.0"]), say: () => {}, run: () => assert.fail("nothing runs") }),
    // Refused by the up-front check of every source, before any stage exists.
    error => error instanceof ReleaseVendorError && /outside the vendoring rules/.test(error.message) && /apps\/api\/src\/route\.ts/.test(error.message),
  )
  assert.equal(git(root, "rev-parse", "HEAD"), head)
  assert.equal(read("apps/api/src/route.ts"), "export const answer = 3 // hospital\n")
})

test("refuses tracked changes and malformed targets", t => {
  const { root, upstreamRoot } = fixture(t)
  writeFileSync(join(root, "apps", "api", "src", "route.ts"), "dirty\n")
  assert.throws(() => releaseVendor({ root, upstreamRoot, targets: parseTargets(["api=1.1.0"]), say: () => {} }), /Commit or stash/)
  assert.throws(() => parseTargets(["api=1.1"]), /source=X\.Y\.Z/)
  assert.throws(() => parseTargets(["nope=1.0.0"]), /Unknown source/)
  assert.throws(() => parseTargets(["api=1.0.0", "api=1.1.0"]), /named twice/)
  assert.deepEqual(parseTargets(["web=2.0.0", "core=2.0.0"]).map(target => target.source), ["core", "web"])
})
