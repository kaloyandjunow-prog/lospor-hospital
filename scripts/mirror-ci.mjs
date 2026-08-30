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
 * Windows has no POSIX shell and no python3 here, and WSL cannot run the
 * Windows-installed node_modules (its native binaries are win32). So each step
 * runs where it actually works. Derived from what the npm script invokes.
 */
function runner(step) {
  if (step.prefix) return "windows"
  const definition = packageScripts[step.script] ?? ""
  const needsPosix = /(^|[^a-z])sh |\.sh\b|python3|\.py\b/.test(definition)
  return needsPosix ? "wsl" : "windows"
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

const wslAvailable = spawnSync("wsl.exe", ["-d", "Ubuntu-24.04", "--", "true"], { stdio: "ignore" }).status === 0

const plan = steps.map(step => {
  // Only top-level scripts are excluded by name. A prefixed step that happens
  // to share a name -- `npm --prefix vendor/exchange-contract run build` -- is
  // a different, and cheap, command.
  if (!step.prefix && step.script in NOT_MIRRORED) return { ...step, skip: NOT_MIRRORED[step.script] }
  const where = runner(step)
  if (where === "wsl" && !wslAvailable) return { ...step, skip: "needs a POSIX shell; WSL Ubuntu-24.04 not reachable" }
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
  // The repository path as WSL sees it. Only this machine's layout is assumed,
  // and only for the shell suites, which are the ones that need it.
  const linuxRoot = root.replace(/^([A-Za-z]):\\/, (_, drive) => `/mnt/${drive.toLowerCase()}/`).replace(/\\/g, "/")
  return spawnSync(
    "wsl.exe",
    ["-d", "Ubuntu-24.04", "--", "bash", "-lc", `cd ${JSON.stringify(linuxRoot)} && npm run ${step.script}`],
    { stdio: "inherit" },
  ).status ?? 1
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
