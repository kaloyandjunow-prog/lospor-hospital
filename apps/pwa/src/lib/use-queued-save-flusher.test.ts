import { beforeEach, describe, expect, it, vi } from "vitest"

const hoisted = vi.hoisted(() => ({
  drafts: [] as Array<{ localId: string; serverCaseId?: string; formValues: Record<string, unknown>; rejected?: { status: number; code: string | null; at: string } }>,
  markLocalCaseDraftRejected: vi.fn(async () => {}),
  apiFetch: vi.fn(),
  saveSection: vi.fn(async () => ({ result: "saved" })),
  deleteLocalCaseDraft: vi.fn(async () => {}),
}))
vi.mock("react-native", () => ({ AppState: { addEventListener: () => ({ remove() {} }) } }))
vi.mock("./offline-case-patches", () => ({ getQueuedCasePatchSummary: vi.fn(async () => ({ count: 0 })) }))
vi.mock("./autosave-manager", () => ({
  autosaveManager: { saveSection: hoisted.saveSection, flushAll: vi.fn() },
  resetAutosaveNetworkBreaker: vi.fn(),
}))
vi.mock("./local-case-store", () => ({
  getAllLocalCaseDrafts: vi.fn(async () => hoisted.drafts),
  deleteLocalCaseDraft: hoisted.deleteLocalCaseDraft,
  markLocalCaseDraftRejected: hoisted.markLocalCaseDraftRejected,
}))
vi.mock("./preop-payload", () => ({ buildPreopPayload: (values: Record<string, unknown>) => ({ ...values }) }))
vi.mock("./api", () => ({ apiFetch: hoisted.apiFetch }))
vi.mock("./use-live-refresh", () => ({ useLiveRefresh: vi.fn() }))

import { flushLocalCaseDrafts } from "./use-queued-save-flusher"
import { markPreopFormOpen } from "./preop-open-forms"

beforeEach(() => {
  vi.clearAllMocks()
  hoisted.drafts = [{ localId: "local-1", serverCaseId: "case-1", formValues: { heightCm: 170 } }]
})

// The open form saves its case and clears the draft once a save succeeds. A
// replay picked up just before that newer save completed landed last and put
// the older values back.
describe("replaying local drafts", () => {
  it("leaves the draft of a form that is open to the form", async () => {
    const close = markPreopFormOpen("case-1")
    await flushLocalCaseDrafts()
    expect(hoisted.saveSection).not.toHaveBeenCalled()
    expect(hoisted.deleteLocalCaseDraft).not.toHaveBeenCalled()
    close()
  })

  it("replays it once the form is closed, since it can be the only copy", async () => {
    await flushLocalCaseDrafts()
    expect(hoisted.saveSection).toHaveBeenCalledWith("case-1", "preop", { heightCm: 170 }, expect.objectContaining({ force: true }))
    expect(hoisted.deleteLocalCaseDraft).toHaveBeenCalledWith("local-1")
  })
})

describe("a new case the server refuses", () => {
  beforeEach(() => {
    hoisted.drafts = [{ localId: "local-2", formValues: { heightCm: 170 } }]
  })

  it("is kept and marked, not retried every 15 s forever", async () => {
    hoisted.apiFetch.mockResolvedValueOnce({ ok: false, status: 422, json: async () => ({ error: "PEDIATRIC_AGE_REQUIRED", code: "PEDIATRIC_AGE_REQUIRED" }) })
    await flushLocalCaseDrafts()
    expect(hoisted.markLocalCaseDraftRejected).toHaveBeenCalledWith(hoisted.drafts[0], expect.objectContaining({ status: 422, code: "PEDIATRIC_AGE_REQUIRED" }))
    expect(hoisted.deleteLocalCaseDraft).not.toHaveBeenCalled()

    hoisted.drafts = [{ ...hoisted.drafts[0], rejected: { status: 422, code: "PEDIATRIC_AGE_REQUIRED", at: "2026-11-15T10:00:00Z" } }]
    await flushLocalCaseDrafts()
    expect(hoisted.apiFetch).toHaveBeenCalledTimes(1)
  })

  it("is retried after a sign-in, app-update or rate-limit answer", async () => {
    for (const status of [401, 408, 426, 429]) {
      hoisted.apiFetch.mockResolvedValueOnce({ ok: false, status, json: async () => ({}) })
      await flushLocalCaseDrafts()
    }
    expect(hoisted.markLocalCaseDraftRejected).not.toHaveBeenCalled()
  })
})
