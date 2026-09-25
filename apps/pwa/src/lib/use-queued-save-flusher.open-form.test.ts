import { beforeEach, describe, expect, it, vi } from "vitest"
import type { LocalDraftOwner } from "./local-case-store"

const hoisted = vi.hoisted(() => ({
  drafts: [] as Array<Record<string, unknown>>,
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
  loadLocalPatientReference: vi.fn(),
  saveLocalCaseDraft: vi.fn(),
  sameLocalDraftOwner: vi.fn(() => true),
}))
vi.mock("./preop-payload", () => ({ buildPreopPayload: (values: Record<string, unknown>) => ({ ...values }) }))
vi.mock("./api", () => ({ apiFetch: vi.fn() }))
vi.mock("./use-live-refresh", () => ({ useLiveRefresh: vi.fn() }))

import { flushLocalCaseDrafts } from "./use-queued-save-flusher"
import { markPreopFormOpen } from "./preop-open-forms"

const owner: LocalDraftOwner = { userId: "clinician-a", institutionId: "hospital-1" }

beforeEach(() => {
  vi.clearAllMocks()
  hoisted.drafts = [{ localId: "local-1", owner, serverCaseId: "case-1", formValues: { heightCm: 170 } }]
})

// The open form saves its case and clears the draft once a save succeeds. A
// replay picked up just before that newer save completed landed last and put
// the older values back.
describe("replaying local drafts", () => {
  it("leaves the draft of a form that is open to the form", async () => {
    const close = markPreopFormOpen("case-1")
    await flushLocalCaseDrafts(owner)
    expect(hoisted.saveSection).not.toHaveBeenCalled()
    expect(hoisted.deleteLocalCaseDraft).not.toHaveBeenCalled()
    close()
  })

  it("replays it once the form is closed, since it can be the only copy", async () => {
    await flushLocalCaseDrafts(owner)
    expect(hoisted.saveSection).toHaveBeenCalledWith("case-1", "preop", { heightCm: 170 }, expect.objectContaining({ force: true }))
    expect(hoisted.deleteLocalCaseDraft).toHaveBeenCalledWith("local-1", owner)
  })
})
