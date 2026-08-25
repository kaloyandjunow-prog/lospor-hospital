import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const root = new URL("../", import.meta.url)
const read = path => readFile(new URL(path, root), "utf8")

test("installation provisions once and requires exact shared baseline truth before acceptance", async () => {
  const install = await read("scripts/install.sh")
  const provisioner = "scripts/provision-bundled-clinical-baselines.ts"
  const reporter = "scripts/report-hospital-clinical-baselines.ts"
  const migrationAt = install.indexOf("docker compose run --rm --interactive=false -T migrate")
  const bootstrapAt = install.indexOf("scripts/bootstrap-hospital-admin.ts")
  const provisionAt = install.indexOf(provisioner)
  const reportAt = install.indexOf(reporter)
  const doctorAt = install.indexOf("sh ./scripts/doctor.sh --install")
  const successAt = install.indexOf('operator_say "Installation complete."')
  assert.ok(migrationAt >= 0 && bootstrapAt > migrationAt, "Hospital bootstrap must follow migrations")
  assert.ok(provisionAt > bootstrapAt, "baseline provisioning must follow migrations and Hospital bootstrap")
  assert.equal(install.split(provisioner).length - 1, 1, "owner provisioner must be invoked exactly once")
  assert.match(install.slice(provisionAt, provisionAt + provisioner.length + 40), /--apply/)
  assert.ok(reportAt > provisionAt, "exact readiness must be reported after provisioning")
  assert.match(install.slice(reportAt, reportAt + reporter.length + 60), /--require-ready/)
  assert.ok(doctorAt > reportAt, "baseline acceptance must pass before doctor")
  assert.ok(successAt > doctorAt, "doctor and baseline acceptance must precede Installation complete")
})

test("the Hospital API package exposes the exact owner provisioner command", async () => {
  const packageJson = JSON.parse(await read("apps/api/package.json"))
  assert.equal(
    packageJson.scripts["clinical-rules:provision-bundled-baselines"],
    "tsx scripts/provision-bundled-clinical-baselines.ts",
  )
  const source = await read("apps/api/scripts/provision-bundled-clinical-baselines.ts")
  assert.match(source, /process\.argv\.slice\(2\)\.join\(" "\) !== "--apply"/)
  assert.match(source, /provisionBundledClinicalBaselines\(prisma\)/)
})

test("the installer reporter is read-only, bilingual, and uses the shared assessment", async () => {
  const source = await read("apps/api/scripts/report-hospital-clinical-baselines.ts")
  assert.match(source, /assessHospitalClinicalBaselines/)
  assert.match(source, /HOSPITAL_DEFAULT_LOCALE/)
  assert.match(source, /"Not ready", "Не е готово"/)
  assert.match(source, /--require-ready/)
  assert.doesNotMatch(source, /\.(?:create|update|upsert|delete|deleteMany|updateMany)\s*\(/)
  assert.doesNotMatch(source, /publishClinicalRuleset|selectClinicalRuleset/)
})

test("the API exposes an explicit operator command for later acceptance gates", async () => {
  const packageJson = JSON.parse(await read("apps/api/package.json"))
  assert.match(
    packageJson.scripts["hospital:baseline-readiness"],
    /report-hospital-clinical-baselines\.ts/,
  )
})

test("clean-install acceptance proves both independent defaults and exact installed baselines", async () => {
  const acceptance = await read("scripts/test-install.sh")
  assert.match(acceptance, /ClinicalGuidancePolicy/)
  assert.match(acceptance, /PlatformClinicalPresetSelection/)
  assert.match(acceptance, /Adult: Ready/)
  assert.match(acceptance, /Pediatric: Ready/)
  assert.match(acceptance, /report-hospital-clinical-baselines\.ts/)
  assert.match(acceptance, /--require-ready/)
})
