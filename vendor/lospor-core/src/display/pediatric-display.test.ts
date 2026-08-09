import { describe, expect, it } from "vitest"
import { clinicalDisplayLabel, resolveClinicalDisplay } from "./index"

describe("pediatric clinical display terms", () => {
  it("localizes clinical mode and exact-age units", () => {
    expect(clinicalDisplayLabel("clinicalMode", "PEDIATRIC", "en"))
      .toBe("Pediatric patient")
    expect(clinicalDisplayLabel("clinicalMode", "PEDIATRIC", "bg"))
      .toBe("\u041f\u0435\u0434\u0438\u0430\u0442\u0440\u0438\u0447\u0435\u043d \u043f\u0430\u0446\u0438\u0435\u043d\u0442")
    expect(clinicalDisplayLabel("ageUnit", "MONTHS", "bg"))
      .toBe("\u041c\u0435\u0441\u0435\u0446\u0438")
  })

  it("localizes pediatric research metrics and fields", () => {
    expect(clinicalDisplayLabel("researchMetric", "pediatricRate", "en"))
      .toBe("Pediatric cases")
    expect(clinicalDisplayLabel("researchMetric", "meanAgeDays", "bg"))
      .toBe("\u0421\u0440\u0435\u0434\u043d\u0430 \u043f\u0435\u0434\u0438\u0430\u0442\u0440\u0438\u0447\u043d\u0430 \u0432\u044a\u0437\u0440\u0430\u0441\u0442")
    expect(clinicalDisplayLabel("researchDistribution", "clinicalMode", "bg"))
      .toBe("\u0412\u044a\u0437\u0440\u0430\u0441\u0442\u043e\u0432 \u0440\u0435\u0436\u0438\u043c")
    expect(clinicalDisplayLabel("researchField", "ageApproxDays", "en"))
      .toBe("Approximate age in days")
    expect(clinicalDisplayLabel("researchField", "paedScore", "bg"))
      .toBe("\u041e\u0446\u0435\u043d\u043a\u0430 \u043f\u043e PAED")
  })

  it("marks pediatric terms as clinician reviewed", () => {
    expect(resolveClinicalDisplay("clinicalMode", "PEDIATRIC", "en").reviewStatus)
      .toBe("approved")
    expect(resolveClinicalDisplay("researchField", "pediatricPainScale", "bg").reviewStatus)
      .toBe("approved")
  })
})
