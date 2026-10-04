import React, { useState } from "react"
import { act } from "react-test-renderer"
import { describe, expect, it, vi } from "vitest"

const api = vi.hoisted(() => ({
  apiFetch: vi.fn(),
}))
const notifications = vi.hoisted(() => ({
  notify: vi.fn(),
}))
const autosave = vi.hoisted(() => ({
  flushCase: vi.fn(async () => {}),
  waitForCase: vi.fn(async () => {}),
  getState: vi.fn(() => ({ pending: 0 })),
}))

vi.mock("@/lib/api", () => api)
vi.mock("@/lib/notify", () => notifications)
vi.mock("@/lib/autosave-manager", () => ({ autosaveManager: autosave }))

import { render } from "@/test/render"
import type { CaseData } from "@/lib/case-detail-summary"
import { useCaseFinalize } from "./use-case-finalize"

function harness() {
  let finalize!: ReturnType<typeof useCaseFinalize>
  function Harness() {
    const [, setCaseData] = useState<CaseData | null>(null)
    finalize = useCaseFinalize("case-1", key => key, setCaseData)
    return null
  }
  render(<Harness />)
  return () => finalize
}

function refusal(body: unknown, status = 422) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })
}

describe("useCaseFinalize", () => {
  it("keeps every blocker the server listed, for the case screen, instead of one line (1.5.0)", async () => {
    notifications.notify.mockClear()
    api.apiFetch.mockResolvedValue(refusal({
      reason: "incomplete_preop",
      blockers: [
        { code: "incomplete_preop", path: ["preop.demographics"] },
        { code: "missing_end_time", path: ["intraop.endedAt"] },
      ],
    }))
    const finalize = harness()

    await act(async () => {
      await expect(finalize().doFinalize()).resolves.toBe(false)
    })

    expect(finalize().refusal?.blockers.map(item => item.kind)).toEqual([
      "incomplete_preop_demographics",
      "missing_end_time",
    ])
    expect(notifications.notify).not.toHaveBeenCalled()
  })

  it("still explains a refusal that carries no list", async () => {
    notifications.notify.mockClear()
    api.apiFetch.mockResolvedValue(refusal({ code: "CASE_ALREADY_FINALIZED" }, 409))
    const finalize = harness()

    await act(async () => {
      await expect(finalize().doFinalize()).resolves.toBe(false)
    })

    expect(notifications.notify).toHaveBeenCalledWith("errorLabel", "finalizeAlreadyFinalized")
    expect(finalize().refusal).toBeNull()
  })
})
