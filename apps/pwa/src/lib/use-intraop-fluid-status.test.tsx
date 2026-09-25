import React from "react"
import { act } from "react-test-renderer"
import { afterEach, describe, expect, it, vi } from "vitest"

// expo-haptics needs the RN runtime; the save path only fires it for feedback.
vi.mock("expo-haptics", () => ({
  notificationAsync: vi.fn(async () => {}),
  NotificationFeedbackType: { Success: "success" },
}))
vi.mock("@/lib/notify", () => ({ notify: vi.fn() }))
vi.mock("@/lib/preferences-context", () => ({
  usePreferences: () => ({ tc: (key: string) => key }),
}))

import { render } from "@/test/render"
import type { IntraopTab } from "./intraop-tabs"
import { FLUID_SAVE_PAUSE_MS, useIntraopFluidStatus } from "./use-intraop-fluid-status"

type FluidStatusHook = ReturnType<typeof useIntraopFluidStatus>

function setup(initialTab: IntraopTab = "fluids") {
  let result: FluidStatusHook | null = null
  const patch = vi.fn(async (_payload: Record<string, unknown>) => ({}))

  function Harness({ tab }: { tab: IntraopTab }) {
    result = useIntraopFluidStatus(tab, patch, "Error")
    return null
  }

  const tree = render(<Harness tab={initialTab} />)
  return {
    get hook(): FluidStatusHook {
      if (!result) throw new Error("Hook not rendered")
      return result
    },
    patch,
    setTab(tab: IntraopTab) {
      act(() => { tree.update(<Harness tab={tab} />) })
    },
    unmount() {
      tree.unmount()
    },
  }
}

const STORED = { urineMl: null, bloodLossMl: null }

describe("useIntraopFluidStatus", () => {
  it("sends null rather than undefined when a figure is cleared", async () => {
    const harness = setup()
    act(() => harness.hook.hydrateFluidStatus({ ...STORED, bloodLossMl: 400 }))
    act(() => harness.hook.setBloodLossMl(null))
    await act(async () => { await harness.hook.saveFluidStatus() })

    const [payload] = harness.patch.mock.calls[0]
    // An undefined key is dropped from the patch as "not mentioned", which
    // would leave the previous figure standing -- the pediatric-to-adult trap.
    expect("bloodLossMl" in payload).toBe(true)
    expect(payload.bloodLossMl).toBeNull()
  })

  it("stores an explicit zero instead of treating it as not recorded", async () => {
    const harness = setup()
    act(() => harness.hook.hydrateFluidStatus(STORED))
    act(() => harness.hook.setBloodLossMl(0))
    await act(async () => { await harness.hook.saveFluidStatus() })

    expect(harness.patch.mock.calls[0][0].bloodLossMl).toBe(0)
  })

  it("records urine output, which mobile previously could not enter at all", async () => {
    const harness = setup()
    act(() => harness.hook.hydrateFluidStatus(STORED))
    act(() => harness.hook.setUrineMl(350))
    await act(async () => { await harness.hook.saveFluidStatus() })

    expect(harness.patch.mock.calls[0][0].urineMl).toBe(350)
  })

  it("does not write when the stored figures were only read", async () => {
    const harness = setup()
    act(() => harness.hook.hydrateFluidStatus({ urineMl: 250, bloodLossMl: 100 }))
    await act(async () => { await harness.hook.saveFluidStatus() })

    expect(harness.patch).not.toHaveBeenCalled()
  })

  it("saves on leaving the tab, and not on arriving at it", async () => {
    const harness = setup("equipment")
    harness.setTab("fluids")
    act(() => harness.hook.setBloodLossMl(150))
    expect(harness.patch).not.toHaveBeenCalled()

    await act(async () => { harness.setTab("log") })
    expect(harness.patch.mock.calls[0][0].bloodLossMl).toBe(150)
  })

  it("keeps the figures when the save fails, so they can be retried", async () => {
    const harness = setup()
    harness.patch.mockRejectedValueOnce(new Error("offline"))
    act(() => harness.hook.hydrateFluidStatus(STORED))
    act(() => harness.hook.setBloodLossMl(600))
    await act(async () => { await harness.hook.saveFluidStatus() })

    expect(harness.hook.bloodLossMl).toBe(600)

    await act(async () => { await harness.hook.saveFluidStatus() })
    expect(harness.patch.mock.calls[1][0].bloodLossMl).toBe(600)
  })

  // Saving only on leaving the tab lost a figure whenever the screen was left
  // another way (End case, the app going to the background).
  describe("saving on change", () => {
    afterEach(() => { vi.useRealTimers() })

    it("saves a changed figure after a short pause, without leaving the tab", async () => {
      vi.useFakeTimers()
      const harness = setup()
      act(() => harness.hook.hydrateFluidStatus(STORED))
      act(() => harness.hook.setBloodLossMl(300))
      act(() => harness.hook.setBloodLossMl(350))
      expect(harness.patch).not.toHaveBeenCalled()

      await act(async () => { vi.advanceTimersByTime(FLUID_SAVE_PAUSE_MS) })
      expect(harness.patch).toHaveBeenCalledTimes(1)
      expect(harness.patch.mock.calls[0][0].bloodLossMl).toBe(350)
    })

    it("sends nothing for figures that were only loaded, even after the pause", async () => {
      vi.useFakeTimers()
      const harness = setup()
      act(() => harness.hook.hydrateFluidStatus({ urineMl: 250, bloodLossMl: 100 }))
      await act(async () => { vi.advanceTimersByTime(FLUID_SAVE_PAUSE_MS * 2) })
      await act(async () => { harness.setTab("log") })
      expect(harness.patch).not.toHaveBeenCalled()
    })

    it("does not send the same figures twice when the tab is left after the pause", async () => {
      vi.useFakeTimers()
      const harness = setup()
      act(() => harness.hook.hydrateFluidStatus(STORED))
      act(() => harness.hook.setUrineMl(200))
      await act(async () => { vi.advanceTimersByTime(FLUID_SAVE_PAUSE_MS) })
      await act(async () => { harness.setTab("log") })
      expect(harness.patch).toHaveBeenCalledTimes(1)
    })

    it("saves a pending figure when the screen closes inside the pause", async () => {
      vi.useFakeTimers()
      const harness = setup()
      act(() => harness.hook.hydrateFluidStatus(STORED))
      act(() => harness.hook.setBloodLossMl(500))
      await act(async () => { harness.unmount() })
      expect(harness.patch.mock.calls[0][0].bloodLossMl).toBe(500)
    })
  })
})
