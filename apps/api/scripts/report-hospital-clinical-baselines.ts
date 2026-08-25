/**
 * Read-only Hospital operator report for the two selected clinical baselines.
 * It never creates, publishes, selects, repairs, or attributes a ruleset.
 *
 * Default reporting is deliberately non-failing: a new appliance can finish
 * installation and support manual charting while clinical governance completes
 * publication/selection. `--require-ready` is available for a later, explicit
 * site-acceptance or release-candidate gate.
 */
import "dotenv/config"
import { assessHospitalClinicalBaselines } from "../src/lib/hospital/clinical-baseline-readiness"
import { prisma } from "../src/lib/prisma"

const REQUIRE_READY = "--require-ready"
const argumentsList = process.argv.slice(2)
if (argumentsList.some(argument => argument !== REQUIRE_READY)) {
  throw new Error("Usage: report-hospital-clinical-baselines.ts [--require-ready]")
}
const requireReady = argumentsList.includes(REQUIRE_READY)
const locale = process.env.HOSPITAL_DEFAULT_LOCALE?.trim().toLowerCase() === "en" ? "en" : "bg"

const message = <T>(english: T, bulgarian: T): T => locale === "en" ? english : bulgarian

const reason = {
  READY: message("exact selected published v2 content matches", "точно избраното публикувано съдържание v2 съвпада"),
  SELECTION_MISSING: message("no platform baseline is selected", "няма избрана базова конфигурация за цялата система"),
  IDENTITY_MISMATCH: message("selected preset identity differs from bundled v2", "идентичността на избрания набор се различава от включената версия v2"),
  VERSION_MISMATCH: message("selected baseline is not v2", "избраната базова конфигурация не е v2"),
  NOT_PUBLISHED: message("selected baseline is not published", "избраната базова конфигурация не е публикувана"),
  RULE_COUNT_MISMATCH: message("rule count differs from bundled v2", "броят правила се различава от включената версия v2"),
  RULES_INVALID: message("stored rules fail publication validation", "съхранените правила не преминават проверката за публикуване"),
  PROFILE_COUNT_MISMATCH: message("profile counts differ from bundled v2", "броят профили се различава от включената версия v2"),
  DIGEST_MISMATCH: message("content SHA-256 differs from bundled v2", "SHA-256 на съдържанието се различава от включената версия v2"),
} as const

async function main() {
  const baselines = await assessHospitalClinicalBaselines(prisma)
  for (const [label, baseline] of [
    [message("Adult", "Възрастни"), baselines.adult],
    [message("Pediatric", "Деца"), baselines.pediatric],
  ] as const) {
    const state = baseline.baselineReady
      ? message("Ready", "Готово")
      : message("Not ready", "Не е готово")
    const selected = baseline.selected
      ? `${baseline.selected.presetId} v${baseline.selected.version}`
      : message("none", "няма")
    console.log(
      `${label}: ${state} — ${reason[baseline.reasonCode]}; `
      + `${message("selected", "избрано")}: ${selected}; `
      + `${message("expected", "очаквано")}: ${baseline.expected.presetId} v${baseline.expected.version}; `
      + `${message("rules", "правила")}: ${baseline.selected?.ruleCount ?? 0}/${baseline.expected.ruleCount}`,
    )
  }
  if (requireReady && (!baselines.adult.baselineReady || !baselines.pediatric.baselineReady)) {
    process.exitCode = 1
  }
}

main()
  .catch(error => {
    console.error(error instanceof Error ? error.message : "Clinical baseline readiness failed")
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
