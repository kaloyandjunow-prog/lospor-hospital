import React from "react"
import { act } from "react-test-renderer"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("expo-haptics", () => ({
  notificationAsync: vi.fn(async () => {}),
  NotificationFeedbackType: { Success: "success" },
}))
vi.mock("@/lib/notify", () => ({ notify: vi.fn() }))
// A new `tc` on every render, as happens while preferences load: identity
// changes like this used to count as an airway edit.
vi.mock("@/lib/preferences-context", () => ({
  usePreferences: () => ({ tc: (key: string) => key }),
}))

import { render } from "@/test/render"
import { useIntraopAirwaySection } from "./use-intraop-airway-section"

type AirwayHook = ReturnType<typeof useIntraopAirwaySection>

function setup(onAirwayDeviceConfirmed?: (device: string, previousDevices: readonly string[], patch: Record<string, unknown>) => boolean | void) {
  let result: AirwayHook | null = null
  const patch = vi.fn(async (_payload: Record<string, unknown>) => ({}))
  function Harness({ loaded }: { loaded: boolean }) {
    result = useIntraopAirwaySection(loaded, patch, "Error", onAirwayDeviceConfirmed)
    return null
  }
  const tree = render(<Harness loaded={false} />)
  return {
    get hook(): AirwayHook {
      if (!result) throw new Error("Hook not rendered")
      return result
    },
    patch,
    /** The case loader sets the stored airway and the loaded flag in one render. */
    load(apply: (hook: AirwayHook) => void) {
      act(() => {
        apply(this.hook)
        tree.update(<Harness loaded />)
      })
    },
    rerender() {
      act(() => { tree.update(<Harness loaded />) })
    },
    unmount() {
      act(() => { tree.unmount() })
    },
  }
}

describe("airway autosave", () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it("does not re-send the stored airway when the intraop screen opens", async () => {
    const harness = setup()
    harness.load(hook => {
      hook.setAwDevices(["ETT"])
      hook.setAwOralTubeSize("7.5")
      hook.setAwNotes("Easy mask ventilation")
    })
    harness.rerender()
    harness.rerender()
    await act(async () => { vi.advanceTimersByTime(2_000) })
    expect(harness.patch).not.toHaveBeenCalled()
  })

  it("saves an actual change once, after the pause", async () => {
    const harness = setup()
    harness.load(hook => { hook.setAwNotes("Easy mask ventilation") })
    act(() => harness.hook.setAwNotes("Difficult mask ventilation"))
    harness.rerender()
    await act(async () => { vi.advanceTimersByTime(600) })
    expect(harness.patch).toHaveBeenCalledTimes(1)
    expect(harness.patch.mock.calls[0][0]).toMatchObject({ airwayNotes: "Difficult mask ventilation" })

    harness.rerender()
    await act(async () => { vi.advanceTimersByTime(2_000) })
    expect(harness.patch).toHaveBeenCalledTimes(1)
  })

  it("saves a change made just before the screen closes", async () => {
    const harness = setup()
    harness.load(() => {})
    act(() => harness.hook.setAwNotes("Grade 3 view"))
    harness.unmount()
    expect(harness.patch).toHaveBeenCalledTimes(1)
  })

  it("reports a newly added legacy device at the atomic save, but not the hydrated server list", async () => {
    const onDevice = vi.fn()
    const harness = setup(onDevice)
    harness.load(hook => { hook.setAwDevices(["ORAL_ETT"]) })
    expect(onDevice).not.toHaveBeenCalled()

    act(() => harness.hook.setAwDevices(previous => [...previous, "LMA"]))
    await act(async () => { vi.advanceTimersByTime(600) })
    expect(onDevice).toHaveBeenCalledWith("LMA", ["ORAL_ETT"], expect.objectContaining({ airwayDevices: ["ORAL_ETT", "LMA"] }))
    expect(harness.patch).toHaveBeenCalledTimes(1)
  })

  it("reports every newly added legacy device, including a rapid multi-select", async () => {
    const onDevice = vi.fn()
    const harness = setup(onDevice)
    harness.load(hook => { hook.setAwDevices(["ORAL_ETT"]) })

    act(() => harness.hook.setAwDevices(previous => [...previous, "LMA", "FACE_MASK"]))
    await act(async () => { vi.advanceTimersByTime(600) })

    expect(onDevice.mock.calls.map(call => call[0])).toEqual(["LMA", "FACE_MASK"])
    expect(onDevice.mock.calls[1]![1]).toEqual(["ORAL_ETT", "LMA"])
  })

  it("does not let one atomic device hide a second device's section save", async () => {
    const onDevice = vi.fn((device: string) => device === "LMA")
    const harness = setup(onDevice)
    harness.load(hook => { hook.setAwDevices(["ORAL_ETT"]) })

    act(() => harness.hook.setAwDevices(previous => [...previous, "LMA", "FACE_MASK"]))
    await act(async () => { vi.advanceTimersByTime(600) })

    expect(onDevice).toHaveBeenCalledTimes(2)
    expect(harness.patch).toHaveBeenCalledTimes(1)
  })
})
