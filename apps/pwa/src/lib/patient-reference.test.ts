import { describe, expect, it, vi } from "vitest"
import { patientReferenceFromResponse, relinkCasePatientReference } from "./patient-reference"

function response(ok: boolean, status: number, body: unknown): Response {
  return { ok, status, json: async () => body } as Response
}

describe("patient reference API boundary", () => {
  it("reads only the server-safe masked reference", () => {
    expect(patientReferenceFromResponse({
      patientReference: { id: "link-1", maskedIdentifier: "HO•••01" },
      preop: { ageYears: 40 },
    })).toEqual({ id: "link-1", maskedIdentifier: "HO•••01", personMaskedIdentifier: null, display: null })
    expect(patientReferenceFromResponse({ patientReference: { id: "link-1" } })).toBeNull()
  })

  it("relinks through the dedicated root identity envelope and returns no raw value", async () => {
    const sentinel = "HOSP-RELINK-SENTINEL-9811"
    const fetcher = vi.fn(async () => response(true, 200, {
      id: "case-1",
      patientReference: { id: "link-1", maskedIdentifier: "HO•••11" },
    }))
    const result = await relinkCasePatientReference(
      "case-1", "link-0", sentinel, "admitted under the wrong number", fetcher,
    )
    // Its own endpoint, carrying the link the caller believed the case had, so
    // a correction made against a stale view is refused rather than applied.
    expect(fetcher).toHaveBeenCalledWith("/api/cases/case-1/patient-link/correct", {
      method: "POST",
      body: JSON.stringify({
        expectedPatientLinkId: "link-0",
        newPatientNumber: sentinel,
        correctionReason: "admitted under the wrong number",
      }),
    })
    expect(JSON.stringify(result)).not.toContain(sentinel)
    expect(result.maskedIdentifier).toBe("HO•••11")
  })

  it("never echoes the raw value in a failure", async () => {
    const sentinel = "HOSP-DO-NOT-ECHO-7722"
    const fetcher = vi.fn(async () => response(false, 409, { error: `Bad ${sentinel}` }))
    await expect(relinkCasePatientReference("case-1", "link-0", sentinel, "typo", fetcher))
      .rejects.not.toThrow(sentinel)
  })
})

describe("patient display (hospital 1.8.0)", () => {
  it("reads the number and a six-digit ЕГН prefix, and never anything longer", async () => {
    const { patientDisplayLine, readPatientDisplay } = await import("./patient-reference")
    expect(patientDisplayLine(readPatientDisplay({ admissionNumber: "1234/2026", egnPrefix: "800101" }), "bg")).toBe("ИЗ № 1234/2026 · ЕГН 800101")
    expect(patientDisplayLine(readPatientDisplay({ admissionNumber: "1234/2026", egnPrefix: null }), "en")).toBe("Record no. 1234/2026")
    expect(readPatientDisplay({ admissionNumber: null, egnPrefix: "8001010008" })).toBeNull()
    expect(readPatientDisplay(undefined)).toBeNull()
  })

  it("rides along with the reference of a response", async () => {
    const { patientReferenceFromResponse } = await import("./patient-reference")
    const reference = patientReferenceFromResponse({
      patientReference: { id: "p1", maskedIdentifier: "12**" },
      patientDisplay: { admissionNumber: "12/2026", egnPrefix: null },
    })
    expect(reference?.display).toEqual({ admissionNumber: "12/2026", egnPrefix: null })
  })
})
