import assert from "node:assert/strict"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"
import {
  LOCALIZATION_IMPORT_REQUIREMENTS,
  PRE_LOCALIZATION_PINS,
  verifyClientLocalizationImport,
} from "./client-localization-import-gate.mjs"

const repositoryRoot = fileURLToPath(new URL("..", import.meta.url))
const temporaryRoots = []

test.after(() => {
  for (const root of temporaryRoots) rmSync(root, { recursive: true, force: true })
})

function write(path, value) {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, value)
}

function fixture({ advanced = false, complete = false } = {}) {
  const root = mkdtempSync(join(tmpdir(), "lospor-client-locale-gate-"))
  temporaryRoots.push(root)
  const sources = Object.fromEntries(
    Object.entries(PRE_LOCALIZATION_PINS).map(([name, commit]) => [
      name,
      { commit: advanced ? `${commit.slice(0, -1)}0` : commit },
    ]),
  )
  write(join(root, "UPSTREAM_VERSIONS.json"), `${JSON.stringify({ sources })}\n`)
  if (complete) {
    for (const requirement of LOCALIZATION_IMPORT_REQUIREMENTS) {
      write(join(root, requirement.path), `${requirement.required.join("\n")}\n`)
    }
  }
  return root
}

test("the real Hospital tree remains green and explicitly pending at its documented pins", () => {
  const report = verifyClientLocalizationImport(repositoryRoot)
  assert.equal(report.ok, true, JSON.stringify(report.failures, null, 2))
  assert.equal(report.status, "pending")
  assert.deepEqual(report.advanced, [])
})

test("the exact pre-localization pin set does not make the current release tree always red", () => {
  const report = verifyClientLocalizationImport(fixture())
  assert.equal(report.ok, true)
  assert.equal(report.status, "pending")
})

test("a tagged release fails while the coordinated localization import is pending", () => {
  const report = verifyClientLocalizationImport(fixture(), { requireReady: true })
  assert.equal(report.ok, false)
  assert.equal(report.status, "blocked")
  assert.deepEqual(report.failures.map(item => item.id), ["localization.release-ready"])
})

test("advancing one owner pin rejects a partial provenance import", () => {
  const root = fixture()
  const sources = Object.fromEntries(
    Object.entries(PRE_LOCALIZATION_PINS).map(([name, commit]) => [name, { commit }]),
  )
  sources.web.commit = `${sources.web.commit.slice(0, -1)}0`
  write(join(root, "UPSTREAM_VERSIONS.json"), `${JSON.stringify({ sources })}\n`)

  const report = verifyClientLocalizationImport(root)
  assert.equal(report.ok, false)
  assert.equal(report.status, "blocked")
  assert(report.failures.some(item => item.id === "localization.atomic-owner-import"))
  assert(report.failures.some(item => item.id === "web.bulgarian-default"))
})

test("a complete atomic owner import with all client E2E evidence is accepted", () => {
  const report = verifyClientLocalizationImport(
    fixture({ advanced: true, complete: true }),
    { requireReady: true },
  )
  assert.equal(report.ok, true, JSON.stringify(report.failures, null, 2))
  assert.equal(report.status, "ready")
  assert.deepEqual(new Set(report.advanced), new Set(["api", "web", "pwa", "browser"]))
})

test("an advanced import fails closed when source capability or E2E evidence drifts", async t => {
  for (const requirement of [
    LOCALIZATION_IMPORT_REQUIREMENTS.find(item => item.id === "pwa.localized-login"),
    LOCALIZATION_IMPORT_REQUIREMENTS.find(item => item.id === "browser.account-locale-e2e"),
  ]) {
    await t.test(requirement.id, () => {
      const root = fixture({ advanced: true, complete: true })
      write(join(root, requirement.path), "incomplete\n")
      const report = verifyClientLocalizationImport(root)
      assert.equal(report.ok, false)
      assert(report.failures.some(item => item.id === requirement.id))
    })
  }
})
