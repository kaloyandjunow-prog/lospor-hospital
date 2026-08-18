import { strict as assert } from "node:assert"
import test from "node:test"
import { linkedCoreVersionProblem, vendoredVersionProblem } from "./upstream-version-lib.mjs"

const core = { path: "vendor/lospor-core", version: "9.1.1" }

test("a vendored version matching its pin is not a problem", () => {
  assert.equal(
    vendoredVersionProblem("core", core, { name: "@lospor/core", version: "9.1.1" }),
    null,
  )
})

test("the real drift is caught: 9.1.0 content pinned as 9.1.1", () => {
  const problem = vendoredVersionProblem(
    "core", core, { name: "@lospor/core", version: "9.1.0" },
  )
  assert.match(problem, /says 9\.1\.0, pinned 9\.1\.1/)
  assert.match(problem, /vendor\/lospor-core\/package\.json/)
})

test("appliance-renamed app trees are exempt", () => {
  // These carry a placeholder version on purpose: they are no longer the
  // upstream package, so their package.json describes nothing about the vendor.
  for (const name of [
    "@lospor/hospital-api",
    "@lospor/hospital-web",
    "@lospor/hospital-pwa",
    "@lospor/hospital-browser",
  ]) {
    assert.equal(
      vendoredVersionProblem("api", { path: "apps/api", version: "9.1.1" },
        { name, version: "1.0.0" }),
      null,
      `${name} should be exempt`,
    )
  }
})

test("a path with no package.json is not a problem", () => {
  assert.equal(vendoredVersionProblem("core", core, null), null)
})

test("a package.json with no version is not a problem", () => {
  assert.equal(vendoredVersionProblem("core", core, { name: "@lospor/core" }), null)
})

test("an unnamed package is still checked", () => {
  // The exemption is for the deliberate hospital rename, not for anything that
  // happens to omit a name — otherwise dropping the name would dodge the gate.
  assert.match(
    vendoredVersionProblem("core", core, { version: "9.1.0" }),
    /says 9\.1\.0, pinned 9\.1\.1/,
  )
})

test("a lookalike name outside the hospital namespace is still checked", () => {
  assert.match(
    vendoredVersionProblem("core", core,
      { name: "@lospor/hospitalish", version: "9.1.0" }),
    /says 9\.1\.0, pinned 9\.1\.1/,
  )
})

test("an app lockfile agreeing with the vendored core is not a problem", () => {
  assert.equal(linkedCoreVersionProblem("api", "9.2.0", "9.2.0"), null)
})

test("a lockfile left behind by a re-vendor is caught", () => {
  // The real drift: a re-vendor replaces vendor/lospor-core and touches no
  // lockfile, so three apps recorded 9.1.1 and the research browser recorded
  // 8.5.0 against a vendored 9.2.0 -- all at once, and silently, because the
  // `file:` link resolves to whatever is on disk.
  assert.match(
    linkedCoreVersionProblem("browser", "9.2.0", "8.5.0"),
    /apps\/browser\/package-lock\.json records linked core 8\.5\.0.*9\.2\.0/,
  )
  assert.match(
    linkedCoreVersionProblem("api", "9.2.0", "9.1.1"),
    /records linked core 9\.1\.1/,
  )
})

test("an app that does not link core has nothing to disagree about", () => {
  assert.equal(linkedCoreVersionProblem("status", "9.2.0", null), null)
})
