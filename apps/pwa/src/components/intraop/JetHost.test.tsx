import React from "react"
import { act } from "react-test-renderer"
import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/preferences-context", () => ({ usePreferences: () => ({ tc: (key: string) => key, t: (key: string) => key, language: "en" }) }))
vi.mock("@/lib/haptic", () => ({ hapticKey: () => {}, hapticTick: () => {} }))

import { render } from "@/test/render"
import type { LogEvent } from "@/lib/intraop-log-event"
import { jetAt, jetSheet } from "@/lib/jet-sheet"
import { JetHost } from "./JetHost"

const at = (minutes: number) => new Date(Date.parse("2026-11-02T10:00:00.000Z") + minutes * 60_000).toISOString()
const byId = (tree: ReturnType<typeof render>, id: string) => tree.root.findAll(node => node.props?.testID === id)[0]

afterEach(() => { act(() => jetSheet.close()) })

describe("jet ventilation on the phone (10.2.0)", () => {
  it("reads the run in force and the last settings from the log", () => {
    const log = [
      { id: "1", ts: at(0), type: "jet_start", jetPressureBar: 2, jetRate: 150, fio2: 100 },
      { id: "2", ts: at(10), type: "jet_change", jetRate: 300 },
      { id: "3", ts: at(20), type: "jet_stop" },
    ] as LogEvent[]
    expect(jetAt(log, at(5))).toMatchObject({ running: { pressureBar: 2, rate: 150, fio2: 100 } })
    expect(jetAt(log, at(15)).running).toEqual({ pressureBar: 2, rate: 300, fio2: 100 })
    expect(jetAt(log, at(25))).toMatchObject({ running: null, last: { rate: 300 } })
  })

  it("starts a run with the quick rate, and offers Stop on a running one", () => {
    const save = vi.fn(async () => null)
    const tree = render(<JetHost log={[]} save={save as never} clockOf={iso => iso.slice(11, 16)} />)
    expect(tree.toJSON()).toBeNull()
    act(() => jetSheet.open(at(0)))
    expect(byId(tree, "jet-stop")).toBeUndefined()
    act(() => { byId(tree, "jet-rate-300")!.props.onPress() })
    act(() => { byId(tree, "jet-apply")!.props.onPress() })
    expect(save).toHaveBeenCalledWith({ type: "jet_start", jetPressureBar: 2, jetRate: 300, fio2: 100 }, at(0))
    expect(jetSheet.current()).toBeNull()
  })

  it("changes and stops a running jet from that time", () => {
    const save = vi.fn(async () => null)
    const log = [{ id: "1", ts: at(-10), type: "jet_start", jetPressureBar: 1.5, jetRate: 100, fio2: 60 }] as LogEvent[]
    const tree = render(<JetHost log={log} save={save as never} clockOf={() => ""} />)
    act(() => jetSheet.open(at(0)))
    act(() => { byId(tree, "jet-apply")!.props.onPress() })
    expect(save).toHaveBeenLastCalledWith({ type: "jet_change", jetPressureBar: 1.5, jetRate: 100, fio2: 60 }, at(0))
    act(() => jetSheet.open(at(0)))
    act(() => { byId(tree, "jet-stop")!.props.onPress() })
    expect(save).toHaveBeenLastCalledWith({ type: "jet_stop" }, at(0))
  })
})
