import assert from "node:assert/strict"
import { join } from "node:path"
import test from "node:test"
import { TRAIN, TrainError, pinCore, plan, runTrain } from "./upstream-train.mjs"

const VERSION = "9.14.0"
const ROOT = "/up"
const CORE_MERGE = "c".repeat(40)
const lockFor = from => `{
  "packages": {
    "node_modules/@lospor/core": {
      "version": "${from}",
      "resolved": "git+ssh://git@github.com/kaloyandjunow-prog/lospor-core.git#${"0".repeat(40)}",
      "dependencies": {}
    }
  },
  "dependencies": { "@lospor/core": "github:kaloyandjunow-prog/lospor-core#v${from}" }
}
`

/** A fake GitHub and five clones. `protectedMerge` simulates the browser merge. */
function world({ released = [], prState = "OPEN", version = VERSION } = {}) {
  const files = new Map()
  const repos = new Map()
  for (const { repo, pinsCore } of TRAIN) {
    const dir = join(ROOT, repo)
    files.set(join(dir, "package.json"), `{\n  "name": "${repo}",\n  "version": "${version}",\n  "dependencies": {${pinsCore ? `\n    "@lospor/core": "github:kaloyandjunow-prog/lospor-core#v9.13.9"\n  ` : ""}}\n}\n`)
    files.set(join(dir, "CHANGELOG.md"), `# ${repo}\n\n## [${version}] - 2026-10-04\n`)
    if (pinsCore) files.set(join(dir, "package-lock.json"), lockFor("9.13.9"))
    repos.set(repo, { branch: "feat/9.14.0", dirty: false, tags: new Set(released.includes(repo) ? [`v${VERSION}`] : []), pr: null, prState, merges: 0, commits: [] })
  }
  const calls = []
  const exec = (command, args, cwd) => {
    const repo = cwd.split(/[\\/]/).at(-1)
    const state = repos.get(repo)
    calls.push([repo, command, ...args].join(" "))
    if (command === "git") {
      if (args[0] === "ls-remote") return state.tags.has(`v${VERSION}`) ? `${CORE_MERGE}\trefs/tags/v${VERSION}` : ""
      if (args[0] === "branch") return state.branch
      if (args[0] === "status") { const dirty = state.dirty; return dirty ? " M package.json" : "" }
      if (args[0] === "add") { state.dirty = false; return "" }
      if (args[0] === "commit") { state.commits.push(args.at(-1)); return "" }
      if (args[0] === "tag") { state.tags.add(args[2]); state.taggedAt = args[3]; return "" }
      return ""
    }
    if (args.includes("list")) return state.pr ?? ""
    if (args[1] === "create") { state.pr = "7"; return "" }
    if (args[1] === "view" && args.includes("state")) return state.prState
    if (args[1] === "view" && args.includes("mergeCommit")) return repo === "lospor-core" ? CORE_MERGE : "d".repeat(40)
    if (args[1] === "merge") { state.merges++; state.prState = "MERGED"; return "" }
    if (args[1] === "checks") return ""
    throw new Error(`unexpected ${command} ${args.join(" ")}`)
  }
  const write = (path, text) => {
    if (files.get(path) !== text) repos.get(path.split(/[\\/]/).at(-2)).dirty = true
    files.set(path, text)
  }
  return { files, repos, calls, exec, read: path => files.get(path) ?? (() => { throw new Error(`no ${path}`) })(), write, exists: () => true }
}

test("pinCore moves the tag in package.json and both the tag and the resolved commit in the lock", () => {
  const { pkg, lock } = pinCore('"@lospor/core": "github:kaloyandjunow-prog/lospor-core#v9.13.9"', lockFor("9.13.9"), VERSION, CORE_MERGE)
  assert.equal(pkg, `"@lospor/core": "github:kaloyandjunow-prog/lospor-core#v${VERSION}"`)
  assert.match(lock, new RegExp(`"version": "${VERSION}",\\s*"resolved": "git\\+ssh://git@github\\.com/kaloyandjunow-prog/lospor-core\\.git#${CORE_MERGE}"`))
  assert.match(lock, /lospor-core#v9\.14\.0"/)
  assert.throws(() => pinCore("{}", lockFor("9.13.9"), VERSION, CORE_MERGE), /no @lospor\/core tag pin/)
  assert.throws(() => pinCore('"lospor-core#v1.0.0"', "{}", VERSION, CORE_MERGE), /no resolved/)
  assert.throws(() => pinCore('"lospor-core#v1.0.0"', lockFor("1.0.0"), VERSION, "abc"), /full commit/)
})

test("runs the train in order, pins Core's merged commit, merges, waits on protected mains and tags after merging", async () => {
  const w = world()
  const lines = []
  // The browser merge of a protected main: the PR turns MERGED while the driver waits.
  const exec = (command, args, cwd) => {
    const repo = cwd.split(/[\\/]/).at(-1)
    if (args[1] === "checks" && ["lospor-api", "lospor-docs"].includes(repo)) setTimeout(() => { w.repos.get(repo).prState = "MERGED" }, 5)
    return w.exec(command, args, cwd)
  }
  await runTrain({ version: VERSION, root: ROOT, exec, say: line => lines.push(line), poll: 1, maxWait: 2000, read: w.read, write: w.write, exists: w.exists })

  const merges = Object.fromEntries([...w.repos].map(([repo, state]) => [repo, state.merges]))
  assert.deepEqual(merges, { "lospor-core": 1, "lospor-app": 1, "lospor-mobile": 1, "lospor-api": 0, "lospor-docs": 0 })
  for (const [, state] of w.repos) assert.ok(state.tags.has(`v${VERSION}`))
  assert.equal(w.repos.get("lospor-core").taggedAt, CORE_MERGE)
  for (const repo of ["lospor-app", "lospor-mobile", "lospor-api"]) {
    assert.match(w.files.get(join(ROOT, repo, "package-lock.json")), new RegExp(`lospor-core\\.git#${CORE_MERGE}`))
    assert.deepEqual(w.repos.get(repo).commits, [`Core dependency moved to ${VERSION}`])
  }
  assert.deepEqual(w.repos.get("lospor-docs").commits, [])
  assert.ok(lines.some(line => line.includes("Merge #7 in the browser") && line.includes("lospor-api")))
  // Core is tagged before anything pins it.
  const order = w.calls.filter(call => / tag -a | push --quiet -u /.test(call)).map(call => call.split(" ").slice(0, 3).join(" "))
  assert.deepEqual(order.slice(0, 3), ["lospor-core git push", "lospor-core git tag", "lospor-app git push"])
})

test("resumes: a released repo is skipped and its tag still feeds the pins", async () => {
  const w = world({ released: ["lospor-core", "lospor-app"] })
  await runTrain({ version: VERSION, root: ROOT, exec: (c, a, d) => { if (a[1] === "checks") { const r = d.split(/[\\/]/).at(-1); if (["lospor-api", "lospor-docs"].includes(r)) w.repos.get(r).prState = "MERGED" } return w.exec(c, a, d) }, say: () => {}, poll: 1, maxWait: 2000, read: w.read, write: w.write, exists: w.exists })
  assert.equal(w.repos.get("lospor-core").merges, 0)
  assert.equal(w.repos.get("lospor-app").merges, 0)
  assert.ok(!w.calls.some(call => call.startsWith("lospor-core git push")))
  assert.match(w.files.get(join(ROOT, "lospor-mobile", "package-lock.json")), new RegExp(`#${CORE_MERGE}`))
})

test("refuses a repo that is not ready, before pushing it", async () => {
  for (const [break_, message] of [
    [w => { w.repos.get("lospor-core").branch = "main" }, /release branch/],
    [w => { w.repos.get("lospor-core").dirty = true }, /uncommitted changes/],
    [w => { w.files.set(join(ROOT, "lospor-core", "CHANGELOG.md"), "# core\n") }, /no \[9\.14\.0\] entry/],
  ]) {
    const w = world()
    break_(w)
    await assert.rejects(runTrain({ version: VERSION, root: ROOT, exec: w.exec, say: () => {}, poll: 1, maxWait: 2000, read: w.read, write: w.write, exists: w.exists }), error => error instanceof TrainError && message.test(error.message))
    assert.ok(!w.calls.some(call => call.includes(" push ")))
  }
  const wrongVersion = world({ version: "9.13.9" })
  await assert.rejects(runTrain({ version: VERSION, root: ROOT, exec: wrongVersion.exec, say: () => {}, read: wrongVersion.read, write: wrongVersion.write, exists: wrongVersion.exists }), /is 9\.13\.9, not 9\.14\.0/)
})

test("stops when a PR is closed instead of merged", async () => {
  const w = world()
  const exec = (command, args, cwd) => {
    if (args[1] === "merge") { w.repos.get("lospor-core").prState = "CLOSED"; return "" }
    return w.exec(command, args, cwd)
  }
  await assert.rejects(runTrain({ version: VERSION, root: ROOT, exec, say: () => {}, poll: 1, maxWait: 2000, read: w.read, write: w.write, exists: w.exists }), /closed without merging/)
  assert.equal(w.repos.get("lospor-core").tags.size, 0)
})

test("stops waiting for a merge that never comes, so a rerun can resume", async () => {
  const w = world()
  const exec = (command, args, cwd) => args[1] === "merge" ? "" : w.exec(command, args, cwd)
  await assert.rejects(runTrain({ version: VERSION, root: ROOT, exec, say: () => {}, poll: 1, maxWait: 20, read: w.read, write: w.write, exists: w.exists }), /not merged within/)
  assert.equal(w.repos.get("lospor-core").tags.size, 0)
})

test("the plan names every step, and the browser merge where main is protected", () => {
  const steps = plan(VERSION)
  assert.equal(steps.filter(step => step.includes("pin @lospor/core")).length, 3)
  assert.ok(steps.some(step => step.startsWith("lospor-api: wait for CI, then wait for you to merge it in the browser")))
  assert.ok(steps.some(step => step.startsWith("lospor-core: wait for CI, then squash-merge")))
})
