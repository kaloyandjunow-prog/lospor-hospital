// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  summary: vi.fn(async () => ({ count: 0 })),
  eventCount: vi.fn(async () => 0),
  clearCases: vi.fn(async () => undefined),
  clearEvents: vi.fn(async () => undefined),
  clearMutations: vi.fn(async () => undefined),
  clearPediatric: vi.fn(async () => undefined),
  clearClinical: vi.fn(async () => undefined),
  clearPreferences: vi.fn(),
  finishLocale: vi.fn(async () => undefined),
  toastError: vi.fn(),
}))

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }))
vi.mock("sonner", () => ({ toast: { error: mocks.toastError } }))
vi.mock("@/lib/case-outbox", () => ({ caseOutbox: { summary: mocks.summary, clearAll: mocks.clearCases } }))
vi.mock("@/lib/event-outbox", () => ({ eventOutbox: { clearAll: mocks.clearEvents }, eventOutboxCount: mocks.eventCount }))
vi.mock("@/lib/autosave-manager", () => ({ autosaveManager: { eventMutations: { clearAll: mocks.clearMutations } } }))
vi.mock("@/hooks/usePediatricClinicalRules", () => ({ clearPediatricClinicalRulesCache: mocks.clearPediatric }))
vi.mock("@/hooks/useClinicalRules", () => ({ clearClinicalRulesCache: mocks.clearClinical }))
vi.mock("@/lib/clinical-preferences-web", () => ({ clearWebClinicalPreferences: mocks.clearPreferences }))
vi.mock("@/app/actions/locale", () => ({ finishLogoutLocale: mocks.finishLocale }))

import { SignOutButton } from "./SignOutButton"

describe("SignOutButton", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.clearAllMocks()
  })

  it("does not discard local clinical work when server-side logout fails", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 503 }))
    render(<SignOutButton />)
    fireEvent.click(screen.getByRole("button", { name: "nav.signOut" }))

    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith("nav.signOutFailed"))
    expect(mocks.clearCases).not.toHaveBeenCalled()
    expect(mocks.clearEvents).not.toHaveBeenCalled()
    expect(mocks.clearPreferences).not.toHaveBeenCalled()
    expect(mocks.finishLocale).not.toHaveBeenCalled()
  })
})

