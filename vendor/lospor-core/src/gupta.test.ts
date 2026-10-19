import { describe, expect, it } from "vitest"
import {
  calcGuptaMica,
  GUPTA_PROCEDURE_TYPE_BY_GROUP,
  GUPTA_PROCEDURE_TYPES,
  guptaCreatinineFromLabs,
  guptaFromRecord,
  guptaRiskBand,
  suggestGuptaProcedureType,
  guptaFromForm,
} from "./gupta"
import { procedureRows } from "./vocabulary/procedures"
import { displayGuptaRisk } from "./risk-band-display"
import { isGuptaEnabled, isPreopChoiceQuestion, preopAnswerOptionKeys } from "./preop-assessment"

describe("Gupta MICA", () => {
  // x = -5.25 + 0.02*68 - 1.92 (ASA III) + 0 + 0 + 0.86 (peripheral vascular) = -4.95
  it("applies the published coefficients", () => {
    expect(calcGuptaMica({ ageYears: 68, asa: "III", functionalStatus: "INDEPENDENT", creatinine: "NORMAL", procedureType: "PERIPHERAL_VASCULAR" })).toBe(0.7)
    // x = -5.25 + 1.6 - 0.95 + 0.65 + 0.61 + 1.6 (aortic) = -1.74 -> 14.9%
    expect(calcGuptaMica({ ageYears: 80, asa: "IV", functionalStatus: "PARTIALLY_DEPENDENT", creatinine: "ELEVATED", procedureType: "AORTIC" })).toBe(14.9)
  })

  it("shows the risk with its band in either language", () => {
    expect(displayGuptaRisk(1.8, "en").label).toBe("1.8% · Elevated")
    expect(displayGuptaRisk(0.7, "bg").label).toBe("0.7% · Нисък")
  })

  it("bands at the 1% threshold", () => {
    expect(guptaRiskBand(0.7).key).toBe("low")
    expect(guptaRiskBand(1).key).toBe("elevated")
  })

  it("reads creatinine in either unit, and says unknown rather than normal without a result", () => {
    expect(guptaCreatinineFromLabs([{ test: "Creatinine", value: "1.6", unit: "mg/dL" }])).toBe("ELEVATED")
    expect(guptaCreatinineFromLabs([{ test: "Creatinine", value: "120", unit: "µmol/L" }])).toBe("NORMAL")
    expect(guptaCreatinineFromLabs([{ test: "Creatinine", value: "140", unit: "umol/L" }])).toBe("ELEVATED")
    expect(guptaCreatinineFromLabs([])).toBe("UNKNOWN")
  })

  it("names the inputs it is missing instead of assuming them", () => {
    expect(guptaFromRecord({ ageYears: 70, asaScore: "III", answers: [] }))
      .toEqual({ available: false, missing: ["functionalStatus", "procedureType"] })
    expect(guptaFromRecord({ ageYears: 12, asaScore: "VI", answers: [] }))
      .toMatchObject({ available: false, missing: ["age", "asa", "functionalStatus", "procedureType"] })
    expect(guptaFromRecord({
      ageYears: 68,
      asaScore: "III",
      answers: [
        { stableKey: "A15_FUNCTIONAL_STATUS", optionKey: "INDEPENDENT" },
        { stableKey: "A16_GUPTA_PROCEDURE_TYPE", optionKey: "PERIPHERAL_VASCULAR" },
      ],
      labResults: [{ test: "Creatinine", value: "1.0", unit: "mg/dL" }],
    })).toMatchObject({ available: true, percent: 0.7 })
  })

  it("suggests the riskiest type among the planned procedures", () => {
    expect(suggestGuptaProcedureType(["Cholecystectomy", "Inguinal and femoral hernia repair"])).toBe("GALLBLADDER_APPENDIX_ADRENAL_SPLEEN")
    expect(suggestGuptaProcedureType(["Eye procedures"])).toBeNull()
  })

  // A mapping entry for a group the vocabulary does not have would never fire.
  it("maps only procedure groups that exist, onto types that exist", () => {
    const types = new Set(GUPTA_PROCEDURE_TYPES.map(item => item.key))
    const groups = new Set(procedureRows().map(row => row.group))
    for (const [group, type] of Object.entries(GUPTA_PROCEDURE_TYPE_BY_GROUP)) {
      expect(types.has(type)).toBe(true)
      expect(groups.has(group), group).toBe(true)
    }
  })
})

describe("the catalogue choice questions Gupta is answered through", () => {
  const option = (key: string) => ({ key, labelEn: key, labelBg: key, omopConceptId: null, omopVocabulary: null, omopSourceCode: null })

  it("tells a choice question from a yes/no one", () => {
    expect(isPreopChoiceQuestion({ options: [option("YES"), option("NO")] })).toBe(false)
    expect(isPreopChoiceQuestion({ options: [option("INDEPENDENT"), option("PARTIALLY_DEPENDENT"), option("TOTALLY_DEPENDENT")] })).toBe(true)
  })

  it("reads the chosen option of each answer", () => {
    const keys = preopAnswerOptionKeys({ preopAnswers: [{ stableKey: "A15_FUNCTIONAL_STATUS", state: "YES", optionKey: "INDEPENDENT" }, { stableKey: "A12_PACEMAKER_ICD", state: "NO" }] })
    expect([...keys]).toEqual([["A15_FUNCTIONAL_STATUS", "INDEPENDENT"]])
  })

  // Optional: off unless the operator switched both questions on.
  it("is on only when both of its questions are", () => {
    const question = (stableKey: string, enabled: boolean) => ({ stableKey, enabled }) as never
    expect(isGuptaEnabled(null)).toBe(false)
    expect(isGuptaEnabled({ questions: [question("A15_FUNCTIONAL_STATUS", true)] })).toBe(false)
    expect(isGuptaEnabled({ questions: [question("A15_FUNCTIONAL_STATUS", true), question("A16_GUPTA_PROCEDURE_TYPE", true)] })).toBe(true)
  })
})

describe("Gupta from a preop form", () => {
  it("reads age, ASA, labs, answers and the planned procedures the way both clients hold them", () => {
    const { result, suggestedProcedureType } = guptaFromForm({
      ageValue: 68, ageUnit: "YEARS", asaScore: "III",
      labResults: [{ test: "Creatinine", value: "95", unit: "µmol/L" }],
      preopAnswers: [{ stableKey: "A15_FUNCTIONAL_STATUS", state: "YES", optionKey: "INDEPENDENT" }, { stableKey: "A16_GUPTA_PROCEDURE_TYPE", state: "YES", optionKey: "PERIPHERAL_VASCULAR" }],
      procedures: [{ label: "Carotid endarterectomy", group: "Carotid endarterectomy and stenting" }],
    })
    expect(result).toMatchObject({ available: true, percent: 0.7 })
    expect(suggestedProcedureType).toBe("PERIPHERAL_VASCULAR")
  })
})
