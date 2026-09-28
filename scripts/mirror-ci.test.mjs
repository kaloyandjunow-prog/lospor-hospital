// mirror-ci.mjs against fixture workflows (coverage review 1.4.13). Its whole
// value is honesty: every CI step shows up, run or named as not mirrored with
// its reason, and a failure is never reported as a pass.
import { test } from "node:test"
import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { chmodSync, cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const here = dirname(fileURLToPath(import.meta.url))

const workflow = `name: Quality
jobs:
  quality:
    steps:
      - run: npm run lint
      - run: |
          npm run test:unit
          npm --prefix apps/web run lint -- --max-warnings 0
      - run: npm run lint
  appliance:
    steps:
      - run: npm run test:shell
      - run: npm run test:boundaries
      - run: npm run audit
      - run: npm run test:central-full-story
`

const scripts = {
  lint: 'node -e "process.exit(0)"',
  "test:unit": 'node -e "process.exit(0)"',
  "test:shell": "sh scripts/x.test.sh",
  "test:boundaries": "python3 -m unittest discover -s scripts",
  "test:central-full-story": 'node -e "process.exit(0)"',
}

function tree({ yml = workflow, pkg = scripts, web = { lint: `node -e "process.exit(process.argv.includes('--max-warnings') ? 0 : 5)" --` } } = {}) {
  const root = mkdtempSync(join(tmpdir(), "mirror-ci-"))
  mkdirSync(join(root, "scripts"))
  mkdirSync(join(root, ".github", "workflows"), { recursive: true })
  mkdirSync(join(root, "apps", "web"), { recursive: true })
  cpSync(join(here, "mirror-ci.mjs"), join(root, "scripts", "mirror-ci.mjs"))
  writeFileSync(join(root, ".github", "workflows", "quality.yml"), yml)
  writeFileSync(join(root, "package.json"), JSON.stringify({ name: "fixture", scripts: pkg }))
  writeFileSync(join(root, "apps", "web", "package.json"), JSON.stringify({ name: "web", scripts: web }))
  return root
}

function mirror(root, args = [], env = {}) {
  const clean = { ...process.env }
  delete clean.LOSPOR_CI_MIRROR_SSH
  delete clean.DATABASE_URL
  delete clean.DIRECT_URL
  const result = spawnSync(process.execPath, [join(root, "scripts", "mirror-ci.mjs"), ...args], {
    cwd: root, encoding: "utf8", env: { ...clean, ...env }, timeout: 120_000,
  })
  return { code: result.status, out: `${result.stdout}${result.stderr}` }
}

const planLine = (out, step) => out.split("\n").find(line => new RegExp(`\\s${step.replace(/[:/]/g, "\\$&")}\\s`).test(line)) ?? ""

test("the plan lists every step once, per-app steps included, in workflow order", () => {
  const root = tree()
  const { code, out } = mirror(root, ["--list"])
  rmSync(root, { recursive: true, force: true })
  assert.equal(code, 0, out)
  const listed = out.trim().split("\n").map(line => line.trim().split(/\s+/)[1])
  assert.deepEqual(listed, ["lint", "test:unit", "apps/web:lint", "test:shell", "test:boundaries", "audit", "test:central-full-story"])
  assert.match(planLine(out, "test:unit"), /^quality\s/)
  assert.match(planLine(out, "test:shell"), /^appliance\s/)
})

test("what cannot run here is named, with the reason, never dropped", () => {
  const root = tree()
  const { out } = mirror(root, ["--list"])
  const withDatabase = mirror(root, ["--list"], { DATABASE_URL: "postgresql://fixture" })
  rmSync(root, { recursive: true, force: true })
  assert.match(planLine(out, "audit"), /NOT MIRRORED \(queries the npm registry\)/)
  assert.match(planLine(out, "test:shell"), /NOT MIRRORED \(set LOSPOR_CI_MIRROR_SSH/)
  assert.match(planLine(out, "test:boundaries"), /NOT MIRRORED \(set LOSPOR_CI_MIRROR_SSH/)
  assert.match(planLine(out, "test:central-full-story"), /NOT MIRRORED \(needs a disposable migrated PostgreSQL/)
  assert.match(planLine(withDatabase.out, "test:central-full-story"), /windows$/)
  assert.match(planLine(out, "lint"), /windows$/)
})

test("a workflow step the package does not define stops the mirror", () => {
  const root = tree({ yml: `${workflow}      - run: npm run test:brand-new\n` })
  const { code, out } = mirror(root, ["--list"])
  rmSync(root, { recursive: true, force: true })
  assert.equal(code, 2)
  assert.match(out, /does not define: test:brand-new/)
})

test("a failing step fails the run and is reported FAIL; --fail-fast stops there", () => {
  const root = tree({ pkg: { ...scripts, "test:unit": 'node -e "process.exit(3)"' } })
  const all = mirror(root)
  const fast = mirror(root, ["--fail-fast"])
  rmSync(root, { recursive: true, force: true })
  assert.equal(all.code, 1, all.out)
  assert.match(all.out, /FAIL\s+test:unit/)
  assert.match(all.out, /PASS\s+apps\/web:lint/)
  assert.match(all.out, /2 passed, 1 failed, 4 not mirrored/)
  assert.equal(fast.code, 1)
  assert.doesNotMatch(fast.out, /PASS\s+apps\/web:lint/)
})

test("a clean run passes and still says what only CI proves", () => {
  const root = tree()
  const { code, out } = mirror(root)
  rmSync(root, { recursive: true, force: true })
  assert.equal(code, 0, out)
  assert.match(out, /3 passed, 0 failed, 4 not mirrored/)
  assert.match(out, /still only proven by CI/)
})

// A stand-in ssh: answers the reachability and tool checks, records the rest.
// Only where a shell script can stand in for a program -- not on Windows.
const posix = process.platform !== "win32"

function withFakeSsh(root) {
  const bin = join(root, "fake-bin")
  mkdirSync(bin)
  const log = join(root, "ssh.log")
  writeFileSync(join(bin, "ssh"), `#!/bin/sh
last=""; for a in "$@"; do last="$a"; done
printf '%s\\n' "$last" >> "${log}"
[ -n "\${FAKE_SSH_DOWN:-}" ] && exit 255
case "$last" in "echo ok") echo ok ;; *"command -v"*) : ;; "tar -xzf"*) cat > /dev/null ;; esac
exit 0
`)
  chmodSync(join(bin, "ssh"), 0o755)
  spawnSync("git", ["init", "-q"], { cwd: root })
  return { env: { PATH: `${bin}:${process.env.PATH}`, LOSPOR_CI_MIRROR_SSH: "ci@mirror.invalid" }, log }
}

test("POSIX steps run on the configured host, in a fresh copy", { skip: !posix && "needs a POSIX shell for the ssh stand-in" }, () => {
  const root = tree()
  const { env, log } = withFakeSsh(root)
  const { code, out } = mirror(root, [], env)
  const calls = readFileSync(log, "utf8")
  rmSync(root, { recursive: true, force: true })
  assert.equal(code, 0, out)
  assert.match(calls, /rm -rf ~\/lospor-ci-mirror && mkdir -p ~\/lospor-ci-mirror/)
  assert.match(calls, /cd ~\/lospor-ci-mirror && npm run test:shell/)
})

test("a mirror path outside the home directory is never recreated", { skip: !posix && "needs a POSIX shell for the ssh stand-in" }, () => {
  const root = tree()
  const { env, log } = withFakeSsh(root)
  const { code, out } = mirror(root, [], { ...env, LOSPOR_CI_MIRROR_PATH: "~/../../etc" })
  const calls = readFileSync(log, "utf8")
  rmSync(root, { recursive: true, force: true })
  assert.equal(code, 1)
  assert.match(out, /refusing to recreate mirror path outside ~\//)
  assert.doesNotMatch(calls, /rm -rf/)
})

test("an unreachable host is named, and nothing is attempted on it", { skip: !posix && "needs a POSIX shell for the ssh stand-in" }, () => {
  const root = tree()
  const { env, log } = withFakeSsh(root)
  const { code, out } = mirror(root, [], { ...env, FAKE_SSH_DOWN: "1" })
  const calls = readFileSync(log, "utf8")
  rmSync(root, { recursive: true, force: true })
  assert.equal(code, 0, out)
  assert.match(out, /test:shell\s+not mirrored: cannot reach ci@mirror\.invalid over SSH/)
  assert.doesNotMatch(calls, /rm -rf|npm run/)
})
