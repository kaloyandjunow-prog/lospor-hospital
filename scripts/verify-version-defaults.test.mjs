// verify-version-defaults.mjs against fixture trees (coverage review 1.4.13):
// the gate must refuse each kind of drift it exists for, and pass a tree that
// has none. Run against a copy, since the gate reads the tree it sits in.
import { test } from "node:test"
import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const here = dirname(fileURLToPath(import.meta.url))
const gate = join(here, "verify-version-defaults.mjs")

const cleanCompose = [
  "services:",
  "  backup:",
  "    environment:",
  "      HOSPITAL_RELEASE: ${HOSPITAL_RELEASE:-source}",
  "      HOSPITAL_EXCHANGE_CONTRACT_VERSION: ${HOSPITAL_EXCHANGE_CONTRACT_VERSION:-2.1.0}",
  "      HOSPITAL_DATA_DICTIONARY_VERSION: ${HOSPITAL_DATA_DICTIONARY_VERSION:-}",
  "",
].join("\n")

function tree({ compose = cleanCompose, shell = {}, versions = {} } = {}) {
  const root = mkdtempSync(join(tmpdir(), "version-defaults-"))
  mkdirSync(join(root, "scripts"))
  mkdirSync(join(root, "infra"))
  cpSync(gate, join(root, "scripts", "verify-version-defaults.mjs"))
  writeFileSync(join(root, "compose.yaml"), compose)
  writeFileSync(join(root, "UPSTREAM_VERSIONS.json"), JSON.stringify({
    sources: {
      exchangeContract: { version: "2.1.0" },
      api: { version: "9.13.0" },
      web: { version: "9.13.0" },
      pwa: { version: "9.13.0" },
      ...versions,
    },
  }))
  for (const [path, content] of Object.entries(shell)) {
    mkdirSync(dirname(join(root, path)), { recursive: true })
    writeFileSync(join(root, path), content)
  }
  return root
}

function run(root) {
  const result = spawnSync(process.execPath, [join(root, "scripts", "verify-version-defaults.mjs")], { encoding: "utf8" })
  rmSync(root, { recursive: true, force: true })
  return { ok: result.status === 0, output: `${result.stdout}${result.stderr}` }
}

test("a tree with no drift passes, including empty and nested defaults", () => {
  const result = run(tree({
    shell: { "infra/backup.sh": 'echo "${HOSPITAL_BACKUP_TOOL_VERSION:-${HOSPITAL_RELEASE:-source}}"\n' },
  }))
  assert.equal(result.ok, true, result.output)
})

test("a release version pinned as a literal default is refused, in compose and in scripts", () => {
  const compose = run(tree({ compose: cleanCompose.replace("HOSPITAL_RELEASE:-source", "HOSPITAL_RELEASE:-1.4.12") }))
  assert.equal(compose.ok, false)
  assert.match(compose.output, /compose\.yaml:4: HOSPITAL_RELEASE defaults to the literal "1\.4\.12"/)

  const script = run(tree({ shell: { "scripts/backup-now.sh": 'v="${HOSPITAL_BACKUP_TOOL_VERSION:-1.4.12}"\n' } }))
  assert.equal(script.ok, false)
  assert.match(script.output, /scripts\/backup-now\.sh:1: HOSPITAL_BACKUP_TOOL_VERSION/)

  // A suffix does not make a pinned release any less stale.
  const suffixed = run(tree({ shell: { "infra/stamp.sh": 'v="${HOSPITAL_RELEASE:-1.4.12${SUFFIX}}"\n' } }))
  assert.equal(suffixed.ok, false, suffixed.output)
})

test("a contract version that differs from the pinned contract is refused", () => {
  const result = run(tree({ compose: cleanCompose.replace("CONTRACT_VERSION:-2.1.0", "CONTRACT_VERSION:-2.0.0") }))
  assert.equal(result.ok, false)
  assert.match(result.output, /HOSPITAL_EXCHANGE_CONTRACT_VERSION defaults to "2\.0\.0" but UPSTREAM_VERSIONS\.json pins the exchange contract at "2\.1\.0"/)
})

test("test scripts and node_modules are not read", () => {
  const result = run(tree({
    shell: {
      "scripts/backup.test.sh": 'HOSPITAL_RELEASE="${HOSPITAL_RELEASE:-1.0.0}"\n',
      "infra/node_modules/pkg/x.sh": 'HOSPITAL_RELEASE="${HOSPITAL_RELEASE:-1.0.0}"\n',
    },
  }))
  assert.equal(result.ok, true, result.output)
})

test("the api, web and phone app must be vendored at one upstream version", () => {
  const split = run(tree({ versions: { pwa: { version: "9.12.2" } } }))
  assert.equal(split.ok, false)
  assert.match(split.output, /same upstream version.*pwa 9\.12\.2/s)

  const missing = run(tree({ versions: { web: {} } }))
  assert.equal(missing.ok, false)
  assert.match(missing.output, /missing a version for: web/)
})

test("the repository itself passes", () => {
  const result = spawnSync(process.execPath, [gate], { encoding: "utf8" })
  assert.equal(result.status, 0, `${result.stdout}${result.stderr}`)
})
