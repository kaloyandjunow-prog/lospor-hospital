import assert from "node:assert/strict"
import { existsSync, readdirSync, readFileSync } from "node:fs"
import { join, resolve } from "node:path"
import test from "node:test"

// The documentation is the installer for everyone who follows it. 1.3.3 shipped
// fixes for commands that could not work as printed (a missing sudo), and a
// later audit on a real appliance found more: operator commands shown as
// `./scripts/doctor.sh` that fail on root-owned state, or on a script without
// its executable bit. These checks hold every shell block to the one form that
// works on an installed appliance, in both languages.

const root = resolve(import.meta.dirname, "..")
const docs = join(root, "docs")

// Commands for a source checkout, the maintainer's machine, or Central -- never
// run by hospital IT against an installed appliance.
const DEVELOPER_OR_MAINTAINER = new Set([
  "install.sh", "test-install.sh", "test-status-dev.sh", "dev-status.sh", "sign-release-lock.sh",
])
const CENTRAL = new Set(["sign-site-csr.sh", "create-enrollment-token.sh"])

const OPERATOR_FORM = /^sudo (env [A-Z_]+=\S+ )*sh (\/opt\/lospor-hospital\/(current|bootstrap-[^/\s]+\/lospor-hospital-[^/\s]+)\/scripts\/|"\$BOOTSTRAP_ROOT\/scripts\/)/

function commandLines(markdown) {
  return [...markdown.matchAll(/^[ \t]*```sh\n([\s\S]*?)^[ \t]*```/gm)]
    .flatMap(match => match[1].replace(/\\\n\s*/g, " ").split("\n"))
    .map(line => line.trim())
    .filter(line => line && !line.startsWith("#"))
}

function scriptsIn(line) {
  return [...line.matchAll(/(?:^|[\s"'/])scripts\/([A-Za-z0-9._-]+\.(?:sh|py|mjs))/g)].map(match => match[1])
}

// What must agree across languages: which scripts run, with which options.
// Placeholders and quoted example values are translated and are ignored.
function skeleton(line) {
  const script = scriptsIn(line)[0] ?? line.match(/losporctl-install\.sh/)?.[0] ?? null
  if (!script) return null
  const options = line.match(/(?<=\s)--[a-z][a-z-]*/g) ?? []
  return `${line.startsWith("sudo ") ? "sudo " : ""}${script} ${options.join(" ")}`.trim()
}

const pairs = readdirSync(docs)
  .filter(name => name.endsWith(".md") && !name.endsWith(".bg.md"))
  .map(name => ({ name, bg: name.replace(/\.md$/, ".bg.md") }))
  .filter(pair => existsSync(join(docs, pair.bg)))

test("every documented appliance command runs as root from the installed release", () => {
  const violations = []
  for (const file of readdirSync(docs).filter(name => name.endsWith(".md"))) {
    for (const line of commandLines(readFileSync(join(docs, file), "utf8"))) {
      for (const script of scriptsIn(line)) {
        if (!script.endsWith(".sh") || DEVELOPER_OR_MAINTAINER.has(script) || CENTRAL.has(script)) continue
        if (!OPERATOR_FORM.test(line)) violations.push(`${file}: ${line}`)
      }
      if (/losporctl-install\.sh/.test(line) && !/^curl /.test(line) && !/^sudo sh /.test(line)) {
        violations.push(`${file}: ${line}`)
      }
    }
  }
  assert.deepEqual(violations, [], "use `sudo sh /opt/lospor-hospital/current/scripts/<name>.sh`")
})

test("every script a document names exists", () => {
  const missing = []
  for (const file of readdirSync(docs).filter(name => name.endsWith(".md"))) {
    for (const line of commandLines(readFileSync(join(docs, file), "utf8"))) {
      for (const script of scriptsIn(line)) {
        if (CENTRAL.has(script)) continue
        if (!existsSync(join(root, "scripts", script))) missing.push(`${file}: scripts/${script}`)
      }
    }
  }
  assert.deepEqual(missing, [])
})

test("Bulgarian and English documents give the same commands", () => {
  for (const { name, bg } of pairs) {
    const english = commandLines(readFileSync(join(docs, name), "utf8")).map(skeleton).filter(Boolean)
    const bulgarian = commandLines(readFileSync(join(docs, bg), "utf8")).map(skeleton).filter(Boolean)
    assert.deepEqual(bulgarian, english, `${bg} and ${name} disagree`)
  }
})

test("the rules catch the mistakes they exist for", () => {
  for (const wrong of [
    "./scripts/doctor.sh",
    "sh scripts/rotate-operational-secrets.sh state",
    "sh /opt/lospor-hospital/current/scripts/check-for-update.sh",
    "sudo ./scripts/backup-now.sh",
  ]) {
    assert.equal(OPERATOR_FORM.test(wrong), false, wrong)
  }
  assert.equal(OPERATOR_FORM.test("sudo sh /opt/lospor-hospital/current/scripts/doctor.sh --go-live"), true)
  assert.equal(OPERATOR_FORM.test("sudo env LOSPOR_DEFAULT_LOCALE=en sh /opt/lospor-hospital/current/scripts/backup-now.sh"), true)
})
