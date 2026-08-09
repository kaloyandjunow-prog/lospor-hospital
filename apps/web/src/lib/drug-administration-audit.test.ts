import { describe, expect, it } from "vitest"
import { drugAdministrationAudit } from "./drug-administration-audit"

describe("drugAdministrationAudit", () => {
  it("creates the same canonical audit snapshot for timetable and event payloads", () => {
    expect(drugAdministrationAudit({
      concentration: "0.5%",
      concentrationUnitHint: "PERCENT",
      formulation: "HYPERBARIC",
      calculationBasis: "IBW",
      calculationWeightKg: 22.4,
      calculationMethod: "MCLAREN_CDC_2000",
      clinicalRuleKey: "PEDIATRIC_BUPIVACAINE",
      clinicalRuleVersion: "3",
      clinicalRuleSourceIds: ["SmPC:123"],
      clinicalPresetId: "preset-1",
      clinicalPresetVersion: 7,
      clinicalPresetScope: "INSTITUTION",
    })).toEqual({
      concentration: "0.5%",
      concentrationValue: 0.5,
      concentrationUnit: "PERCENT",
      formulation: "HYPERBARIC",
      calculationBasis: "IBW",
      calculationWeightKg: 22.4,
      calculationMethod: "MCLAREN_CDC_2000",
      clinicalRuleKey: "PEDIATRIC_BUPIVACAINE",
      clinicalRuleVersion: "3",
      clinicalRuleSourceIds: ["SmPC:123"],
      clinicalPresetId: "preset-1",
      clinicalPresetVersion: 7,
      clinicalPresetScope: "INSTITUTION",
    })
  })

  it("uses an explicit non-percent concentration unit for custom values", () => {
    expect(drugAdministrationAudit({
      concentration: "2.5mg/mL",
      concentrationUnitHint: "MG_PER_ML",
    })).toMatchObject({
      concentration: "2.5mg/mL",
      concentrationValue: 2.5,
      concentrationUnit: "MG_PER_ML",
    })
  })
})
