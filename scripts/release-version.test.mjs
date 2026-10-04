import assert from "node:assert/strict"
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import test from "node:test"
import {
  DRAFT_MARKER,
  ReleaseVersionError,
  apply,
  changelogHighlights,
  changelogSections,
  check,
  pinSentence,
  replacePinSentence,
} from "./release-version.mjs"

const pins = version => ({
  api: { version }, web: { version }, pwa: { version }, core: { version }, browser: { version: "0.8.2" },
})

function fixture(t, { sources = pins("9.14.0"), previous = "1.4.22" } = {}) {
  const root = mkdtempSync(join(tmpdir(), "hospital-release-version-"))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const write = (path, text) => { mkdirSync(dirname(join(root, path)), { recursive: true }); writeFileSync(join(root, path), text) }
  write("package.json", `{\n  "name": "lospor-hospital",\n  "version": "${previous}",\n  "private": true\n}\n`)
  write("UPSTREAM_VERSIONS.json", JSON.stringify({ sources }, null, 2))
  write("apps/api/src/lib/hospital/appliance-versions.ts", `export const APPLIANCE_MANIFEST_VERSIONS = {\n  hospital: "${previous}",\n  api: "9.13.8",\n  core: "9.13.8",\n  databaseSchema: "hospital-2",\n} as const\n`)
  write("release-compatibility.tsv", `LOSPOR-HOSPITAL-RELEASE-COMPATIBILITY-V1\t${previous}\t20260530000000_init\t20261002100000_old\tbackup-required\t-\t0\n`)
  write("release-rollback-justification.json", JSON.stringify({ schemaVersion: 1, release: previous, policy: "backup-required", justification: "old", assessedBy: "maintainer", assessedAt: "2026-10-03" }, null, 2))
  write("apps/api/prisma/migrations/20261002100000_old/migration.sql", "")
  write("apps/api/prisma/migrations/20261010120000_new/migration.sql", "")
  write("apps/api/prisma/migrations/migration_lock.toml", "")
  write("CHANGELOG.md", `# Changelog - LOSPOR Hospital\r\n\r\n## [${previous}] - 2026-10-03\r\n\r\nOld notes.\r\n`)
  write("docs/release-validation.md", "# Validation\n\nA release is acceptable only after the drill.\n\nFor the 1.4.22 clinical candidate, the coordinated client pins are Core, API,\nWeb and PWA 9.13.8; Browser is 0.8.2. Promote and review them in this\norder: Core, Web, PWA, Browser, API.\n\nNext paragraph.\n")
  write("docs/release-validation.bg.md", "# Валидиране\n\nЗа клиничния кандидат 1.4.22 координираният набор е Core, API, Web и PWA\n9.13.8; Browser е 0.8.2. Прегледайте ги в този ред.\n")
  write("vendor/lospor-core/CHANGELOG.md", "# Core\n\n## [9.14.0] - 2026-10-04\n\n### Added\n\n- **Case readiness** (`x`). Long\n  explanation.\n- **Allergy against drug check.** More.\n\n## [9.13.9] - 2026-10-04\n\n- **An imported age switches the clinical mode.** Text.\n\n## [9.13.8] - 2026-10-03\n\n- **Already vendored.** Text.\n")
  write("apps/web/CHANGELOG.md", "# Web\n\n## [9.14.0] - 2026-10-04\n\n- **Readiness cockpit.** Text.\n\n## [1.4.21] - 2026-10-02\n\n- **Hospital overlay note.** Text.\n\n## [9.13.8] - 2026-10-03\n\n- **Old.** Text.\n")
  return { root, read: path => readFileSync(join(root, path), "utf8") }
}

const options = { justification: "No migration and the images keep the C library, so services may roll back.", date: "2026-10-10", previousPins: pins("9.13.8") }

test("apply writes every piece of release metadata, and check then agrees once the draft is edited", t => {
  const { root, read } = fixture(t)
  apply(root, "1.5.0", options)

  assert.match(read("package.json"), /"version": "1.5.0",\n  "private": true/)
  const manifest = read("apps/api/src/lib/hospital/appliance-versions.ts")
  assert.match(manifest, /hospital: "1.5.0",\n  api: "9.14.0",\n  core: "9.14.0",\n  databaseSchema: "hospital-2"/)
  assert.equal(read("release-compatibility.tsv"), "LOSPOR-HOSPITAL-RELEASE-COMPATIBILITY-V1\t1.5.0\t20260530000000_init\t20261010120000_new\tbackup-required\t-\t0\n")
  const rollback = JSON.parse(read("release-rollback-justification.json"))
  assert.deepEqual([rollback.release, rollback.policy, rollback.assessedAt, rollback.assessedBy], ["1.5.0", "backup-required", "2026-10-10", "maintainer"])
  assert.equal(rollback.justification, options.justification)
  assert.match(read("docs/release-validation.md"), /For the 1.5.0 clinical candidate, the coordinated client pins are Core, API, Web\nand PWA 9.14.0; Browser is 0.8.2. Promote and review them in this order: Core,\nWeb, PWA, Browser, API.\n\nNext paragraph.\n$/)
  assert.match(read("docs/release-validation.bg.md"), /За клиничния кандидат 1.5.0 координираният набор е Core, API, Web и PWA 9.14.0;/)

  const changelog = read("CHANGELOG.md")
  assert.ok(changelog.includes("\r\n"), "keeps the changelog's line endings")
  const draft = changelog.replace(/\r\n/g, "\n")
  assert.match(draft, /^# Changelog - LOSPOR Hospital\n\n## \[1\.5\.0\] - 2026-10-10\n\n<!-- release:version draft/)
  assert.match(draft, /Vendors Core, API, Web and PWA 9\.14\.0; Browser stays 0\.8\.2\./)
  assert.match(draft, /- Core 9\.14\.0: Case readiness\n- Core 9\.14\.0: Allergy against drug check\.\n- Core 9\.13\.9: An imported age switches the clinical mode\.\n- Web 9\.14\.0: Readiness cockpit\.\n/)
  assert.doesNotMatch(draft, /Already vendored|Hospital overlay note|Old\./)
  assert.match(draft, /\n## \[1\.4\.22\] - 2026-10-03\n/)

  assert.deepEqual(check(root, "1.5.0"), ["CHANGELOG.md still holds the release:version draft marker: rewrite the entry for operators and delete the marker."])
  writeFileSync(join(root, "CHANGELOG.md"), changelog.replace(`${DRAFT_MARKER}\r\n`, ""))
  assert.deepEqual(check(root, "1.5.0"), [])
})

test("apply is safe to run again and keeps an edited changelog entry", t => {
  const { root, read } = fixture(t)
  apply(root, "1.5.0", options)
  writeFileSync(join(root, "CHANGELOG.md"), read("CHANGELOG.md").replace(DRAFT_MARKER, "Edited by hand."))
  apply(root, "1.5.0", options)
  const changelog = read("CHANGELOG.md")
  assert.equal(changelog.split("## [1.5.0]").length, 2)
  assert.ok(changelog.includes("Edited by hand."))
  assert.deepEqual(check(root, "1.5.0"), [])
})

test("apply refuses a missing justification, an older version and an unknown policy", t => {
  const { root } = fixture(t)
  assert.throws(() => apply(root, "1.5.0", { ...options, justification: undefined }), ReleaseVersionError)
  assert.throws(() => apply(root, "1.5.0", { ...options, justification: "ok" }), /rollback justification/)
  assert.throws(() => apply(root, "1.4.9", options), /not after the current 1\.4\.22/)
  assert.throws(() => apply(root, "1.5", options), /not X\.Y\.Z/)
  assert.throws(() => apply(root, "1.5.0", { ...options, policy: "whatever" }), /Rollback policy/)
})

test("check names each part that disagrees", t => {
  const { root } = fixture(t)
  const problems = check(root, "1.5.0")
  for (const part of ["package.json", "appliance-versions.ts does not declare hospital", "appliance-versions.ts does not declare api 9.14.0", "release-compatibility.tsv describes", "schema_max", "release-rollback-justification.json", "release-validation.md", "release-validation.bg.md", "CHANGELOG.md does not open"]) {
    assert.ok(problems.some(problem => problem.includes(part)), part)
  }
})

test("check refuses a rollback justification whose policy differs from the compatibility row", t => {
  const { root, read } = fixture(t)
  apply(root, "1.5.0", options)
  writeFileSync(join(root, "CHANGELOG.md"), read("CHANGELOG.md").replace(DRAFT_MARKER, ""))
  const rollback = JSON.parse(read("release-rollback-justification.json"))
  writeFileSync(join(root, "release-rollback-justification.json"), JSON.stringify({ ...rollback, policy: "service-compatible" }))
  assert.deepEqual(check(root, "1.5.0"), ["The rollback justification says service-compatible but the compatibility row says backup-required."])
})

test("pin sentences group equal versions the way the notes always have", () => {
  const split = { ...pins("9.13.7"), core: { version: "9.13.6" } }
  assert.equal(pinSentence("1.4.21", split, "en"), "For the 1.4.21 clinical candidate, the coordinated client pins are Core 9.13.6 and API, Web and PWA 9.13.7; Browser is 0.8.2.")
  assert.equal(pinSentence("1.4.21", split, "bg"), "За клиничния кандидат 1.4.21 координираният набор е Core 9.13.6, а API, Web и PWA 9.13.7; Browser е 0.8.2.")
  assert.throws(() => replacePinSentence("no sentence here", "x", "en"), /no longer contain/)
})

test("changelog sections are taken strictly after the vendored version, and only bold leads", () => {
  const text = "## [9.14.0] - d\n\n- **A.** x\n- plain\n\n## [9.13.9] - d\n\n- **B**\n\n## [9.13.8] - d\n\n- **C**\n"
  assert.deepEqual(changelogSections(text, "9.13.8", "9.14.0").map(section => section.version), ["9.14.0", "9.13.9"])
  assert.deepEqual(changelogHighlights(changelogSections(text, "9.13.8", "9.14.0")[0].body), ["A."])
})
