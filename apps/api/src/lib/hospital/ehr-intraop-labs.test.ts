import { describe, expect, it } from "vitest"
import type { EhrReviewPlan } from "@lospor/core/ehr-import-review"
import { intraopLabsPlan } from "./ehr-intraop-labs"

const lab = (test: string, takenAt: string | null, state = "preselected") => ({
  field: "labResults",
  itemKey: `labResults|${test.toLowerCase()}|${takenAt ?? "undated"}`,
  state,
  proposed: { test, value: "1", unit: "u", takenAt, source: "import" },
})

const plan = {
  items: [
    { field: "weightKg", itemKey: "weightKg", state: "preselected", proposed: 80 },
    lab("Haemoglobin", "2026-09-27T06:00:00.000Z", "superseded"),
    lab("Haemoglobin", "2026-09-27T10:30:00.000Z"),
    lab("Potassium", "2026-09-27T07:00:00.000Z"),
    lab("Lactate", null, "undated"),
  ],
  preselectedKeys: [
    "weightKg",
    "labResults|haemoglobin|2026-09-27T10:30:00.000Z",
    "labResults|potassium|2026-09-27T07:00:00.000Z",
  ],
  supersededCountByTest: { haemoglobin: 1, potassium: 0 },
  discardedOlderByTest: { potassium: 2 },
} as unknown as EhrReviewPlan

describe("intraopLabsPlan", () => {
  const started = new Date("2026-09-27T09:00:00.000Z")

  it("keeps only lab results drawn at or after the case start", () => {
    const narrowed = intraopLabsPlan(plan, started)
    expect(narrowed.items.map(item => item.itemKey)).toEqual(["labResults|haemoglobin|2026-09-27T10:30:00.000Z"])
    expect(narrowed.preselectedKeys).toEqual(["labResults|haemoglobin|2026-09-27T10:30:00.000Z"])
  })

  it("leaves out other fields, undated results and the counts of tests no longer shown", () => {
    const narrowed = intraopLabsPlan(plan, started)
    expect(narrowed.items.some(item => item.field !== "labResults")).toBe(false)
    expect(narrowed.items.some(item => (item.proposed as { takenAt: string | null }).takenAt === null)).toBe(false)
    expect(narrowed.supersededCountByTest).toEqual({ haemoglobin: 1 })
    expect(narrowed.discardedOlderByTest).toEqual({})
  })

  it("counts a result drawn exactly at the start as during the case", () => {
    const narrowed = intraopLabsPlan(plan, new Date("2026-09-27T07:00:00.000Z"))
    expect(narrowed.items.map(item => item.itemKey)).toContain("labResults|potassium|2026-09-27T07:00:00.000Z")
  })
})
