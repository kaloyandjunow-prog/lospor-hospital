import { describe, expect, it } from "vitest"

import { normalizeEhrImport, type EhrLabValue } from "./ehr-import"
import { buildEhrReviewPlan, visibleReviewItems } from "./ehr-import-review"
import { applyEhrSelections } from "./ehr-import-apply"

/**
 * A hospital reports in its own units, and our fields are in ours.
 *
 * Until this was wired, `convertLabValue` had no callers at all: a haemoglobin
 * of 8.9 g/dL was written into a g/L field as 8.9, which reads as an emergency
 * transfusion rather than a normal result, with nothing marking it wrong.
 */
function labs(values: unknown[]): EhrLabValue[] {
  const { canonical } = normalizeEhrImport({
    identifierType: "IZ",
    identifier: "42",
    fields: { labResults: values },
  })
  const field = canonical.fields.find(item => item.field === "labResults")
  return (field?.value ?? []) as EhrLabValue[]
}

describe("a result arrives in the unit our field expects", () => {
  it("converts a conventional haemoglobin and keeps what was reported", () => {
    const [lab] = labs([{ test: "Haemoglobin (Hb)", value: "8.9", unit: "g/dL", takenAt: "2026-09-03T07:30:00Z" }])

    expect(lab).toMatchObject({
      test: "Haemoglobin (Hb)",
      value: "89",
      unit: "g/L",
      // Shown beside the converted figure, not replaced by it: a clinician who
      // sees both can catch a wrong mapping; one who sees only 89 must trust it.
      reportedValue: "8.9",
      reportedUnit: "g/dL",
    })
    expect(lab.unconverted).toBeUndefined()
  })

  it("converts a European blood gas, where the raw number looks survivable", () => {
    // 5.3 taken as mmHg is a PaCO₂ nobody has. It is a normal 40.
    const [lab] = labs([{ test: "PaCO₂", value: "5.3", unit: "kPa", takenAt: "2026-09-03T07:30:00Z" }])

    expect(lab).toMatchObject({ value: "39.75", unit: "mmHg", reportedValue: "5.3" })
  })

  it("records nothing extra when the unit was already ours", () => {
    const [lab] = labs([{ test: "Haemoglobin (Hb)", value: "120", unit: "g/L", takenAt: "2026-09-03T07:30:00Z" }])

    expect(lab).toMatchObject({ value: "120", unit: "g/L" })
    expect(lab.reportedValue).toBeUndefined()
  })
})

describe("a unit we cannot convert is never written", () => {
  const unknownUnit = [{ test: "Haemoglobin (Hb)", value: "8.9", unit: "g%", takenAt: "2026-09-03T07:30:00Z" }]

  it("marks the result rather than guessing its scale", () => {
    expect(labs(unknownUnit)[0]).toMatchObject({ value: "8.9", unit: "g%", unconverted: true })
  })

  it("shows it, and never ticks it", () => {
    const { canonical } = normalizeEhrImport({
      identifierType: "IZ", identifier: "42", fields: { labResults: unknownUnit },
    })
    const plan = buildEhrReviewPlan({ canonical, current: {} })

    expect(plan.items[0].state).toBe("unconverted")
    expect(plan.preselectedKeys).toEqual([])
  })

  it("refuses it even when a client ticks it deliberately", () => {
    // Where this differs from an undated result, which a clinician may take:
    // there the value is right and only its age is unknown. Here the number is
    // on the laboratory's scale and our field is on ours, so writing it stores
    // a wrong figure. Typing it in our unit is the act that cannot mislead.
    const { canonical } = normalizeEhrImport({
      identifierType: "IZ", identifier: "42", fields: { labResults: unknownUnit },
    })
    const plan = buildEhrReviewPlan({ canonical, current: {} })
    const result = applyEhrSelections({
      plan, selectedKeys: [plan.items[0].itemKey], current: {},
    })

    expect(result.patch).toEqual({})
    expect(result.refused).toEqual([{ itemKey: plan.items[0].itemKey, reason: "unconverted" }])
  })
})

describe("what the hospital called it survives the mapping", () => {
  it("keeps their code when several of theirs map onto one of ours", () => {
    // Once mapped, both rows read "Haemoglobin (Hb)". Without this there is no
    // way to tell the main-laboratory result from the blood-gas one.
    const values = labs([
      { test: "Haemoglobin (Hb)", reportedTest: "ХГБ", value: "120", unit: "g/L", takenAt: "2026-09-03T07:30:00Z" },
      { test: "Haemoglobin (Hb)", reportedTest: "tHb", value: "112", unit: "g/L", takenAt: "2026-09-03T07:30:00Z" },
    ])

    expect(values.map(lab => lab.reportedTest)).toEqual(["ХГБ", "tHb"])
    expect(values.map(lab => lab.test)).toEqual(["Haemoglobin (Hb)", "Haemoglobin (Hb)"])
  })

  it("says nothing when we call it what they call it", () => {
    const [lab] = labs([
      { test: "Haemoglobin (Hb)", reportedTest: "Haemoglobin (Hb)", value: "120", unit: "g/L", takenAt: null },
    ])

    expect(lab.reportedTest).toBeUndefined()
  })

  it("leaves an unmapped test alone, under the hospital's own name and unit", () => {
    // The deliberate third case: we could not place it, so it imports as they
    // sent it rather than being dropped. Not a unit failure.
    const [lab] = labs([{ test: "ХГБ", value: "89", unit: "g/L", takenAt: "2026-09-03T07:30:00Z" }])

    expect(lab).toMatchObject({ test: "ХГБ", value: "89", unit: "g/L" })
    expect(lab.unconverted).toBeUndefined()
  })
})

describe("a patient who has been in intensive care", () => {
  const sixHourly = (count: number) => Array.from({ length: count }, (_, i) => ({
    test: "Haemoglobin (Hb)", unit: "g/L", value: String(80 + (i % 40)),
    takenAt: new Date(Date.UTC(2026, 7, 20) + i * 6 * 3600_000).toISOString(),
  }))

  const planFor = (labResults: unknown[]) => {
    const { canonical } = normalizeEhrImport({
      identifierType: "IZ", identifier: "42", fields: { labResults },
    })
    return buildEhrReviewPlan({ canonical, current: {} })
  }

  it("offers the current result and three priors, not a fortnight of them", () => {
    // A real message carried three hundred. Every one became a staged row and a
    // row on screen, because "collapses behind a count" described the display
    // and nothing enforced it. The slope is what matters clinically, and a slope
    // needs a handful of points.
    const plan = planFor(sixHourly(300))

    expect(plan.items).toHaveLength(4)
    expect(plan.preselectedKeys).toHaveLength(1)
    expect(plan.supersededCountByTest).toEqual({ "haemoglobin (hb)": 3 })
  })

  it("says how many it dropped, rather than dropping them quietly", () => {
    // Discarding without saying is how a clinician comes to believe they have
    // seen everything the hospital sent.
    expect(planFor(sixHourly(300)).discardedOlderByTest).toEqual({ "haemoglobin (hb)": 296 })
  })

  it("keeps the newest, which is the one that describes the patient now", () => {
    const plan = planFor(sixHourly(300))
    const offered = plan.items.find(item => item.state === "preselected")

    expect((offered?.proposed as { takenAt: string }).takenAt)
      .toBe(new Date(Date.UTC(2026, 7, 20) + 299 * 6 * 3600_000).toISOString())
  })

  it("counts per test, so one busy analyte does not crowd out another", () => {
    const plan = planFor([
      ...sixHourly(10),
      { test: "Sodium (Na⁺)", unit: "mmol/L", value: "138", takenAt: "2026-09-03T07:00:00Z" },
    ])

    expect(plan.preselectedKeys).toHaveLength(2)
    expect(plan.discardedOlderByTest).toEqual({ "haemoglobin (hb)": 6 })
  })
})

describe("an intensive-care panel of tests we do not record", () => {
  const panel = Array.from({ length: 80 }, (_, i) => ({
    test: `Some assay ${i}`, value: "1.0", unit: "U/L", takenAt: "2026-09-03T07:30:00Z",
  }))

  const planFor = (labResults: unknown[]) => {
    const { canonical } = normalizeEhrImport({
      identifierType: "IZ", identifier: "42", fields: { labResults },
    })
    return buildEhrReviewPlan({ canonical, current: {} })
  }

  it("ticks none of them", () => {
    // They were all ticked before. The case holds nothing for them, so each read
    // as new information, and an ordinary "accept" took eighty rows of assays
    // with nothing to read them against.
    const plan = planFor(panel)

    expect(plan.preselectedKeys).toEqual([])
    expect(plan.items.every(item => item.state === "unsupported-test")).toBe(true)
  })

  it("still shows them, because the hospital did send them", () => {
    expect(visibleReviewItems(planFor(panel))).toHaveLength(80)
  })

  it("refuses them even when ticked", () => {
    const plan = planFor(panel.slice(0, 1))
    const result = applyEhrSelections({
      plan, selectedKeys: [plan.items[0].itemKey], current: {},
    })

    expect(result.patch).toEqual({})
    expect(result.refused).toEqual([{ itemKey: plan.items[0].itemKey, reason: "unsupported-test" }])
  })

  it("does not crowd out the results we do record", () => {
    const plan = planFor([
      ...panel,
      { test: "Haemoglobin (Hb)", unit: "g/L", value: "89", takenAt: "2026-09-03T07:30:00Z" },
    ])

    expect(plan.preselectedKeys).toHaveLength(1)
  })
})
