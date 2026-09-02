import { describe, it, expect } from "vitest"
import { schema as preopSchema } from "./preopSchema"

// LabResult.source already exists in the database with a comment promising
// "manual" | "ai-scan" | "import", and the API already reads it. But this
// form schema was closed (no .passthrough(), no explicit field), so Zod
// stripped `source` out of every lab and drug-tag item before the request
// was even built — every lab was silently stored as "manual", including ones
// read off a photograph by AI. This test proves the item-level `source` (and
// `takenAt` for labs) now survives parsing instead of being dropped.
describe("per-item clinical provenance survives the preop form schema", () => {
  it("keeps source and takenAt on a lab result", () => {
    const parsed = preopSchema.partial().parse({
      labResults: [
        { test: "Hemoglobin", value: "13.2", unit: "g/dL", source: "ai-scan", takenAt: "2026-08-01T09:00:00.000Z" },
      ],
    })

    expect(parsed.labResults?.[0]?.source).toBe("ai-scan")
    expect(parsed.labResults?.[0]?.takenAt).toBe("2026-08-01T09:00:00.000Z")
  })

  it("keeps source on a current-medication tag (drugTagSchema)", () => {
    const parsed = preopSchema.partial().parse({
      currentMedications: [{ label: "Metformin", inn: "metformin", source: "manual" }],
    })

    expect(parsed.currentMedications?.[0]?.source).toBe("manual")
  })

  it("keeps source on an allergy-detail tag (drugTagSchema)", () => {
    const parsed = preopSchema.partial().parse({
      allergyDetails: [{ label: "Penicillin", source: "import" }],
    })

    expect(parsed.allergyDetails?.[0]?.source).toBe("import")
  })

  it("keeps source on a diagnosis tag (tagSchema, already open via .passthrough())", () => {
    const parsed = preopSchema.partial().parse({
      diagnoses: [{ label: "Hypertension", source: "manual" }],
    })

    expect(parsed.diagnoses?.[0]?.source).toBe("manual")
  })
})
