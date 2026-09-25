import React from "react"
import { act } from "react-test-renderer"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { render } from "@/test/render"

const state = vi.hoisted(() => ({
  resolveCase: null as null | ((value: unknown) => void),
  rejectCase: null as null | ((error: unknown) => void),
}))

vi.mock("expo-router", () => ({ useRouter: () => ({ replace: vi.fn() }) }))
vi.mock("@/lib/notify", () => ({ notify: vi.fn() }))
vi.mock("@/lib/local-case-store", () => ({ loadLocalCaseDraft: vi.fn(async () => null) }))
vi.mock("@/lib/api", () => ({
  ApiError: class ApiError extends Error { status = 0 },
  apiJson: vi.fn(() => new Promise((resolve, reject) => {
    state.resolveCase = resolve
    state.rejectCase = reject
  })),
}))
vi.mock("@/lib/autosave-manager", () => ({
  autosaveManager: {
    flushCase: vi.fn(async () => {}),
    outbox: { load: vi.fn(async () => null) },
    hydrateSection: vi.fn(),
    getState: vi.fn(() => ({ status: "saved" })),
  },
}))

import { usePreopDraftLoader } from "./use-preop-draft-loader"

type Values = { diagnosis: string }

function Harness({ caseLoadedRef, reset }: { caseLoadedRef: { current: boolean }; reset: (values: Values) => void }) {
  usePreopDraftLoader<Values>({
    continueId: "case-1",
    localIdParam: undefined,
    // Appliance-only: local drafts are per operator; unused when continuing a case.
    draftOwner: null as never,
    valuesFromServerPreop: preop => ({ diagnosis: String(preop.diagnosis ?? "") }),
    buildPreopPayload: values => ({ ...values }),
    blockedMessage: () => "",
    clearLocalDraft: () => {},
    reset,
    caseIdRef: { current: null },
    caseLoadedRef,
    setCaseId: () => {},
    setPersistedPediatricRecord: () => {},
    setBlockedIssue: () => {},
    setSaveError: () => {},
    setDraftState: () => {},
    setPreopFinalizedAt: () => {},
    setPreopCaseStatus: () => {},
    tc: ((key: string) => key) as never,
  })
  return null
}

const settle = () => act(async () => { await new Promise(resolve => setTimeout(resolve, 0)) })

// The preop screen renders blank defaults and autosaves every change. Reopening
// a case on a slow API let that autosave run before the case arrived and write
// the blanks over the stored assessment (diagnosis and procedure lost). The
// screen now waits for this flag.
describe("reopening a case", () => {
  beforeEach(() => { state.resolveCase = null; state.rejectCase = null })

  it("marks the case loaded only once its server copy is in the form", async () => {
    const caseLoadedRef = { current: true }
    const reset = vi.fn()
    render(<Harness caseLoadedRef={caseLoadedRef} reset={reset} />)
    await settle()
    expect(caseLoadedRef.current).toBe(false)

    state.resolveCase!({ preop: { diagnosis: "Cholelithiasis", syncRevision: 3 } })
    await settle()
    expect(reset).toHaveBeenCalledWith({ diagnosis: "Cholelithiasis" })
    expect(caseLoadedRef.current).toBe(true)
  })

  it("stays not loaded when the case cannot be read, so blanks are never saved", async () => {
    const caseLoadedRef = { current: true }
    render(<Harness caseLoadedRef={caseLoadedRef} reset={vi.fn()} />)
    await settle()
    state.rejectCase!(new Error("network"))
    await settle()
    expect(caseLoadedRef.current).toBe(false)
  })
})
