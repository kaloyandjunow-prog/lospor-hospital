import { describe, expect, it, vi } from "vitest"
import {
  createServerCaseFromLocalDraft,
  flushNewLocalCaseDraft,
  persistServerCreateResult,
} from "./use-queued-save-flusher"
import type { LocalCaseDraft, LocalDraftOwner } from "./local-case-store"
import type { ApiRequestInit } from "./api"
import { draftRefusalFrom, draftRefusalText } from "./draft-refusal"

const owner: LocalDraftOwner = { userId: "clinician-a", institutionId: "hospital-1" }
const otherOwner: LocalDraftOwner = { userId: "clinician-b", institutionId: "hospital-1" }
const transferredOwner: LocalDraftOwner = { userId: "clinician-a", institutionId: "hospital-2" }
const draft: LocalCaseDraft = {
  localId: "offline-draft",
  owner,
  createdAt: "2026-08-13T10:00:00.000Z",
  hasProtectedPatientReference: true,
  formValues: { clinicalMode: "ADULT", ageYears: 47, sex: "FEMALE" },
}

function response(ok: boolean, status: number, body: Record<string, unknown>): Response {
  return { ok, status, json: async () => body } as Response
}

describe("offline new-case reconciliation", () => {
  it("carries the protected patient number only in the Hospital create envelope", async () => {
    const fetcher = vi.fn(async (_path: string, _init?: RequestInit) => response(true, 201, {
      id: "server-case",
      preopRevision: 1,
      patientReference: { id: "patient-link", maskedIdentifier: "HO•••01" },
    }))
    const referenceLoader = vi.fn(async () => "HOSP-OFFLINE-001")

    await expect(createServerCaseFromLocalDraft(
      draft,
      owner,
      fetcher,
      referenceLoader,
    )).resolves.toMatchObject({ ok: true, id: "server-case" })

    expect(referenceLoader).toHaveBeenCalledWith("offline-draft", owner)
    const [path, init] = fetcher.mock.calls[0]!
    expect(path).toBe("/api/cases")
    const body = JSON.parse(String(init?.body))
    expect(body.patientNumber).toBe("HOSP-OFFLINE-001")
    expect(body.preop.patientNumber).toBeUndefined()
    expect(init?.headers).toEqual({
      "X-Idempotency-Key": "offline-draft",
      "X-LOSPOR-Expected-Institution": "hospital-1",
    })
    expect((init as ApiRequestInit | undefined)?.expectedIdentity).toEqual(owner)
  })

  it("does not decrypt or flush an expired-session draft for another user", async () => {
    const fetcher = vi.fn(async (_path: string, _init?: RequestInit) => response(true, 201, { id: "wrong" }))
    const referenceLoader = vi.fn(async () => "HOSP-SECRET")

    await expect(createServerCaseFromLocalDraft(
      draft,
      otherOwner,
      fetcher,
      referenceLoader,
    )).resolves.toBeNull()
    expect(referenceLoader).not.toHaveBeenCalled()
    expect(fetcher).not.toHaveBeenCalled()
    await expect(createServerCaseFromLocalDraft(
      draft,
      transferredOwner,
      fetcher,
      referenceLoader,
    )).resolves.toBeNull()
    expect(referenceLoader).not.toHaveBeenCalled()
    await expect(flushNewLocalCaseDraft(draft, otherOwner, {
      fetcher,
      referenceLoader,
    })).resolves.toBe("pending")
    expect(fetcher).not.toHaveBeenCalled()
  })

  it("deletes the owned local copy after complete server acceptance", async () => {
    const removeDraft = vi.fn(async () => {})
    await expect(flushNewLocalCaseDraft(draft, owner, {
      fetcher: async () => response(true, 201, { id: "server-case", preopRevision: 1 }),
      referenceLoader: async () => "HOSP-OFFLINE-001",
      removeDraft,
    })).resolves.toBe("accepted")
    expect(removeDraft).toHaveBeenCalledWith("offline-draft", owner)
  })

  it("retains clinical values but not the raw reference when a PII field needs review", async () => {
    const blockedDraft: LocalCaseDraft = {
      ...draft,
      formValues: { ...draft.formValues, teamNotes: "Synthetic Person" },
    }
    const removeDraft = vi.fn(async () => {})
    const storeDraft = vi.fn(async (_input: unknown) => true)
    let attempt = 0

    await expect(flushNewLocalCaseDraft(blockedDraft, owner, {
      fetcher: async () => {
        attempt += 1
        return attempt === 1
          ? response(false, 400, {
              error: "Team notes may contain a name.", code: "PII_BLOCKED",
              field: "teamNotes", reason: "likely_name", retryable: false,
              blockedKeys: ["teamNotes"],
            })
          : response(true, 201, { id: "server-case", preopRevision: 1 })
      },
      referenceLoader: async () => "HOSP-OFFLINE-001",
      removeDraft,
      storeDraft,
    })).resolves.toBe("needs-review")

    expect(removeDraft).not.toHaveBeenCalled()
    expect(storeDraft).toHaveBeenCalledWith({
      localId: "offline-draft",
      owner,
      formValues: blockedDraft.formValues,
      serverCaseId: "server-case",
      syncReview: { blocked: { field: "teamNotes", reason: "likely_name" } },
    })
    expect(JSON.stringify(storeDraft.mock.calls[0]![0])).not.toContain("HOSP-OFFLINE-001")
  })

  it("retains a server-linked recovery draft when a field is rejected", async () => {
    const storeDraft = vi.fn(async (_input: unknown) => true)
    await expect(persistServerCreateResult(draft, owner, {
      ok: true,
      id: "server-case",
      revision: 1,
      updatedAt: null,
      acceptedPayload: { ageYears: 47 },
      patientReference: { id: "link", maskedIdentifier: "HO•••01" },
      rejectedFields: [{ path: "preop.heightCm", message: "Out of range" }],
    }, { storeDraft })).resolves.toBe("needs-review")
    expect(storeDraft).toHaveBeenCalledWith({
      localId: "offline-draft",
      owner,
      formValues: draft.formValues,
      serverCaseId: "server-case",
      syncReview: { rejectedFields: ["preop.heightCm"] },
    })
  })

  it("does not claim review recovery is durable when local storage fails", async () => {
    await expect(persistServerCreateResult(draft, owner, {
      ok: true,
      id: "server-case",
      revision: 1,
      updatedAt: null,
      acceptedPayload: { ageYears: 47 },
      patientReference: null,
      rejectedFields: [{ path: "preop.heightCm", message: "Out of range" }],
    }, { storeDraft: async () => false })).rejects.toThrow("local recovery copy")
  })
})

describe("a new case the server refuses (1.9.2)", () => {
  it("is kept with its reason instead of being retried forever", async () => {
    const storeDraft = vi.fn(async (_input: unknown) => true)
    await expect(flushNewLocalCaseDraft(draft, owner, {
      fetcher: async () => response(false, 409, { error: "PEDIATRIC_MODE_REQUIRED", code: "PEDIATRIC_MODE_REQUIRED" }),
      referenceLoader: async () => "HOSP-OFFLINE-001",
      storeDraft,
    })).resolves.toBe("needs-review")
    expect(storeDraft).toHaveBeenCalledWith(expect.objectContaining({
      localId: "offline-draft",
      rejected: expect.objectContaining({ status: 409, code: "PEDIATRIC_MODE_REQUIRED" }),
    }))
    // The raw number never rides along into the stored draft.
    expect(JSON.stringify(storeDraft.mock.calls)).not.toContain("HOSP-OFFLINE-001")
  })

  it("stays pending after a sign-in, update, timeout or rate-limit answer, or a server fault", async () => {
    for (const status of [401, 408, 426, 429, 500, 503]) {
      const storeDraft = vi.fn(async (_input: unknown) => true)
      await expect(flushNewLocalCaseDraft(draft, owner, {
        fetcher: async () => response(false, status, { error: "x" }),
        referenceLoader: async () => "HOSP-OFFLINE-001",
        storeDraft,
      })).resolves.toBe("pending")
      expect(storeDraft).not.toHaveBeenCalled()
    }
  })

  it("names the reason in the clinician's language", () => {
    expect(draftRefusalText({ status: 409, code: "PEDIATRIC_MODE_REQUIRED" }, "bg")).toContain("режим за възрастни")
    expect(draftRefusalText({ status: 400, code: "PREOP_ANSWER_REFUSED" }, "en")).toContain("profile has changed")
    expect(draftRefusalText({ status: 403, code: null }, "bg")).toContain("няма право")
    expect(draftRefusalText({ status: 400, code: "SOMETHING_NEW" }, "bg")).toBe("Сървърът не прие черновата. Отворете я, за да я проверите.")
    // Paediatric mode switched off is a 503 that no retry will change.
    expect(draftRefusalFrom(503, { error: "PEDIATRIC_MODE_DISABLED" })).toMatchObject({ code: "PEDIATRIC_MODE_DISABLED" })
    expect(draftRefusalFrom(503, { error: "Service unavailable" })).toBeNull()
  })
})
