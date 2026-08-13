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
    })).toEqual({ id: "link-1", maskedIdentifier: "HO•••01" })
    expect(patientReferenceFromResponse({ patientReference: { id: "link-1" } })).toBeNull()
  })

  it("relinks through the dedicated root identity envelope and returns no raw value", async () => {
    const sentinel = "HOSP-RELINK-SENTINEL-9811"
    const fetcher = vi.fn(async () => response(true, 200, {
      id: "case-1",
      patientReference: { id: "link-1", maskedIdentifier: "HO•••11" },
    }))
    const result = await relinkCasePatientReference("case-1", sentinel, fetcher)
    expect(fetcher).toHaveBeenCalledWith("/api/cases/case-1", {
      method: "PATCH",
      body: JSON.stringify({ patientNumber: sentinel }),
    })
    expect(JSON.stringify(result)).not.toContain(sentinel)
    expect(result.maskedIdentifier).toBe("HO•••11")
  })

  it("never echoes the raw value in a failure", async () => {
    const sentinel = "HOSP-DO-NOT-ECHO-7722"
    const fetcher = vi.fn(async () => response(false, 409, { error: `Bad ${sentinel}` }))
    await expect(relinkCasePatientReference("case-1", sentinel, fetcher))
      .rejects.not.toThrow(sentinel)
  })
})
