import { describe, expect, it } from "vitest"
import {
  displayDistributionBucket,
  displayResearchAge,
  displayResearchFieldValue,
} from "./clinical-display"

describe("pediatric research display", () => {
  it("renders exact age with the shared localized unit", () => {
    expect(displayResearchAge({
      ageValue: 6,
      ageUnit: "MONTHS",
      ageYears: 0,
    }, "en")).toBe("6 Months")
    expect(displayResearchAge({
      ageValue: 20,
      ageUnit: "DAYS",
      ageYears: 0,
    }, "bg")).toBe("20 \u0414\u043d\u0438")
    expect(displayResearchAge({
      ageValue: null,
      ageUnit: null,
      ageYears: 55,
    }, "en")).toBe("55 Years")
  })

  it("routes pediatric mode and age units through Core labels", () => {
    expect(displayResearchFieldValue("clinicalMode", "PEDIATRIC", "bg"))
      .toBe("\u041f\u0435\u0434\u0438\u0430\u0442\u0440\u0438\u0447\u0435\u043d \u043f\u0430\u0446\u0438\u0435\u043d\u0442")
    expect(displayResearchFieldValue("ageUnit", "MONTHS", "en"))
      .toBe("Months")
    expect(displayDistributionBucket("clinicalMode", {
      key: "PEDIATRIC",
      label: "PEDIATRIC",
      count: 12,
      percent: 25,
      suppressed: false,
    }, "en")).toBe("Pediatric patient")
  })
})