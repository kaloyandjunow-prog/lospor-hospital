import assert from "node:assert/strict"
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"
import { STRUCTURAL_CONTRACTS, verifyHospitalOverlays } from "./hospital-overlay-lib.mjs"

const repositoryRoot = fileURLToPath(new URL("..", import.meta.url))
const temporaryRoots = []

test.after(() => {
  for (const root of temporaryRoots) rmSync(root, { recursive: true, force: true })
})

function write(path, value) {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, value)
}

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "lospor-overlay-test-"))
  temporaryRoots.push(root)
  for (const app of ["api", "web", "pwa", "browser"]) {
    const packageJson = {
      name: `@lospor/hospital-${app}`,
      dependencies: { "@lospor/core": "file:../../vendor/lospor-core" },
      devDependencies: {},
    }
    const lock = {
      lockfileVersion: 3,
      packages: {
        "": { dependencies: { "@lospor/core": "file:../../vendor/lospor-core" } },
        "node_modules/@lospor/core": { resolved: "../../vendor/lospor-core", link: true },
      },
    }
    write(join(root, "apps", app, "package.json"), `${JSON.stringify(packageJson)}\n`)
    write(join(root, "apps", app, "package-lock.json"), `${JSON.stringify(lock)}\n`)
  }
  write(join(root, "vendor/lospor-core/package.json"), `${JSON.stringify({
    name: "@lospor/core",
    private: true,
    type: "module",
    main: "./src/index.ts",
    exports: { ".": "./src/index.ts" },
  })}\n`)
  for (const contract of STRUCTURAL_CONTRACTS) {
    write(
      join(root, contract.path),
      `${contract.required.join("\n")}\n`,
    )
  }
  return root
}

function failureIds(report) {
  return new Set(report.failures.map(failure => failure.id))
}

test("the real Hospital tree satisfies every structural overlay contract", () => {
  const report = verifyHospitalOverlays(repositoryRoot)
  assert.equal(report.ok, true, JSON.stringify(report.failures, null, 2))
  assert.equal(report.summary.failed, 0)
  assert(report.summary.total >= 30)
})

test("a minimal structurally valid fixture passes", () => {
  const report = verifyHospitalOverlays(fixture())
  assert.equal(report.ok, true, JSON.stringify(report.failures, null, 2))
})

test("negative controls detect a remote Core package and broken lock link", () => {
  const root = fixture()
  const packagePath = join(root, "apps/web/package.json")
  const packageJson = JSON.parse(readFileSync(packagePath, "utf8"))
  packageJson.dependencies["@lospor/core"] = "github:example/core#v9.9.9"
  write(packagePath, JSON.stringify(packageJson))
  const lockPath = join(root, "apps/web/package-lock.json")
  const lock = JSON.parse(readFileSync(lockPath, "utf8"))
  lock.packages["node_modules/@lospor/core"] = { resolved: "https://registry.invalid/core.tgz" }
  write(lockPath, JSON.stringify(lock))
  const ids = failureIds(verifyHospitalOverlays(root))
  assert(ids.has("web.local-core-package"))
  assert(ids.has("web.local-core-lock"))
})

test("negative controls detect telemetry dependencies, lock entries, and config files", () => {
  const root = fixture()
  const packagePath = join(root, "apps/api/package.json")
  const packageJson = JSON.parse(readFileSync(packagePath, "utf8"))
  packageJson.dependencies["@sentry/node"] = "9.9.9"
  write(packagePath, JSON.stringify(packageJson))
  const lockPath = join(root, "apps/api/package-lock.json")
  const lock = JSON.parse(readFileSync(lockPath, "utf8"))
  lock.packages["node_modules/@sentry/node"] = { version: "9.9.9" }
  write(lockPath, JSON.stringify(lock))
  write(join(root, "apps/web/sentry.client.config.ts"), "export {}\n")
  const ids = failureIds(verifyHospitalOverlays(root))
  assert(ids.has("api.no-external-telemetry-package"))
  assert(ids.has("api.no-external-telemetry-lock"))
  assert(ids.has("all.no-cloud-or-sentry-config"))
})

test("negative controls detect removed API, Web, PWA, Browser, and Core overlay markers", () => {
  const root = fixture()
  const selected = [
    "api.hospital-deployment-guard",
    "web.local-api-routing",
    "web.e2e-local-api-command",
    "web.e2e-local-api-database",
    "web.smoke-local-api-command",
    "pwa.appliance-api-default",
    "pwa.e2e-hospital-api",
    "browser.local-api-rewrite",
    "browser.e2e-hospital-api",
    "core.boundary-check",
  ]
  for (const id of selected) {
    const contract = STRUCTURAL_CONTRACTS.find(item => item.id === id)
    write(join(root, contract.path), "overlay removed\n")
  }
  const ids = failureIds(verifyHospitalOverlays(root))
  for (const id of selected) assert(ids.has(id), `${id} was not detected`)
})

test("negative controls reject public-service fallbacks in appliance routing files", () => {
  const root = fixture()
  const pwa = join(root, "apps/pwa/src/lib/api.ts")
  write(pwa, `${readFileSync(pwa, "utf8")}\nhttps://api.lospor.org\n`)
  const web = join(root, "apps/web/next.config.ts")
  write(web, `${readFileSync(web, "utf8")}\nhttps://api.lospor.org\n`)
  const ids = failureIds(verifyHospitalOverlays(root))
  assert(ids.has("pwa.appliance-api-default"))
  assert(ids.has("web.local-api-routing"))
})

test("negative control detects a publishable or misidentified Core package", () => {
  const root = fixture()
  const path = join(root, "vendor/lospor-core/package.json")
  const packageJson = JSON.parse(readFileSync(path, "utf8"))
  packageJson.private = false
  write(path, JSON.stringify(packageJson))
  assert(failureIds(verifyHospitalOverlays(root)).has("core.package-boundary"))
})
