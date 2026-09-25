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

function setup() {
  let result: AirwayHook | null = null
  const patch = vi.fn(async (_payload: Record<string, unknown>) => ({}))
  function Harness({ loaded }: { loaded: boolean }) {
    result = useIntraopAirwaySection(loaded, patch, "Error")
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
})
