import assert from "node:assert/strict"
import test from "node:test"
import { mergeAppJson, mergeChangelog, mergePackageJson, resolveConflict } from "./vendor-conflict-rules.mjs"

const json = value => `${JSON.stringify(value, null, 2)}\n`

const base = json({
  name: "lospor-app", version: "9.13.8", private: true,
  scripts: { build: "next build" },
  dependencies: { "@lospor/core": "github:x/lospor-core#v9.13.8", next: "16.3.7", "expo-thing": "1.0.0" },
})
const ours = json({
  name: "@lospor/hospital-web", version: "1.0.0", private: true,
  scripts: { build: "next build", "hospital:check": "node check.mjs" },
  dependencies: { "@lospor/core": "file:../../vendor/lospor-core", next: "16.3.7" },
})
const theirs = json({
  name: "lospor-app", version: "9.14.0", private: true,
  scripts: { build: "next build" },
  dependencies: { "@lospor/core": "github:x/lospor-core#v9.14.0", next: "16.3.8", "expo-thing": "1.0.1", zod: "4.1.0" },
})

test("package.json keeps the appliance identity, Core link and removals, and takes upstream versions", () => {
  const { text, notes } = mergePackageJson(base, ours, theirs)
  assert.deepEqual(JSON.parse(text), {
    name: "@lospor/hospital-web", version: "1.0.0", private: true,
    scripts: { build: "next build", "hospital:check": "node check.mjs" },
    dependencies: { "@lospor/core": "file:../../vendor/lospor-core", next: "16.3.8", zod: "4.1.0" },
  })
  assert.ok(text.endsWith("}\n"))
  assert.deepEqual(notes.sort(), [
    "dependencies.@lospor/core: vendored Core link kept",
    "dependencies.expo-thing: removed by the appliance, stays removed",
    "version: appliance identity kept",
  ])
})

test("package.json stops for a human when both sides changed anything else", () => {
  const theirsScript = json({ ...JSON.parse(theirs), scripts: { build: "next build --turbo" } })
  const oursScript = json({ ...JSON.parse(ours), scripts: { build: "next build --webpack", "hospital:check": "node check.mjs" } })
  assert.equal(resolveConflict("package.json", { base, ours: oursScript, theirs: theirsScript }), null)
  assert.equal(resolveConflict("package.json", { base, ours: "{ not json", theirs }), null)
  assert.equal(resolveConflict("package.json", { base: null, ours, theirs }), null)
})

const logBase = "# Changelog\n\n## [9.13.8] - 2026-10-03\n\n- Old.\n"
const logOurs = "# Changelog\r\n\r\n## [1.4.21] - 2026-10-02\r\n\r\n- Hospital note.\r\n\r\n## [9.13.8] - 2026-10-03\r\n\r\n- Old.\r\n"
const logTheirs = "# Changelog\n\n## [9.14.0] - 2026-10-04\n\n- New.\n\n## [9.13.9] - 2026-10-04\n\n- Fix.\n\n## [9.13.8] - 2026-10-03\n\n- Old.\n"

test("the changelog gets upstream's new sections on top, in order, and keeps the appliance's", () => {
  const { text } = mergeChangelog(logBase, logOurs, logTheirs)
  assert.equal(text, "# Changelog\r\n\r\n## [9.14.0] - 2026-10-04\r\n\r\n- New.\r\n\r\n## [9.13.9] - 2026-10-04\r\n\r\n- Fix.\r\n\r\n## [1.4.21] - 2026-10-02\r\n\r\n- Hospital note.\r\n\r\n## [9.13.8] - 2026-10-03\r\n\r\n- Old.\r\n")
})

test("the changelog stops for a human when upstream rewrote an old section", () => {
  const rewritten = logTheirs.replace("- Old.", "- Old, corrected.")
  assert.equal(resolveConflict("CHANGELOG.md", { base: logBase, ours: logOurs, theirs: rewritten }), null)
})

test("lockfiles and generated OpenAPI are resolved with the follow-up that makes them true", () => {
  assert.deepEqual(resolveConflict("package-lock.json", { base: "b", ours: "o", theirs: "t" }).followUp, "npm-install")
  assert.equal(resolveConflict("package-lock.json", { base: "b", ours: "o", theirs: "t" }).text, "o")
  const generated = resolveConflict("src/generated/openapi-internal.json", { base: "b", ours: "o", theirs: "t" })
  assert.deepEqual([generated.text, generated.followUp], ["t", "openapi-generate"])
})

test("every other file stops for a human", () => {
  for (const path of ["src/components/forms/IntraopForm.tsx", "apps/web/package.json", "src/package.json", "CHANGELOG.bg.md", "src/generated/other.json"]) {
    assert.equal(resolveConflict(path, { base: "b", ours: "o", theirs: "t" }), null, path)
  }
})

const app = (identity, extra = {}) => json({ expo: { ...identity, orientation: "portrait", ...extra } })
const upstreamIdentity = version => ({ name: "LOSPOR", slug: "lospor-mobile", version, scheme: "lospor" })
const ourIdentity = { name: "LOSPOR Hospital", slug: "lospor-hospital", version: "1.0.0", scheme: "lospor-hospital" }

test("app.json keeps the appliance's Expo identity and takes the rest of upstream's changes", () => {
  const { text, notes } = mergeAppJson(app(upstreamIdentity("10.2.0")), app(ourIdentity), app(upstreamIdentity("10.3.0"), { userInterfaceStyle: "dark" }))
  assert.deepEqual(JSON.parse(text).expo, { ...ourIdentity, orientation: "portrait", userInterfaceStyle: "dark" })
  assert.ok(notes.some(note => note.startsWith("expo.version")))
  assert.ok(text.endsWith("}\n"))
})

test("app.json leaves a field the appliance changed alone, and refuses when both sides changed the same one", () => {
  const baseApp = app(upstreamIdentity("10.2.0"), { orientation: "portrait" })
  const kept = mergeAppJson(baseApp, app(ourIdentity, { orientation: "landscape" }), app(upstreamIdentity("10.3.0"), { orientation: "portrait" }))
  assert.equal(JSON.parse(kept.text).expo.orientation, "landscape")
  assert.throws(() => mergeAppJson(baseApp, app(ourIdentity, { orientation: "landscape" }), app(upstreamIdentity("10.3.0"), { orientation: "default" })), /both sides changed expo.orientation/)
  assert.equal(resolveConflict("app.json", { base: baseApp, ours: app(ourIdentity, { orientation: "landscape" }), theirs: app(upstreamIdentity("10.3.0"), { orientation: "default" }) }), null)
  assert.equal(resolveConflict("app.json", { base: null, ours: "{}", theirs: "{}" }), null)
})
