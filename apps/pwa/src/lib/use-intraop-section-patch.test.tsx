import React from "react"
import { act } from "react-test-renderer"
import { describe, expect, it, vi } from "vitest"

// Section saves -- timing, positions, monitoring, labs -- from a phone that is
// watching the case (1.4.14 appliance test): refused, not queued, as on the web.

const { queueMock, saveSectionMock, notifyMock } = vi.hoisted(() => ({
  queueMock: vi.fn(async () => {}),
  saveSectionMock: vi.fn(async () => ({ result: "saved" })),
  notifyMock: vi.fn(),
}))
vi.mock("@/lib/autosave-manager", () => ({
  autosaveManager: {
    outbox: { queue: queueMock },
    saveSection: saveSectionMock,
    getRevision: () => null,
  },
}))
vi.mock("@/lib/notify", () => ({ notify: notifyMock }))
vi.mock("@/lib/preferences-context", () => ({ usePreferences: () => ({ t: (key: string) => key }) }))

import { render } from "@/test/render"
import { useIntraopSectionPatch } from "./use-intraop-section-patch"

async function mount(watching: boolean) {
  const watchingRef = { current: watching }
  let patch!: ReturnType<typeof useIntraopSectionPatch>
  function Harness() {
    patch = useIntraopSectionPatch({
      caseId: "case-s", pendingSaveCountRef: { current: 0 },
      setSyncState: () => {}, setSyncErrorMessage: () => {}, setLastSavedAt: () => {},
      watchingRef,
    })
    return null
  }
  await act(async () => { render(<Harness />) })
  return { patch: () => patch, watchingRef }
}

describe("section saves from a phone watching the case", () => {
  it("are refused before anything is queued, and say why", async () => {
    queueMock.mockClear(); notifyMock.mockClear()
    const { patch } = await mount(true)
    let outcome: unknown = "unset"
    await act(async () => { outcome = await patch()({ positions: ["SUPINE"] }) })
    expect(outcome).toBeUndefined()
    expect(queueMock).not.toHaveBeenCalled()
    expect(notifyMock).toHaveBeenCalledWith("watchingMode", "watchingNoEdits")
  })

  it("are queued once the phone has taken over", async () => {
    vi.useFakeTimers()
    try {
      queueMock.mockClear(); notifyMock.mockClear()
      const { patch, watchingRef } = await mount(true)
      watchingRef.current = false
      let saving!: Promise<unknown>
      await act(async () => { saving = patch()({ positions: ["SUPINE"] }) })
      await act(async () => { await vi.advanceTimersByTimeAsync(600) })
      await act(async () => { await saving })
      expect(queueMock).toHaveBeenCalledTimes(1)
      expect(notifyMock).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })
})
