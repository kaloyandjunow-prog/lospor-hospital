import { describe, expect, it } from "vitest"

import { normalizeEhrImport } from "./ehr-import"
import { buildEhrReviewPlan, ehrItemKey, type EhrReviewInput } from "./ehr-import-review"
import { applyEhrSelections } from "./ehr-import-apply"

function accept(
  fields: Record<string, unknown>,
  selectedKeys: string[] | "preselected",
  rest: Partial<Omit<EhrReviewInput, "canonical">> & { allowModeChange?: boolean } = {},
) {
  const { canonical } = normalizeEhrImport({ identifierType: "IZ", identifier: "42", fields })
  const current = rest.current ?? {}
  const plan = buildEhrReviewPlan({ canonical, current, ...rest })
  return applyEhrSelections({
    plan,
    selectedKeys: selectedKeys === "preselected" ? plan.preselectedKeys : selectedKeys,
    current,
    currentClinicalMode: rest.currentClinicalMode,
    allowModeChange: rest.allowModeChange,
  })
}

describe("the patch is an ordinary case edit", () => {
  it("writes canonical field names and nothing else", () => {
    // What comes out has to be indistinguishable from the clinician typing it,
    // because that is the route it travels and the audit it lands in.
    const result = accept({ weightKg: 80, heightCm: 175 }, "preselected")

    expect(result.patch).toEqual({ weightKg: 80, heightCm: 175 })
    expect(result.refused).toEqual([])
  })

  it("writes nothing when nothing is ticked", () => {
    expect(accept({ weightKg: 80 }, []).patch).toEqual({})
  })

  it("cannot carry clinical mode, whatever a client sends", () => {
    // Absent from the importable list, so it cannot reach a plan, so it cannot
    // reach a patch. Belt and braces on the failure this design exists around.
    const result = accept({ clinicalMode: "PEDIATRIC", weightKg: 80 }, "preselected")

    expect(result.patch).not.toHaveProperty("clinicalMode")
    expect(Object.keys(result.patch)).toEqual(["weightKg"])
  })
})

describe("the selection arriving from a client is not trusted", () => {
  it("refuses a key the plan never offered", () => {
    const result = accept({ weightKg: 80 }, ["clinicalMode", "aiOptIn"])

    expect(result.patch).toEqual({})
    expect(result.refused).toEqual([
      { itemKey: "clinicalMode", reason: "unknown" },
      { itemKey: "aiOptIn", reason: "unknown" },
    ])
  })

  it("refuses a previously rejected item even when ticked", () => {
    // A refusal is not undone by a client asking again.
    const key = ehrItemKey("diagnoses", { code: "K35" })
    const result = accept(
      { diagnoses: [{ label: "Acute appendicitis", code: "K35" }] },
      [key],
      { declinedKeys: [key] },
    )

    expect(result.patch).toEqual({})
    expect(result.refused).toEqual([{ itemKey: key, reason: "declined" }])
  })

  it("switches an adult case to paediatric mode for a paediatric age (9.13.9)", () => {
    // Held back until 9.13.9, and unaddable in practice: the plan is built from
    // the saved mode, so a switch made in the form never released it.
    const result = accept({ ageYears: 7 }, ["ageYears"], { currentClinicalMode: "ADULT" })

    expect(result.modeChange).toBe("PEDIATRIC")
    expect(result.patch).toEqual({ ageValue: 7, ageUnit: "YEARS", ageYears: 7 })
    expect(result.patch).not.toHaveProperty("clinicalMode")
    expect(result.refused).toEqual([])
  })

  it("accepts the same age without a switch once the case is in paediatric mode", () => {
    const result = accept({ ageYears: 7 }, ["ageYears"], { currentClinicalMode: "PEDIATRIC" })
    expect(result.modeChange).toBeNull()
    expect(result.patch).toMatchObject({ ageValue: 7, ageUnit: "YEARS" })
  })

  it("applies the good keys alongside the refused ones", () => {
    const result = accept({ weightKg: 80 }, ["weightKg", "nonsense"])

    expect(result.patch).toEqual({ weightKg: 80 })
    expect(result.appliedKeys).toEqual(["weightKg"])
    expect(result.refused).toHaveLength(1)
  })
})

describe("an accepted age lands where the mode will read it", () => {
  // The server's preciseAge reads ONLY ageValue/ageUnit and ignores ageYears.
  // An age written to the wrong half saves without complaint and leaves the
  // field empty — accepted, stored, and not there. That silent partial write
  // is the worst outcome available, because the clinician has already ticked
  // it and moved on.

  it("writes the paediatric pair, not just ageYears", () => {
    const patch = accept({ ageYears: 7 }, ["ageYears"], { currentClinicalMode: "PEDIATRIC" }).patch

    expect(patch.ageValue).toBe(7)
    expect(patch.ageUnit).toBe("YEARS")
  })

  it("keeps ageYears as completed years, as the age control itself does", () => {
    const patch = accept(
      { ageValue: 18, ageUnit: "MONTHS" },
      ["ageValue", "ageUnit"],
      { currentClinicalMode: "PEDIATRIC" },
    ).patch

    expect(patch).toMatchObject({ ageValue: 18, ageUnit: "MONTHS", ageYears: 1 })
  })

  it("writes ageYears in adult mode and clears the paediatric pair", () => {
    const patch = accept(
      { ageValue: 40, ageUnit: "YEARS" },
      ["ageValue", "ageUnit"],
      { currentClinicalMode: "ADULT" },
    ).patch

    expect(patch).toEqual({ ageYears: 40, ageValue: null, ageUnit: null })
  })

  it("clears with null rather than undefined, which a patch would drop", () => {
    // undefined is dropped on the way out, the server keeps the stale value,
    // and every retry is refused — the pediatric-to-adult trap exactly.
    const patch = accept({ ageYears: 40 }, ["ageYears"], { currentClinicalMode: "ADULT" }).patch

    expect(Object.keys(patch).sort()).toEqual(["ageUnit", "ageValue", "ageYears"])
    expect(patch.ageValue).toBeNull()
  })

  it("takes the unit from the case when the message sends only a value", () => {
    const patch = accept(
      { ageValue: 3 },
      ["ageValue"],
      { current: { ageUnit: "MONTHS" }, currentClinicalMode: "PEDIATRIC" },
    ).patch

    expect(patch).toMatchObject({ ageValue: 3, ageUnit: "MONTHS", ageYears: 0 })
  })

  it("leaves age alone entirely when none was accepted", () => {
    const patch = accept(
      { weightKg: 80, ageYears: 40 },
      ["weightKg"],
      { currentClinicalMode: "ADULT" },
    ).patch

    expect(patch).toEqual({ weightKg: 80 })
  })
})

describe("an accepted age carries its clinical mode", () => {
  it("switches a paediatric case to adult mode for an adult age", () => {
    const result = accept(
      { ageYears: 40 },
      ["ageYears"],
      { current: { ageValue: 7, ageUnit: "MONTHS", ageYears: 0 }, currentClinicalMode: "PEDIATRIC" },
    )

    expect(result.modeChange).toBe("ADULT")
    expect(result.patch).toEqual({ ageYears: 40, ageValue: null, ageUnit: null })
  })

  it("reads an accepted ageYears as years, never against the case's own value", () => {
    // The case still says "7 months"; the hospital says 40 years. Borrowing the
    // case's ageValue would have read the import as an infant.
    const result = accept(
      { ageYears: 40 },
      ["ageYears"],
      { current: { ageValue: 7, ageUnit: "MONTHS" }, currentClinicalMode: "PEDIATRIC" },
    )
    expect(result.patch.ageYears).toBe(40)
  })

  it("reads value and unit together, because 3 is an adult in years and an infant in months", () => {
    const months = accept({ ageValue: 3, ageUnit: "MONTHS" }, "preselected", { currentClinicalMode: "ADULT" })
    expect(months.modeChange).toBe("PEDIATRIC")
    expect(months.patch).toMatchObject({ ageValue: 3, ageUnit: "MONTHS", ageYears: 0 })

    const years = accept({ ageValue: 30, ageUnit: "YEARS" }, "preselected", { currentClinicalMode: "ADULT" })
    expect(years.modeChange).toBeNull()
    expect(years.patch).toEqual({ ageYears: 30, ageValue: null, ageUnit: null })
  })

  it("treats a case with no mode yet as adult", () => {
    expect(accept({ ageYears: 7 }, ["ageYears"]).modeChange).toBe("PEDIATRIC")
    expect(accept({ ageYears: 40 }, ["ageYears"]).modeChange).toBeNull()
  })

  it("does not switch when no age was accepted", () => {
    const result = accept({ ageYears: 7, weightKg: 22 }, ["weightKg"], { currentClinicalMode: "ADULT" })
    expect(result.modeChange).toBeNull()
    expect(result.patch).toEqual({ weightKg: 22 })
  })

  it("refuses the age, and only the age, where the mode cannot change", () => {
    // A deployment without paediatric mode. The rest of the import still lands.
    const result = accept(
      { ageValue: 7, ageUnit: "YEARS", weightKg: 22 },
      "preselected",
      { currentClinicalMode: "ADULT", allowModeChange: false },
    )

    expect(result.modeChange).toBeNull()
    expect(result.patch).toEqual({ weightKg: 22 })
    expect(result.appliedKeys).toEqual(["weightKg"])
    expect(result.refused.map(r => r.reason)).toEqual(["needs-mode-decision", "needs-mode-decision"])
  })

  it("still accepts an age that needs no switch where the mode cannot change", () => {
    const result = accept({ ageYears: 40 }, ["ageYears"], { currentClinicalMode: "ADULT", allowModeChange: false })
    expect(result.patch).toEqual({ ageYears: 40, ageValue: null, ageUnit: null })
  })
})

describe("a deliberate reach past the default is allowed", () => {
  it("takes a conflicting value when the clinician chooses it", () => {
    // They have seen their own value beside the proposal.
    const result = accept({ weightKg: 80 }, ["weightKg"], { current: { weightKg: 75 } })

    expect(result.patch).toEqual({ weightKg: 80 })
  })

  it("takes an older lab when the clinician opens the collapse", () => {
    const older = "labResults|haemoglobin (hb)|2026-08-29T08:00:00.000Z|120"
    const result = accept({
      labResults: [
        { test: "Haemoglobin (Hb)", unit: "g/L", value: "120", takenAt: "2026-08-29T08:00:00Z" },
        { test: "Haemoglobin (Hb)", unit: "g/L", value: "89", takenAt: "2026-09-01T08:00:00Z" },
      ],
    }, [older])

    expect((result.patch.labResults as unknown[])).toHaveLength(1)
    expect((result.patch.labResults as { value: string }[])[0].value).toBe("120")
  })
})

describe("accepting into a list never drops what the clinician typed", () => {
  it("keeps their diagnoses and appends the imported one", () => {
    const typed = { label: "Hypertension", code: "I10", source: "manual" }
    const result = accept(
      { diagnoses: [{ label: "Acute appendicitis", code: "K35" }] },
      "preselected",
      { current: { diagnoses: [typed] } },
    )

    const diagnoses = result.patch.diagnoses as { label: string; source: string }[]
    expect(diagnoses).toHaveLength(2)
    expect(diagnoses[0]).toEqual(typed)
    expect(diagnoses[1]).toMatchObject({ code: "K35", source: "import" })
  })

  it("leaves their own provenance untouched", () => {
    // Their entry stays theirs. Only the appended item is marked imported.
    const result = accept(
      { comorbidities: [{ label: "Asthma" }] },
      "preselected",
      { current: { comorbidities: [{ label: "Diabetes", source: "ai-scan" }] } },
    )

    const list = result.patch.comorbidities as { source: string }[]
    expect(list.map(c => c.source)).toEqual(["ai-scan", "import"])
  })

  it("does not touch a list nothing was accepted from", () => {
    const result = accept(
      { weightKg: 80, diagnoses: [{ code: "K35", label: "Acute appendicitis" }] },
      ["weightKg"],
      { current: { diagnoses: [{ code: "I10", label: "Hypertension" }] } },
    )

    expect(result.patch).toEqual({ weightKg: 80 })
    expect(result.patch).not.toHaveProperty("diagnoses")
  })

  it("appends two accepted items to one list in a single patch", () => {
    const result = accept({
      diagnoses: [
        { code: "K35", label: "Acute appendicitis" },
        { code: "I10", label: "Hypertension" },
      ],
    }, "preselected")

    expect(result.patch.diagnoses as unknown[]).toHaveLength(2)
  })

  it("ignores a duplicated key rather than appending twice", () => {
    const key = ehrItemKey("diagnoses", { code: "K35" })
    const result = accept(
      { diagnoses: [{ code: "K35", label: "Acute appendicitis" }] },
      [key, key],
    )

    expect(result.patch.diagnoses as unknown[]).toHaveLength(1)
  })
})
