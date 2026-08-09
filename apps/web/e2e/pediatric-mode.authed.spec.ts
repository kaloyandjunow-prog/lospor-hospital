import { test, expect } from "@playwright/test"
import { withRoles, JSON_HEADERS } from "./roles"

// Paediatric mode: the newest clinical surface, and the one where being wrong
// is worst. A child is not a small adult — the doses, the fluid maths and the
// airway sizes all come from a different ruleset — so the register refuses to
// let a case sit in the wrong mode rather than quietly applying adult rules.
//
// Age is recorded as a value and a unit here (6 DAYS, 5 MONTHS) rather than
// rounded to years, because in the first year of life the difference between
// a neonate and a six-month-old is the whole of the dosing.

const NEONATE = { ageValue: 6, ageUnit: "DAYS" as const, sex: "FEMALE" as const, weightKg: 3.2, heightCm: 50 }

test("paediatric mode is live and reports itself", async ({ browser }) => {
  await withRoles(browser, ["member-a"], async ctx => {
    const capabilities = await ctx["member-a"].request.get("/api/capabilities").then(r => r.json())
    expect(capabilities.features.pediatricMode.enabled).toBe(true)
    expect(capabilities.features.pediatricMode.productionReady).toBe(true)
  })
})

test("a paediatric case is stamped with the mode and the ruleset it was recorded under", async ({ browser }) => {
  await withRoles(browser, ["member-a"], async ctx => {
    const api = ctx["member-a"].request

    const created = await api.post("/api/cases", {
      headers: JSON_HEADERS,
      data: { clinicalMode: "PEDIATRIC", preop: NEONATE },
    })
    expect(created.status(), await created.text()).toBe(201)
    const body = await created.json()
    expect(body.clinicalMode).toBe("PEDIATRIC")
    // Which ruleset the case was recorded under, recorded on the case. Asserted
    // as present rather than equal to a literal: the version moves with every
    // clinical release, and pinning it here would make that a test failure.
    expect(body.clinicalRulesVersion).toBeTruthy()

    try {
      const detail = await api.get(`/api/cases/${body.id}`).then(r => r.json())
      expect(detail.clinicalMode).toBe("PEDIATRIC")
      // The precise age survives the round trip — not flattened to 0 years.
      expect(detail.preop.ageValue).toBe(6)
      expect(detail.preop.ageUnit).toBe("DAYS")
      // Nothing left for the clinician to decide: the mode is already right.
      expect(detail.pediatricModeDecisionRequired).toBe(false)
    } finally {
      const del = await api.delete(`/api/cases/${body.id}`, { headers: JSON_HEADERS })
      expect(del.ok(), `cleanup delete failed: ${del.status()}`).toBeTruthy()
    }
  })
})

test("a child cannot be recorded in adult mode", async ({ browser }) => {
  await withRoles(browser, ["member-a"], async ctx => {
    const refused = await ctx["member-a"].request.post("/api/cases", {
      headers: JSON_HEADERS,
      data: { clinicalMode: "ADULT", preop: { ageYears: 7, sex: "MALE", weightKg: 24 } },
    })
    // 409, and the client is told which mode is required rather than being left
    // to guess why the save failed.
    expect(refused.status()).toBe(409)
    expect((await refused.json()).error).toBe("PEDIATRIC_MODE_REQUIRED")
  })
})

test("an adult cannot be recorded in paediatric mode", async ({ browser }) => {
  await withRoles(browser, ["member-a"], async ctx => {
    const refused = await ctx["member-a"].request.post("/api/cases", {
      headers: JSON_HEADERS,
      data: {
        clinicalMode: "PEDIATRIC",
        preop: { ageValue: 25, ageUnit: "YEARS", sex: "MALE", weightKg: 80 },
      },
    })
    // 422 INVALID_PEDIATRIC_AGE rather than 409 ADULT_MODE_REQUIRED: the age is
    // validated before the mode is compared, and 25 years is outside the
    // paediatric range full stop. Both refusals mean the same thing to the
    // clinician — this case does not belong in paediatric mode — so this pins
    // the behaviour that actually happens rather than the one the error map
    // anticipates.
    expect(refused.status()).toBe(422)
    expect((await refused.json()).error).toBe("INVALID_PEDIATRIC_AGE")
  })
})

test("the paediatric ruleset the clients dose from is served and identified", async ({ browser }) => {
  await withRoles(browser, ["member-a"], async ctx => {
    const rules = await ctx["member-a"].request.get("/api/clinical/pediatric/rules")
    expect(rules.ok(), await rules.text()).toBeTruthy()
    const body = await rules.json()
    expect(body.enabled).toBe(true)
    expect(body.rulesetVersion).toBeTruthy()
    // Doses come from a reviewed profile or not at all — an empty profile list
    // would silently fall back to no dosing rather than to adult dosing, and
    // the clients would show nothing. Either way, it is the thing to notice.
    expect(Array.isArray(body.pediatricDrugProfiles)).toBeTruthy()
    expect(body.pediatricDrugProfiles.length).toBeGreaterThan(0)
    // Every profile names its provenance; an unattributed dose is not usable.
    expect(Array.isArray(body.sources)).toBeTruthy()
    expect(body.sources.length).toBeGreaterThan(0)
  })
})

// Not covered here, deliberately: the minimum-client-version gate (426) and the
// 8.2.1 quick-dose clamp. The web proxy overwrites x-lospor-client-version on
// every /api request, so an out-of-date client cannot be impersonated through
// the browser; and the clamp is applied client-side by
// resolveDrugSelectionSurface, which core's own tests measure against every
// band in the ruleset — far more thoroughly than one browser click could.
