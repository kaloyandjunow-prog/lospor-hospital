import { describe, expect, it } from "vitest"
import { convertLabValue, isConfidentConversion } from "./lab-unit-conversion"

/**
 * These cases exist because the previous implementation inferred the source unit
 * from the size of the number. Every "already canonical" case below was
 * corrupted by that heuristic — most dangerously the neonatal creatinine, which
 * became 884 µmol/L and read as renal failure in a well baby.
 */
describe("values already in the canonical unit are left alone", () => {
  const untouched: [string, string, string, number][] = [
    ["CRP", "5", "mg/L", 5],
    ["Total bilirubin", "10", "μmol/L", 10],
    ["Urea (BUN)", "7", "mmol/L", 7],
    ["Creatinine", "10", "μmol/L", 10],      // neonate — the 884 case
    ["Creatinine", "72", "μmol/L", 72],      // adult
    ["Glucose", "5.4", "mmol/L", 5.4],
    ["Haemoglobin (Hb)", "135", "g/L", 135],
    ["Calcium (Ca²⁺)", "2.4", "mmol/L", 2.4],
  ]
  for (const [test, value, unit, expected] of untouched) {
    it(`${test} ${value} ${unit}`, () => {
      const result = convertLabValue(test, value, unit)
      expect(result.status).toBe("already-canonical")
      if (result.status === "already-canonical") expect(result.value).toBe(expected)
    })
  }
})

describe("conventional units convert once, from the printed unit", () => {
  const converted: [string, string, string, number][] = [
    ["Creatinine", "1.0", "mg/dL", 88.4],
    ["Creatinine", "0.3", "mg/dL", 26.52],
    ["CRP", "0.5", "mg/dL", 5],
    ["Total bilirubin", "1.0", "mg/dL", 17.1],
    ["Urea (BUN)", "20", "mg/dL", 7.14],
    ["Glucose", "97", "mg/dL", 5.39],
    ["Haemoglobin (Hb)", "13.5", "g/dL", 135],
    ["Haematocrit (Hct)", "0.42", "L/L", 42],
    ["MCHC", "34", "g/dL", 340],
    ["Calcium (Ca²⁺)", "9.6", "mg/dL", 2.4],
  ]
  for (const [test, value, unit, expected] of converted) {
    it(`${test} ${value} ${unit} -> ${expected}`, () => {
      const result = convertLabValue(test, value, unit)
      expect(result.status).toBe("converted")
      if (result.status === "converted") {
        expect(result.value).toBeCloseTo(expected, 2)
        expect(result.sourceValue).toBeCloseTo(Number(value), 4)
        expect(result.sourceUnit).toBe(unit)
      }
    })
  }
})

describe("unit spellings", () => {
  it("accepts the micro sign and Greek mu interchangeably", () => {
    expect(convertLabValue("Creatinine", "80", "µmol/L").status).toBe("already-canonical")
    expect(convertLabValue("Creatinine", "80", "μmol/L").status).toBe("already-canonical")
    expect(convertLabValue("Creatinine", "80", "umol/l").status).toBe("already-canonical")
  })
  it("ignores case and spacing", () => {
    expect(convertLabValue("Creatinine", "1.0", " MG/DL ").status).toBe("converted")
  })
})

describe("refuses to guess", () => {
  it("reports an unrecognised unit rather than converting", () => {
    const result = convertLabValue("Creatinine", "10", "furlongs")
    expect(result.status).toBe("unknown-unit")
    if (result.status === "unknown-unit") {
      expect(result.sourceValue).toBe(10)
      expect(result.canonicalUnit).toBe("μmol/L")
    }
  })

  it("reports an unknown test rather than storing it", () => {
    expect(convertLabValue("Not A Real Test", "5", "mg/L").status).toBe("unknown-test")
  })

  it("reports an unparsable number", () => {
    expect(convertLabValue("CRP", "positive", "mg/L").status).toBe("unparsable")
  })

  it("never pre-selects a row it could not convert confidently", () => {
    expect(isConfidentConversion(convertLabValue("Creatinine", "10", "μmol/L"))).toBe(true)
    expect(isConfidentConversion(convertLabValue("Creatinine", "1.0", "mg/dL"))).toBe(true)
    expect(isConfidentConversion(convertLabValue("Creatinine", "10", "furlongs"))).toBe(false)
    expect(isConfidentConversion(convertLabValue("CRP", "positive", "mg/L"))).toBe(false)
  })
})

describe("haematocrit reported as a fraction", () => {
  // The extractor returns what the report printed. Bulgarian analysers commonly
  // print haematocrit as a fraction, sometimes with no unit at all and sometimes
  // labelled "%" regardless. Both used to reach the review screen as "0.41 %".
  it("converts an unlabelled fraction to a percentage", () => {
    const r = convertLabValue("Haematocrit (Hct)", "0.41", "")
    expect(r.status).toBe("converted")
    expect(r.status === "converted" ? r.value : null).toBe(41)
  })

  it("converts a fraction the extractor mislabelled as a percentage", () => {
    const r = convertLabValue("Haematocrit (Hct)", "0.41", "%")
    expect(r.status).toBe("converted")
    expect(r.status === "converted" ? r.value : null).toBe(41)
  })

  it("leaves a genuine percentage alone", () => {
    const r = convertLabValue("Haematocrit (Hct)", "41", "%")
    expect(r.status).toBe("already-canonical")
    expect(r.status === "already-canonical" ? r.value : null).toBe(41)
  })

  // The rule is confined to haematocrit precisely because a sub-1 value is a
  // normal result for these, and scaling it would invent a pathological one.
  it("does not touch a reticulocyte count of 0.8%", () => {
    const r = convertLabValue("Reticulocytes", "0.8", "%")
    expect(r.status).toBe("already-canonical")
    expect(r.status === "already-canonical" ? r.value : null).toBe(0.8)
  })

  it("does not touch an eosinophil count of 0.5%", () => {
    const r = convertLabValue("Eosinophils", "0.5", "%")
    expect(r.status === "already-canonical" ? r.value : null).toBe(0.5)
  })

  it("does not touch an unlabelled reticulocyte count", () => {
    expect(convertLabValue("Reticulocytes", "0.8", "").status).toBe("unknown-unit")
  })
})

describe("the specific corruptions the old heuristic produced", () => {
  // Each of these was silently multiplied or divided because the number fell
  // inside a range the old code assumed meant "conventional units".
  it("CRP 5 mg/L stays 5, not 50", () => {
    const r = convertLabValue("CRP", "5", "mg/L")
    expect(r.status !== "unparsable" && "value" in r ? r.value : null).toBe(5)
  })
  it("bilirubin 10 µmol/L stays 10, not 171", () => {
    const r = convertLabValue("Total bilirubin", "10", "μmol/L")
    expect(r.status !== "unparsable" && "value" in r ? r.value : null).toBe(10)
  })
  it("urea 7 mmol/L stays 7, not 2.5", () => {
    const r = convertLabValue("Urea (BUN)", "7", "mmol/L")
    expect(r.status !== "unparsable" && "value" in r ? r.value : null).toBe(7)
  })
  it("neonatal creatinine 10 µmol/L stays 10, not 884", () => {
    const r = convertLabValue("Creatinine", "10", "μmol/L")
    expect(r.status !== "unparsable" && "value" in r ? r.value : null).toBe(10)
  })
})

describe("units an EHR actually sends", () => {
  const at = (test: string, value: string, unit: string) => convertLabValue(test, value, unit)

  describe("UCUM spellings, where only the text differs", () => {
    // FHIR carries a unit as a UCUM code, which does not look like a printed
    // report. Refusing these is safe but makes a clinician tick through rows the
    // software could have accepted, which is the friction the import exists to
    // remove.
    it("reads mm[Hg] as our mmHg", () => {
      expect(at("PaO₂", "95", "mm[Hg]")).toMatchObject({ status: "already-canonical", value: 95 })
    })

    it("reads 10*9/L as our ×10⁹/L", () => {
      expect(at("Platelets", "250", "10*9/L")).toMatchObject({ status: "already-canonical", value: 250 })
    })

    it("reads ug/L as our µg/L", () => {
      expect(at("Ferritin", "45", "ug/L")).toMatchObject({ status: "already-canonical", value: 45 })
    })

    it("reads an analyser's 10^9/L and K/uL", () => {
      expect(at("Leucocytes (WBC)", "8.4", "10^9/L")).toMatchObject({ status: "already-canonical" })
      expect(at("Leucocytes (WBC)", "8.4", "K/uL")).toMatchObject({ status: "converted", value: 8.4 })
    })
  })

  describe("the conversions that would change a clinical decision", () => {
    it("converts a European blood gas from kPa", () => {
      // 5.3 kPa is a normal PaCO₂. Taken as printed it reads as profound
      // hypocapnia, on a patient who is ventilated perfectly well.
      expect(at("PaCO₂", "5.3", "kPa")).toMatchObject({ status: "converted", value: 39.75, unit: "mmHg" })
      expect(at("PaO₂", "12.6", "kPa")).toMatchObject({ status: "converted", value: 94.51 })
    })

    it("converts troponin from ng/mL, a thousandfold", () => {
      // 0.04 ng/mL is 40 ng/L — at the decision threshold, not near zero.
      expect(at("Troponin I (hs-cTnI)", "0.04", "ng/mL"))
        .toMatchObject({ status: "converted", value: 40, unit: "ng/L" })
      expect(at("Troponin T (hs-cTnT)", "14", "pg/mL")).toMatchObject({ status: "converted", value: 14 })
    })

    it("converts albumin from g/dL, a tenfold", () => {
      // 4.0 g/dL is a normal 40 g/L; left alone it is catastrophic.
      expect(at("Albumin", "4.0", "g/dL")).toMatchObject({ status: "converted", value: 40, unit: "g/L" })
      expect(at("Total protein", "7.2", "g/dL")).toMatchObject({ status: "converted", value: 72 })
    })

    it("halves a divalent ion given in mEq/L, and leaves a monovalent one alone", () => {
      // The quiet factor of two. Sodium in mEq/L is already mmol/L; calcium is not.
      expect(at("Sodium (Na⁺)", "140", "mEq/L")).toMatchObject({ status: "converted", value: 140 })
      expect(at("Ionised Ca²⁺", "2.4", "mEq/L")).toMatchObject({ status: "converted", value: 1.2 })
      expect(at("Magnesium (Mg²⁺)", "2.0", "mg/dL")).toMatchObject({ status: "converted", value: 0.82 })
    })

    it("converts the remaining conventional chemistries", () => {
      expect(at("Uric acid", "6.0", "mg/dL")).toMatchObject({ value: 357 })
      expect(at("Fibrinogen", "300", "mg/dL")).toMatchObject({ value: 3 })
      expect(at("Lactate", "18", "mg/dL")).toMatchObject({ value: 2 })
      expect(at("Phosphate", "3.5", "mg/dL")).toMatchObject({ value: 1.13 })
      expect(at("Free T4 (fT4)", "1.2", "ng/dL")).toMatchObject({ value: 15.45 })
    })
  })

  describe("what it still refuses to do", () => {
    it("will not convert HbA1c between NGSP and IFCC", () => {
      // Affine, not a factor: IFCC = (NGSP − 2.15) × 10.929. A Rule cannot say
      // that, and forcing one would be wrong across the whole range.
      expect(at("HbA1c", "53", "mmol/mol").status).toBe("unknown-unit")
    })

    it("will not convert a D-dimer, where FEU and DDU differ about twofold", () => {
      // And the distinction is frequently not in the unit string at all.
      expect(at("D-dimer", "0.5", "ug/mL").status).toBe("unknown-unit")
    })

    it("still refuses a unit nobody listed", () => {
      expect(isConfidentConversion(at("Haemoglobin (Hb)", "8.9", "furlongs"))).toBe(false)
    })
  })
})
