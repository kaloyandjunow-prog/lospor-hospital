import { describe, expect, it } from "vitest"

import {
  buildSafetyFindings,
  hasSafetyFindings,
  type EhrAirwayFinding,
  type EhrAllergyFinding,
} from "./ehr-safety-findings"

/**
 * The message that changes what happens to this patient at their next
 * admission. Its value is entirely in being read, so the tests here are about
 * what is worth sending and what would train a hospital to ignore the channel.
 */

function findings(
  preop: Record<string, unknown> = {},
  intraop: Record<string, unknown> = {},
) {
  return buildSafetyFindings({ preop, intraop })
}

function airway(result: ReturnType<typeof findings>) {
  return result.find(f => f.kind === "airway") as EhrAirwayFinding | undefined
}

function allergy(result: ReturnType<typeof findings>) {
  return result.find(f => f.kind === "allergy") as EhrAllergyFinding | undefined
}

describe("a difficult airway is worth sending; a routine one is not", () => {
  it("reports grade III and IV", () => {
    expect(airway(findings({}, { cormackLehane: "III" }))?.grade).toBe("III")
    expect(airway(findings({}, { cormackLehane: "IV" }))?.grade).toBe("IV")
  })

  it("says nothing about a routine laryngoscopy", () => {
    // IIa and IIb are a partial view and a routine intubation. Sending them
    // would train people to ignore the message, and then the grade IV that
    // matters is ignored too.
    for (const grade of ["I", "IIa", "IIb"]) {
      expect(airway(findings({}, { cormackLehane: grade }))).toBeUndefined()
    }
  })

  it("says nothing when no grade was recorded", () => {
    expect(findings({}, {})).toEqual([])
    expect(hasSafetyFindings(findings({}, {}))).toBe(false)
  })
})

describe("the timing is the information", () => {
  // "Predicted difficult and was" confirms an assessment that already works.
  // "Looked straightforward and was not" is the dangerous one: nobody will
  // predict it next time either unless this message says so. Flattening the
  // two into one warning throws away the half that matters.

  it("marks an unanticipated difficult airway as unanticipated", () => {
    const finding = airway(findings({ mallampati: "I" }, { cormackLehane: "IV" }))

    expect(finding?.anticipated).toBe(false)
    expect(finding?.predictors).toEqual([])
  })

  it("marks a predicted one as anticipated, and says what predicted it", () => {
    const finding = airway(findings(
      { mallampati: "IV", difficultAirwayHistory: true },
      { cormackLehane: "III" },
    ))

    expect(finding?.anticipated).toBe(true)
    expect(finding?.predictors).toEqual(["Mallampati IV", "previous difficult airway"])
  })

  it("counts a grade from an earlier anaesthetic as a predictor", () => {
    // A Cormack-Lehane recorded preoperatively is history, not an examination
    // finding — but it predicts as well as anything.
    const finding = airway(findings({ cormackLehane: "IV" }, { cormackLehane: "IV" }))

    expect(finding?.predictors).toEqual(["previous Cormack-Lehane IV"])
  })

  it("counts the airway measurements, not only the grades", () => {
    const finding = airway(findings(
      { mouthOpeningCm: 2.5, thyromental: 5, neckMobility: "FIXED" },
      { cormackLehane: "III" },
    ))

    expect(finding?.anticipated).toBe(true)
    expect(finding?.predictors).toEqual([
      "neck mobility fixed",
      "mouth opening 2.5 cm",
      "thyromental 5 cm",
    ])
  })

  it("does not treat a normal measurement as a predictor", () => {
    const finding = airway(findings(
      { mouthOpeningCm: 5, thyromental: 7, neckMobility: "FULL", mallampati: "II" },
      { cormackLehane: "IV" },
    ))

    expect(finding?.anticipated).toBe(false)
  })
})

describe("allergies are sent whole, and carry no timing", () => {
  // An allergy is a standing contraindication whenever it was learned, so no
  // "discovered during this case" flag exists. The hospital deduplicates. One
  // reported twice costs a drug choice; one omitted can kill.

  it("sends the whole list rather than a delta", () => {
    const result = allergy(findings({
      allergies: true,
      allergyDetails: JSON.stringify([{ label: "Penicillin" }, { label: "Latex" }]),
    }))

    expect(result?.items.map(i => i.label)).toEqual(["Penicillin", "Latex"])
  })

  it("carries per-item provenance, because the strength of evidence differs", () => {
    // "Patient states penicillin allergy" and "ward record says so" are not
    // the same claim.
    const result = allergy(findings({
      allergies: true,
      allergyDetails: JSON.stringify([
        { label: "Penicillin", source: "import" },
        { label: "Latex", source: "manual" },
      ]),
    }))

    expect(result?.items).toEqual([
      { label: "Penicillin", source: "import" },
      { label: "Latex", source: "manual" },
    ])
  })

  it("reads a plain string as one entry rather than failing", () => {
    expect(allergy(findings({ allergies: true, allergyDetails: "Penicillin" }))?.items)
      .toEqual([{ label: "Penicillin" }])
  })

  it("sends unparseable text as written rather than dropping it", () => {
    // Somebody's clinical text with a broken encoding is still an allergy. An
    // allergy lost to a parse error is the worst possible failure here.
    const result = allergy(findings({ allergies: true, allergyDetails: "[not json" }))

    expect(result?.items).toEqual([{ label: "[not json" }])
  })

  it("says nothing when the patient has none", () => {
    expect(allergy(findings({ allergies: false, allergyDetails: null }))).toBeUndefined()
    expect(allergy(findings({}))).toBeUndefined()
  })

  it("respects an explicit no even if stale detail text remains", () => {
    // "No known allergies" is a clinical statement and outranks leftover text.
    expect(allergy(findings({ allergies: false, allergyDetails: "Penicillin" })))
      .toBeUndefined()
  })
})

describe("an empty message is not sent", () => {
  it("reports nothing for a routine case with no allergies", () => {
    // Sending an empty safety message on every finalised case is how a hospital
    // learns to filter the channel out — and then the one that matters is
    // filtered too.
    const result = findings({ mallampati: "I", allergies: false }, { cormackLehane: "I" })

    expect(result).toEqual([])
    expect(hasSafetyFindings(result)).toBe(false)
  })

  it("reports both when both apply", () => {
    const result = findings(
      { allergies: true, allergyDetails: "Penicillin", mallampati: "I" },
      { cormackLehane: "IV" },
    )

    expect(result.map(f => f.kind).sort()).toEqual(["airway", "allergy"])
    expect(hasSafetyFindings(result)).toBe(true)
  })
})
