import { describe, expect, it } from "vitest"
import { preopFormSchema } from "./preop-form-schema"

// LabResult.source already exists in the database with a comment promising
// "manual" | "ai-scan" | "import", and the API already reads it. But every
// tag-shaped item schema here was closed with no `source` field, so Zod
// stripped it out of diagnoses, procedures, comorbidities, medications,
// allergies and labs before the request was even built -- every item was
// silently stored with whatever the API defaults to, including labs read
// off a photograph by AI. This test proves item-level `source` (and
// `takenAt` for labs) now survives parsing instead of being dropped.
describe("per-item clinical provenance survives the mobile preop form schema", () => {
  it("keeps source and takenAt on a lab result", () => {
    const parsed = preopFormSchema.shape.labResults.parse([
      { test: "Hemoglobin", value: "13.2", unit: "g/dL", source: "ai-scan", takenAt: "2026-08-01T09:00:00.000Z" },
    ])

    expect(parsed[0]?.source).toBe("ai-scan")
    expect(parsed[0]?.takenAt).toBe("2026-08-01T09:00:00.000Z")
  })

  it("keeps source on a diagnosis tag", () => {
    const parsed = preopFormSchema.shape.diagnoses.parse([{ label: "Hypertension", source: "manual" }])
    expect(parsed[0]?.source).toBe("manual")
  })

  it("keeps source on a procedure tag", () => {
    const parsed = preopFormSchema.shape.procedures.parse([{ label: "Appendectomy", source: "manual" }])
    expect(parsed[0]?.source).toBe("manual")
  })

  it("keeps source on a comorbidity tag", () => {
    const parsed = preopFormSchema.shape.comorbidities.parse([{ label: "Diabetes", source: "import" }])
    expect(parsed[0]?.source).toBe("import")
  })

  it("keeps source on a current-medication tag", () => {
    const parsed = preopFormSchema.shape.currentMedications.parse([{ label: "Metformin", source: "manual" }])
    expect(parsed[0]?.source).toBe("manual")
  })

  it("keeps source on an allergy-detail tag", () => {
    const parsed = preopFormSchema.shape.allergyDetails.parse([{ label: "Penicillin", source: "manual" }])
    expect(parsed[0]?.source).toBe("manual")
  })
})
