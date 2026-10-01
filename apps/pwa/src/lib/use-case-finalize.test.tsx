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

describe("useCaseFinalize", () => {
  it("turns the structured demographics refusal into the visible PWA message", async () => {
    api.apiFetch.mockResolvedValue(new Response(JSON.stringify({
      reason: "incomplete_preop",
      blockers: [{ code: "incomplete_preop", path: ["preop.demographics"] }],
    }), { status: 422, headers: { "Content-Type": "application/json" } }))

    let finalize!: ReturnType<typeof useCaseFinalize>
    function Harness() {
      const [, setCaseData] = useState<CaseData | null>(null)
      finalize = useCaseFinalize("case-1", key => key, setCaseData)
      return null
    }

    render(<Harness />)

    await act(async () => {
      await expect(finalize.doFinalize()).resolves.toBe(false)
    })

    expect(notifications.notify).toHaveBeenCalledWith(
      "errorLabel",
      "finalizeMissingDemographics",
    )
  })
})
