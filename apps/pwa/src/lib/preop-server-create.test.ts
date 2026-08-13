import { describe, expect, it } from "vitest"
import { postPreopServerCase } from "./preop-server-create"

const owner = { userId: "clinician-1", institutionId: "hospital-1" }

function response(ok: boolean, status: number, body: unknown) {
  return {
    ok,
    status,
    json: async () => body,
  } as Response
}

describe("postPreopServerCase", () => {
  it("rejects creation without a local hospital patient number", async () => {
    let called = false
    const fetcher = (async () => {
      called = true
      return response(true, 201, { id: "case-1" })
    }) as never

    await expect(postPreopServerCase({
      ageYears: 40,
      sex: "MALE",
      heightCm: 170,
      weightKg: 70,
      asaScore: "I",
    }, "draft-1", fetcher, owner)).resolves.toEqual({
      ok: false,
      message: "Hospital patient number is required",
    })
    expect(called).toBe(false)
  })
  it("posts canonical preop payload with the draft idempotency key", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = []
    const fetcher = (async (url: string, init: RequestInit) => {
      calls.push({ url, init })
      return response(true, 200, { id: "case-1", preopUpdatedAt: "2026-07-02T10:00:00Z" })
    }) as never

    const result = await postPreopServerCase({
      patientNumber: "HOSP-001",
      ageYears: 40,
      sex: "FEMALE",
      heightCm: 170,
      weightKg: 70,
      asaScore: "II",
      diagnoses: [{ label: "Appendicitis" }],
      procedures: [{ label: "Appendectomy" }],
    }, "draft-1", fetcher, owner)

    expect(result).toMatchObject({
      ok: true,
      id: "case-1",
      updatedAt: "2026-07-02T10:00:00Z",
      revision: null,
      acceptedPayload: { plannedProcedure: "Appendectomy" },
    })
    expect(calls[0].url).toBe("/api/cases")
    expect(calls[0].init.headers).toEqual({
      "X-Idempotency-Key": "draft-1",
      "X-LOSPOR-Expected-Institution": "hospital-1",
    })
    const requestBody = JSON.parse(calls[0].init.body as string)
    expect(requestBody.patientNumber).toBe("HOSP-001")
    expect(requestBody.preop.patientNumber).toBeUndefined()
    expect(requestBody.preop.plannedProcedure).toBe("Appendectomy")
  })

  it("returns the server error message when creation fails", async () => {
    const fetcher = (async () => response(false, 500, { error: "Internal server error" })) as never

    await expect(postPreopServerCase({
      patientNumber: "HOSP-001",
      ageYears: 40,
      sex: "MALE",
      heightCm: 170,
      weightKg: 70,
      asaScore: "I",
    }, "draft-1", fetcher, owner)).resolves.toMatchObject({
      ok: false,
      status: 500,
      message: "Internal server error",
    })
  })

  it("returns a network error message when fetch throws", async () => {
    const fetcher = (async () => {
      throw new Error("offline")
    }) as never

    await expect(postPreopServerCase({
      patientNumber: "HOSP-001",
      ageYears: 40,
      sex: "MALE",
      heightCm: 170,
      weightKg: 70,
      asaScore: "I",
    }, "draft-1", fetcher, owner)).resolves.toMatchObject({
      ok: false,
      message: "Network error: offline",
    })
  })

  it("creates the safe draft then reports a blocked PII field for quarantine", async () => {
    const calls: Record<string, unknown>[] = []
    const fetcher = (async (_url: string, init: RequestInit) => {
      const preop = JSON.parse(init.body as string).preop as Record<string, unknown>
      calls.push(preop)
      if ("teamNotes" in preop) {
        return response(false, 400, {
          error: "Team notes may contain a name.",
          code: "PII_BLOCKED",
          field: "teamNotes",
          reason: "likely_name",
          retryable: false,
          blockedKeys: ["teamNotes"],
        })
      }
      return response(true, 201, { id: "case-1", preopRevision: 1 })
    }) as never

    const result = await postPreopServerCase({
      patientNumber: "HOSP-001",
      ageYears: 40,
      sex: "MALE",
      heightCm: 170,
      weightKg: 70,
      asaScore: "I",
      teamNotes: "Ivan Petrov",
    }, "draft-1", fetcher, owner)

    expect(calls).toHaveLength(2)
    expect(calls[0]).toHaveProperty("teamNotes", "Ivan Petrov")
    expect(calls[1]).not.toHaveProperty("teamNotes")
    expect(result).toMatchObject({
      ok: true,
      id: "case-1",
      blocked: { field: "teamNotes", reason: "likely_name" },
    })
  })
})
