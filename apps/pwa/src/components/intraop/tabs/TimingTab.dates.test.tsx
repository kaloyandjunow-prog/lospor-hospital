import React from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act } from "react-test-renderer"
import { render } from "@/test/render"
import { TimingTab } from "./TimingTab"

vi.mock("@/lib/preferences-context", () => ({ usePreferences: () => ({ language: "en" }) }))
vi.mock("@/theme/shade", () => ({ useShade: () => (hex: string) => hex }))

const SOFIA = "Europe/Sofia"
// 16 Oct 2026, 10:00 in Sofia.
const NOW = new Date("2026-10-16T07:00:00Z")

function tab(props: Partial<React.ComponentProps<typeof TimingTab>>) {
  const saveTiming = vi.fn()
  const tree = render(
    <TimingTab
      caseMonthYear="" setCaseMonthYear={() => {}}
      caseStartTime="" setCaseStartTime={() => {}}
      caseEndTime="" setCaseEndTime={() => {}}
      caseEndNextDay={false} setCaseEndNextDay={() => {}}
      timingSaving={false} saveTiming={saveTiming}
      startRef={{ current: null }} endedAtRef={{ current: null }}
      caseTimezone={SOFIA} tc={key => key}
      {...props}
    />,
  )
  return { tree, saveTiming }
}

const stepper = (tree: ReturnType<typeof render>, id: string) => tree.root.find(node => node.props.testID === id && typeof node.type !== "string")
const arrows = (tree: ReturnType<typeof render>, id: string) =>
  stepper(tree, id).findAll(node => node.props.accessibilityRole === "button" && typeof node.props.onPress === "function" && typeof node.type !== "string")
const textOf = (tree: ReturnType<typeof render>, id: string) => stepper(tree, id).findAll(node => typeof node.type === "string").flatMap(node => [node.props.children].flat()).filter(child => typeof child === "string").join(" ")

describe("the date beside the start and end of surgery on the PWA", () => {
  beforeEach(() => { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(NOW) })
  afterEach(() => { vi.useRealTimers() })

  it("starts at today, and sends a stepped start date with the time", () => {
    const { tree, saveTiming } = tab({ caseStartTime: "08:30" })
    expect(textOf(tree, "intraop-start-day")).toContain("Today")
    act(() => { arrows(tree, "intraop-start-day")[0]!.props.onPress() })
    act(() => { arrows(tree, "intraop-start-day")[0]!.props.onPress() })
    expect(JSON.stringify(tree.toJSON())).toContain("Wed 14.10")
    const input = tree.root.find(node => node.props.placeholder === "08:00" && typeof node.props.onBlur === "function")
    act(() => { input.props.onBlur() })
    expect(saveTiming).toHaveBeenLastCalledWith({ startTime: "08:30", startDayKey: "2026-10-14" })
  })

  it("shows the date of a started case, and moves the end by days", () => {
    const { tree, saveTiming } = tab({
      caseStartTime: "22:40", caseEndTime: "23:50",
      startRef: { current: new Date("2026-10-15T19:40:00Z") },
      endedAtRef: { current: new Date("2026-10-15T20:50:00Z") },
    })
    expect(JSON.stringify(tree.toJSON())).toContain("Thu 15.10 · ")
    act(() => { arrows(tree, "intraop-end-day")[1]!.props.onPress() })
    expect(saveTiming).toHaveBeenLastCalledWith({ endTime: "23:50", endDayOffset: 1 })
  })
})
