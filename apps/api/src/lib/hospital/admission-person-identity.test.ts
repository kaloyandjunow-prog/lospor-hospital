import { describe, expect, it, vi } from "vitest"

// export-batch reaches Prisma, which is marked server-only; nothing under test
// touches it.
vi.mock("server-only", () => ({}))

import { reserveCase } from "@/lib/hospital/export-batch"
import { patientExportPseudonym } from "@/lib/hospital/patient-identity"

// ИЗ № identifies an admission, not a patient: it is reissued every time
// someone is admitted and restarts every January. Keying a person on it means
// the same patient is a new person each time they come back, so no repeat
// surgery, readmission or longitudinal outcome is visible even inside one
// hospital. ЕГН is issued once for life and is what joins the admissions.
//
// Both are kept. The record number is what a clinician types and what tells one
// admission from the next; the national identifier is what makes them the same
// person. These pin which one the export keys a person on.

process.env.HOSPITAL_EXPORT_PSEUDONYM_KEY ??= Buffer.alloc(32, 7).toString("base64")

function exportable(patientLink: Record<string, unknown>) {
  return {
    id: "case-1",
    institutionId: "inst-1",
    finalizedAt: new Date("2026-08-18T08:00:00Z"),
    patientLink,
    centralExportControl: null,
  } as unknown as Parameters<typeof reserveCase>[0]
}

describe("who a case is exported as", () => {
  it("keys the person on the national identifier when the site knows one", () => {
    const reserved = reserveCase(exportable({
      identifierHash: "admission-2026",
      institutionId: "inst-1",
      personLink: { identifierHash: "person-abc", institutionId: "inst-1" },
    }), "UPSERT")

    expect(reserved?.personPseudonym)
      .toBe(patientExportPseudonym("inst-1", "person-abc"))
  })

  it("makes two admissions of one patient the same person", () => {
    // The whole point: different record numbers, different years, one person.
    const first = reserveCase(exportable({
      identifierHash: "admission-2025",
      institutionId: "inst-1",
      personLink: { identifierHash: "person-abc", institutionId: "inst-1" },
    }), "UPSERT")
    const second = reserveCase(exportable({
      identifierHash: "admission-2026",
      institutionId: "inst-1",
      personLink: { identifierHash: "person-abc", institutionId: "inst-1" },
    }), "UPSERT")

    expect(first?.personPseudonym).toBe(second?.personPseudonym)
  })

  it("falls back to the admission when no national identifier is recorded", () => {
    // The normal state for a site that has not enabled them. Behaviour is
    // exactly what it was before the person link existed.
    const reserved = reserveCase(exportable({
      identifierHash: "admission-2026",
      institutionId: "inst-1",
      personLink: null,
    }), "UPSERT")

    expect(reserved?.personPseudonym)
      .toBe(patientExportPseudonym("inst-1", "admission-2026"))
  })

  it("keeps two admissions apart when there is nothing to join them", () => {
    // Not a defect to fix by guessing: without a national identifier there is
    // genuinely no evidence these are one patient.
    const first = reserveCase(exportable({
      identifierHash: "admission-2025", institutionId: "inst-1", personLink: null,
    }), "UPSERT")
    const second = reserveCase(exportable({
      identifierHash: "admission-2026", institutionId: "inst-1", personLink: null,
    }), "UPSERT")

    expect(first?.personPseudonym).not.toBe(second?.personPseudonym)
  })
})
