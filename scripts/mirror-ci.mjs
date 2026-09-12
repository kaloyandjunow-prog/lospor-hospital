#!/usr/bin/env node
/**
 * Run locally what `quality.yml` runs in CI, in the same order.
 *
 * This exists because of a specific and repeatable waste: a change was pushed
 * after running typecheck and the test suite, and CI failed on
 * `verify:boundaries` and `lint` -- steps that were never run locally because
 * the list was in someone's head. Each round trip costs a full CI cycle to
 * learn something a laptop could have said in a minute.
 *
 * So the step list is *read from the workflow* rather than written here. A step
 * added to `quality.yml` is picked up automatically; nothing has to be kept in
 * sync, because there is no second copy to drift.
 *
 * What it cannot mirror is stated rather than skipped silently. Jobs that need
 * Docker, a browser, or a Linux filesystem are reported as NOT MIRRORED with
 * the reason, so the output never implies more coverage than it has.
 *
 * POSIX steps -- anything whose npm script wraps `sh`, `.sh`, or `python3` --
 * need a real Linux host. This machine no longer keeps one in WSL, so it runs
 * them over SSH against a host you point it at:
 *
 *   LOSPOR_CI_MIRROR_SSH=user@host             required to mirror POSIX steps
 *   LOSPOR_CI_MIRROR_KEY=/path/to/identity     optional, passed to ssh -i
 *   LOSPOR_CI_MIRROR_PATH=~/lospor-ci-mirror   optional, remote sync directory
 *
 * With none of that set, POSIX steps are reported NOT MIRRORED, the same
 * honest degradation this script has always used for anything it cannot
 * actually run -- never silently dropped, never claimed as coverage it doesn't
 * have.
 *
 * Usage:
 *   node scripts/mirror-ci.mjs              every mirrorable step, continue on failure
 *   node scripts/mirror-ci.mjs --fail-fast  stop at the first failure
 *   node scripts/mirror-ci.mjs --list       print the plan without running it
 */
import { spawnSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"

const label = s => s.prefix ? s.prefix + ":" + s.script : s.script
const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const args = new Set(process.argv.slice(2))
const failFast = args.has("--fail-fast")
const listOnly = args.has("--list")

/**
 * Steps this machine cannot honestly run, and why.
 *
 * Named individually rather than pattern-matched: a new Docker-dependent step
 * should show up as unrecognised and force a decision, not disappear into a
 * regex.
 */
const NOT_MIRRORED = {
  "e2e:web-full": "Playwright + a live stack",
  "e2e:pwa-full": "Playwright + a live stack",
  "e2e:browser-full": "Playwright + a live stack",
  "test:migrator-image": "builds a Docker image",
  "build": "Next.js production builds; slow, and CI is the authority on them",
  "audit": "queries the npm registry",
}

/**
 * Steps that need something this machine may or may not have. Skipped with the
 * reason when it is absent, run normally when it is present -- rather than
 * excluded outright, which would hide them forever, or left to fail, which
 * would make the summary permanently red and therefore unread.
 */
const CONDITIONAL = {
  "test:central-full-story": {
    available: () => Boolean(process.env.DATABASE_URL || process.env.DIRECT_URL),
    reason: "needs a disposable migrated PostgreSQL; set DATABASE_URL to include it",
  },
}

/**
 * Windows has no POSIX shell and no python3 here. So each step runs where it
 * actually works. Derived from what the npm script invokes.
 */
function runner(step) {
  if (step.prefix) return "windows"
  const definition = packageScripts[step.script] ?? ""
  const needsPosix = /(^|[^a-z])sh |\.sh\b|python3|\.py\b/.test(definition)
  return needsPosix ? "posix" : "windows"
}

const packageScripts = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).scripts ?? {}

/**
 * Every npm invocation inside a `run:` block of quality.yml, in file order.
 *
 * Both forms are matched deliberately. The per-app one --
 * `npm --prefix apps/web run lint -- --max-warnings 0` -- is how the strict
 * lint step is written, and missing it is not hypothetical: a push went out
 * having run only typecheck and the tests, and CI failed on exactly that step.
 * A mirror that skips it would reproduce the original mistake faithfully.
 */
function stepsFromWorkflow() {
  const workflow = readFileSync(join(root, ".github/workflows/quality.yml"), "utf8").replace(/\r\n/g, "\n")
  const steps = []
  const seen = new Set()
  let job = null
  const add = (step, key) => { if (!seen.has(key)) { seen.add(key); steps.push({ job, ...step }) } }

  for (const line of workflow.split("\n")) {
    const jobMatch = /^ {2}([a-z][a-z0-9-]*):\s*$/.exec(line)
    if (jobMatch) job = jobMatch[1]

    for (const m of line.matchAll(/npm --prefix (\S+) run ([a-z][a-z0-9:_-]*)((?: -- [^\n]*)?)/g)) {
      add({ prefix: m[1], script: m[2], extra: m[3].trim() }, `${m[1]}:${m[2]}`)
    }
    for (const m of line.matchAll(/(?<!--prefix \S{0,80})\bnpm run ([a-z][a-z0-9:_-]*)/g)) {
      add({ script: m[1] }, m[1])
    }
  }
  return steps
}

const steps = stepsFromWorkflow()
const unknown = steps.filter(s => !s.prefix && !packageScripts[s.script] && !(s.script in NOT_MIRRORED))
if (unknown.length) {
  console.error(`quality.yml runs scripts this package does not define: ${unknown.map(s => s.script).join(", ")}`)
  process.exit(2)
}

/**
 * The POSIX host, if one is configured. Checked once, up front, the same way
 * `wslAvailable` used to be checked once -- so every POSIX step gets a single,
 * consistent reason when it cannot run, rather than each one failing on its
 * own SSH error.
 */
const posixHost = process.env.LOSPOR_CI_MIRROR_SSH ?? ""
const posixKey = process.env.LOSPOR_CI_MIRROR_KEY ?? ""
const posixPath = process.env.LOSPOR_CI_MIRROR_PATH ?? "~/lospor-ci-mirror"
const sshArgs = (...rest) => [...(posixKey ? ["-i", posixKey] : []), "-o", "ConnectTimeout=8", "-o", "BatchMode=yes", ...rest]

function sshRun(command) {
  return spawnSync("ssh", [...sshArgs(posixHost), command], { stdio: "inherit" })
}
function sshCapture(command) {
  return spawnSync("ssh", [...sshArgs(posixHost), command], { encoding: "utf8" })
}

let posixUnavailable = posixHost
  ? null
  : "set LOSPOR_CI_MIRROR_SSH=user@host to mirror POSIX steps on a real Linux host"

if (!posixUnavailable) {
  const reach = sshCapture("echo ok")
  if (reach.status !== 0 || !reach.stdout?.includes("ok")) {
    posixUnavailable = `cannot reach ${posixHost} over SSH`
  } else {
    const need = sshCapture("for c in bash python3 node npm; do command -v $c >/dev/null 2>&1 || echo MISSING:$c; done")
    const missing = (need.stdout ?? "").split("\n").filter(l => l.startsWith("MISSING:")).map(l => l.slice(8))
    if (missing.length) posixUnavailable = `${posixHost} is missing ${missing.join(", ")}`
  }
}

/**
 * Sync the working tree to the POSIX host exactly once per invocation, before
 * the first POSIX step runs -- not once per step, and not incrementally.
 * `git ls-files --others --cached --exclude-standard` is the file list a
 * commit would use: every tracked file at its current on-disk content, plus
 * untracked-but-not-ignored files, and none of node_modules/.data/secrets/etc,
 * because .gitignore already says so. That is what a mirror of the working
 * tree -- including uncommitted changes -- should contain, and it costs
 * nothing extra to compute: git already knows it.
 *
 * `.git` itself is added alongside that list, not folded into it -- git never
 * lists its own directory. It has to be there anyway: script-executable-bits.sh
 * shells out to `git ls-files -s` to check a file's *committed* mode, which
 * only exists in the index, not on disk, so a working-tree-only mirror made
 * that check fail with "not a git repository" instead of running it. `.git`
 * here is ~24 MB against a repository whose tracked tree is a few times that
 * -- cheap enough that excluding it to save the transfer isn't a real saving,
 * only a real gap.
 */
let synced = false
function ensureSynced() {
  if (synced) return true
  const list = spawnSync("git", ["ls-files", "-z", "--others", "--cached", "--exclude-standard"], { cwd: root, encoding: "buffer" })
  if (list.status !== 0) { console.error("git ls-files failed; cannot sync to POSIX host"); return false }
  const mkdir = sshRun(`mkdir -p ${posixPath}`)
  if (mkdir.status !== 0) return false
  const tar = spawnSync("tar", ["--null", "-czf", "-", "-T", "-", ".git"], { cwd: root, input: list.stdout, maxBuffer: 1024 * 1024 * 1024 })
  if (tar.status !== 0 || !tar.stdout) { console.error("tar failed while packing the working tree"); return false }
  const extract = spawnSync("ssh", [...sshArgs(posixHost), `tar -xzf - -C ${posixPath}`], { input: tar.stdout, stdio: ["pipe", "inherit", "inherit"] })
  if (extract.status !== 0) return false
  synced = true
  return true
}

const plan = steps.map(step => {
  // Only top-level scripts are excluded by name. A prefixed step that happens
  // to share a name -- `npm --prefix vendor/exchange-contract run build` -- is
  // a different, and cheap, command.
  if (!step.prefix && step.script in NOT_MIRRORED) return { ...step, skip: NOT_MIRRORED[step.script] }
  const conditional = step.prefix ? null : CONDITIONAL[step.script]
  if (conditional && !conditional.available()) return { ...step, skip: conditional.reason }
  const where = runner(step)
  if (where === "posix" && posixUnavailable) return { ...step, skip: posixUnavailable }
  return { ...step, where }
})

if (listOnly) {
  for (const step of plan) {
    console.log(`${(step.job ?? "?").padEnd(14)} ${label(step).padEnd(34)} ${step.skip ? `NOT MIRRORED (${step.skip})` : step.where}`)
  }
  process.exit(0)
}

function run(step) {
  if (step.where === "windows") {
    const argv = step.prefix
      ? ["--prefix", step.prefix, "run", step.script, ...(step.extra ? step.extra.split(" ") : [])]
      : ["run", step.script]
    return spawnSync("npm", argv, { cwd: root, stdio: "inherit", shell: true }).status ?? 1
  }
  if (!ensureSynced()) return 1
  const result = sshRun(`cd ${posixPath} && npm run ${step.script}`)
  return result.status ?? 1
}

const results = []
for (const step of plan) {
  if (step.skip) { results.push({ ...step, outcome: "skipped" }); continue }
  console.log(`\n── ${step.job} / ${step.script}  (${step.where})\n`)
  const started = Date.now()
  const status = run(step)
  const seconds = Math.round((Date.now() - started) / 1000)
  results.push({ ...step, outcome: status === 0 ? "passed" : "failed", seconds })
  if (status !== 0 && failFast) break
}

console.log("\n" + "=".repeat(72))
for (const r of results) {
  const mark = r.outcome === "passed" ? "PASS" : r.outcome === "failed" ? "FAIL" : "----"
  const detail = r.outcome === "skipped" ? `not mirrored: ${r.skip}` : `${r.seconds}s`
  console.log(`${mark}  ${label(r).padEnd(34)} ${detail}`)
}
const failed = results.filter(r => r.outcome === "failed")
const skipped = results.filter(r => r.outcome === "skipped")
console.log("=".repeat(72))
console.log(`${results.filter(r => r.outcome === "passed").length} passed, ${failed.length} failed, ${skipped.length} not mirrored`)
if (skipped.length) console.log("Steps above marked not mirrored are still only proven by CI.")
process.exit(failed.length ? 1 : 0)
