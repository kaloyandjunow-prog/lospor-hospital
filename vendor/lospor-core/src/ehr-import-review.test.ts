import { describe, expect, it } from "vitest"

import { normalizeEhrImport } from "./ehr-import"
import {
  buildEhrReviewPlan,
  ehrItemKey,
  visibleReviewItems,
  type EhrReviewInput,
} from "./ehr-import-review"

function plan(
  fields: Record<string, unknown>,
  rest: Partial<Omit<EhrReviewInput, "canonical">> = {},
) {
  const { canonical } = normalizeEhrImport({
    identifierType: "IZ", identifier: "42", fields,
  })
  return buildEhrReviewPlan({ canonical, current: {}, ...rest })
}

function stateOf(result: ReturnType<typeof plan>, key: string) {
  return result.items.find(i => i.itemKey === key)?.state
}

describe("an imported age never changes the clinical mode", () => {
  // The failure this whole design exists to prevent. Switching mode clears the
  // adult risk scores and every vital and resets aiOptIn to false, so an
  // import that caused it would silently revoke AI consent and discard
  // recorded observations.

  it("does not tick a paediatric age arriving at an adult-mode case", () => {
    const result = plan({ ageYears: 7 }, { currentClinicalMode: "ADULT" })

    expect(stateOf(result, "ageYears")).toBe("needs-mode-decision")
    expect(result.preselectedKeys).toEqual([])
  })

  it("still shows it, so the clinician can decide", () => {
    const result = plan({ ageYears: 7 }, { currentClinicalMode: "ADULT" })

    expect(visibleReviewItems(result)).toHaveLength(1)
  })

  it("reads value and unit together, because 3 is an adult in years and an infant in months", () => {
    const months = plan(
      { ageValue: 3, ageUnit: "MONTHS" },
      { currentClinicalMode: "ADULT" },
    )
    expect(months.preselectedKeys).toEqual([])

    const years = plan(
      { ageValue: 30, ageUnit: "YEARS" },
      { currentClinicalMode: "ADULT" },
    )
    expect(years.preselectedKeys.sort()).toEqual(["ageUnit", "ageValue"])
  })

  it("takes the missing half from the case when the message sends only one", () => {
    // A message carrying a bare "3" against a case already recording months is
    // an infant, and must be read as one.
    const result = plan(
      { ageValue: 3 },
      { current: { ageUnit: "MONTHS" }, currentClinicalMode: "ADULT" },
    )

    expect(stateOf(result, "ageValue")).toBe("needs-mode-decision")
  })

  it("leaves an adult age alone in an adult case", () => {
    expect(plan({ ageYears: 40 }, { currentClinicalMode: "ADULT" }).preselectedKeys)
      .toEqual(["ageYears"])
  })

  it("does not flag a paediatric age in a case already in paediatric mode", () => {
    expect(plan({ ageYears: 7 }, { currentClinicalMode: "PEDIATRIC" }).preselectedKeys)
      .toEqual(["ageYears"])
  })
})

describe("what the clinician already wrote is never overwritten", () => {
  it("offers a differing value rather than ticking it", () => {
    const result = plan({ weightKg: 80 }, { current: { weightKg: 75 } })

    expect(stateOf(result, "weightKg")).toBe("conflict")
    expect(result.preselectedKeys).toEqual([])
    expect(result.items[0].current).toBe(75)
  })

  it("ticks a value where the case has nothing", () => {
    expect(plan({ weightKg: 80 }, { current: { weightKg: null } }).preselectedKeys)
      .toEqual(["weightKg"])
  })

  it("says nothing about a value the case already holds", () => {
    // Not a question, so not a row. Showing it is how a review screen teaches
    // people to tick without reading.
    const result = plan({ weightKg: 75 }, { current: { weightKg: 75 } })

    expect(stateOf(result, "weightKg")).toBe("unchanged")
    expect(visibleReviewItems(result)).toEqual([])
  })

  it("does not treat a re-typed value as a disagreement over its formatting", () => {
    expect(stateOf(plan({ bloodType: "A" }, { current: { bloodType: " a " } }), "bloodType"))
      .toBe("unchanged")
  })
})

describe("lists are added to, not replaced", () => {
  it("offers a diagnosis the clinician does not have", () => {
    // Additive: accepting it cannot remove anything they entered, so it is new
    // information rather than a disagreement.
    const result = plan(
      { diagnoses: [{ label: "Acute appendicitis", code: "K35" }] },
      { current: { diagnoses: [{ label: "Hypertension", code: "I10" }] } },
    )

    expect(result.items).toHaveLength(1)
    expect(result.items[0].state).toBe("preselected")
  })

  it("recognises a diagnosis the case already carries", () => {
    const result = plan(
      { diagnoses: [{ label: "Acute appendicitis", code: "K35" }] },
      { current: { diagnoses: [{ label: "ОСТЪР АПЕНДИСИТ", code: "K35" }] } },
    )

    expect(result.items[0].state).toBe("unchanged")
  })

  it("matches on the label when neither side has a code", () => {
    const result = plan(
      { comorbidities: [{ label: "Diabetes mellitus" }] },
      { current: { comorbidities: [{ label: "diabetes  mellitus" }] } },
    )

    expect(result.items[0].state).toBe("unchanged")
  })
})

describe("labs: the newest is the one offered", () => {
  const twoHaemoglobins = {
    labResults: [
      { test: "Haemoglobin (Hb)", unit: "g/L", value: "120", takenAt: "2026-08-29T08:00:00Z" },
      { test: "Haemoglobin (Hb)", unit: "g/L", value: "89", takenAt: "2026-09-01T08:00:00Z" },
    ],
  }

  it("ticks the most recent result per test and not the earlier ones", () => {
    const result = plan(twoHaemoglobins)

    expect(result.preselectedKeys).toEqual(["labResults|haemoglobin (hb)|2026-09-01T08:00:00.000Z|89"])
    expect(stateOf(result, "labResults|haemoglobin (hb)|2026-08-29T08:00:00.000Z|120")).toBe("superseded")
  })

  it("keeps the earlier result rather than dropping it", () => {
    // A falling haemoglobin is the clinically interesting part; hiding it would
    // be a quiet harm. It collapses behind a count instead.
    const result = plan(twoHaemoglobins)

    expect(visibleReviewItems(result)).toHaveLength(2)
    expect(result.supersededCountByTest).toEqual({ "haemoglobin (hb)": 1 })
  })

  it("counts the collapse per test, not for the whole list", () => {
    const result = plan({
      labResults: [
        { test: "Haemoglobin (Hb)", unit: "g/L", value: "120", takenAt: "2026-08-29T08:00:00Z" },
        { test: "Haemoglobin (Hb)", unit: "g/L", value: "110", takenAt: "2026-08-30T08:00:00Z" },
        { test: "Haemoglobin (Hb)", unit: "g/L", value: "89", takenAt: "2026-09-01T08:00:00Z" },
        { test: "Sodium (Na⁺)", unit: "mmol/L", value: "138", takenAt: "2026-09-01T08:00:00Z" },
      ],
    })

    expect(result.supersededCountByTest).toEqual({ "haemoglobin (hb)": 2 })
    expect(result.preselectedKeys).toHaveLength(2)
  })

  it("keeps two same-test results drawn at the same moment apart", () => {
    // A hospital can call one of our tests by more than one of its own codes —
    // a main-laboratory haemoglobin and a blood-gas one, a legacy code beside
    // its replacement — and both can be drawn at the same moment. Sharing a key
    // would make the staging table's uniqueness silently drop one of them.
    const result = plan({
      labResults: [
        { test: "Haemoglobin (Hb)", unit: "g/L", value: "120", takenAt: "2026-09-01T08:00:00Z" },
        { test: "Haemoglobin (Hb)", unit: "g/L", value: "112", takenAt: "2026-09-01T08:00:00Z" },
      ],
    })

    expect(new Set(result.items.map(i => i.itemKey)).size).toBe(2)
    expect(result.items).toHaveLength(2)
  })

  it("does not re-offer a result already imported", () => {
    const result = plan(
      { labResults: [{ test: "Haemoglobin (Hb)", unit: "g/L", value: "89", takenAt: "2026-09-01T08:00:00Z" }] },
      { current: { labResults: [{ test: "Haemoglobin (Hb)", unit: "g/L", value: "89", takenAt: "2026-09-01T08:00:00.000Z" }] } },
    )

    expect(result.items[0].state).toBe("unchanged")
  })

  it("offers a genuinely newer result on a re-poll", () => {
    // The whole point of keying on the draw time: same test, later specimen,
    // still a new result.
    const result = plan(
      { labResults: [{ test: "Haemoglobin (Hb)", unit: "g/L", value: "72", takenAt: "2026-09-02T08:00:00Z" }] },
      { current: { labResults: [{ test: "Haemoglobin (Hb)", unit: "g/L", value: "89", takenAt: "2026-09-01T08:00:00.000Z" }] } },
    )

    expect(result.items[0].state).toBe("preselected")
  })
})

describe("an undated result is shown but never ticked", () => {
  it("gets its own state rather than being pre-selected", () => {
    // A preoperative haemoglobin is only worth anything if you know how old it
    // is. This one could be from this morning or from six months ago, so the
    // clinician decides whether they can vouch for it.
    const result = plan({ labResults: [{ test: "Haemoglobin (Hb)", unit: "g/L", value: "89" }] })

    expect(result.items[0].state).toBe("undated")
    expect(result.preselectedKeys).toEqual([])
    expect(visibleReviewItems(result)).toHaveLength(1)
  })

  it("does not supersede a dated result, or get superseded by one", () => {
    // There is no way to say which of the two came first, so neither can rank
    // the other. The dated one is still offered on its own merits.
    const result = plan({
      labResults: [
        { test: "Haemoglobin (Hb)", unit: "g/L", value: "89", takenAt: "2026-09-01T08:00:00Z" },
        { test: "Haemoglobin (Hb)", unit: "g/L", value: "120" },
      ],
    })

    expect(result.preselectedKeys).toEqual(["labResults|haemoglobin (hb)|2026-09-01T08:00:00.000Z|89"])
    expect(result.supersededCountByTest).toEqual({})
    expect(result.items.map(i => i.state).sort()).toEqual(["preselected", "undated"])
  })

  it("keeps two undated results of one test apart by their values", () => {
    // Sharing a key would let one silently replace the other — precisely the
    // collapse the draw time exists to prevent.
    const result = plan({
      labResults: [
        { test: "Haemoglobin (Hb)", unit: "g/L", value: "120" },
        { test: "Haemoglobin (Hb)", unit: "g/L", value: "89" },
      ],
    })

    expect(new Set(result.items.map(i => i.itemKey)).size).toBe(2)
    expect(result.items).toHaveLength(2)
  })

  it("can still be refused and remembered like anything else", () => {
    const key = ehrItemKey("labResults", { test: "Haemoglobin (Hb)", unit: "g/L", value: "89", takenAt: null })
    const result = plan({ labResults: [{ test: "Haemoglobin (Hb)", unit: "g/L", value: "89" }] }, { declinedKeys: [key] })

    expect(stateOf(result, key)).toBe("declined")
  })
})

describe("a refusal is remembered", () => {
  it("never offers a rejected item again", () => {
    // Re-proposing the same wrong diagnosis every poll teaches people to accept
    // without reading. A clinician who wants it can write it by hand.
    const key = ehrItemKey("diagnoses", { code: "K35" })
    const result = plan(
      { diagnoses: [{ label: "Acute appendicitis", code: "K35" }] },
      { declinedKeys: [key] },
    )

    expect(stateOf(result, key)).toBe("declined")
    expect(visibleReviewItems(result)).toEqual([])
    expect(result.preselectedKeys).toEqual([])
  })

  it("keeps refusing across a re-poll that recodes the same item", () => {
    const key = ehrItemKey("diagnoses", { code: "K35" })
    expect(ehrItemKey("diagnoses", { label: "Something else entirely", code: "K35" }))
      .toBe(key)
  })

  it("refuses one item without silencing its neighbours", () => {
    const result = plan(
      {
        diagnoses: [
          { label: "Acute appendicitis", code: "K35" },
          { label: "Hypertension", code: "I10" },
        ],
      },
      { declinedKeys: [ehrItemKey("diagnoses", { code: "K35" })] },
    )

    expect(result.preselectedKeys).toEqual([ehrItemKey("diagnoses", { code: "I10" })])
  })

  it("outranks everything, including a value the case is missing", () => {
    expect(plan({ weightKg: 80 }, { declinedKeys: ["weightKg"] }).preselectedKeys)
      .toEqual([])
  })
})

describe("only preselected items are ticked", () => {
  it("holds across every state at once", () => {
    // The one invariant the screen depends on: a conflict, a superseded lab, a
    // refusal and an age implying a mode change all require a deliberate reach.
    const result = plan(
      {
        weightKg: 80,
        ageYears: 7,
        heightCm: 120,
        diagnoses: [{ code: "K35", label: "Acute appendicitis" }],
        labResults: [
          { test: "Haemoglobin (Hb)", unit: "g/L", value: "120", takenAt: "2026-08-29T08:00:00Z" },
          { test: "Haemoglobin (Hb)", unit: "g/L", value: "89", takenAt: "2026-09-01T08:00:00Z" },
        ],
      },
      {
        current: { weightKg: 75 },
        currentClinicalMode: "ADULT",
        declinedKeys: ["heightCm"],
      },
    )

    expect(result.preselectedKeys.sort()).toEqual([
      "diagnoses|k35",
      "labResults|haemoglobin (hb)|2026-09-01T08:00:00.000Z|89",
    ])
    expect(result.items.every(i =>
      result.preselectedKeys.includes(i.itemKey) === (i.state === "preselected"),
    )).toBe(true)
  })
})
