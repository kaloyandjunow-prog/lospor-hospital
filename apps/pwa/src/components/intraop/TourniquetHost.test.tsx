import React from "react"
import { act } from "react-test-renderer"
import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/preferences-context", () => ({ usePreferences: () => ({ tc: (key: string) => key, t: (key: string) => key, language: "en" }) }))
vi.mock("react-native-svg", () => ({ __esModule: true, default: () => null, G: () => null, Path: () => null, Rect: () => null }))

import { render } from "@/test/render"
import type { LogEvent } from "@/lib/intraop-log-event"
import { isTourniquetLabel, tourniquetSheet } from "@/lib/tourniquet-sheet"
import { TourniquetHost } from "./TourniquetHost"

const at = (minutes: number) => new Date(Date.parse("2026-11-02T10:00:00.000Z") + minutes * 60_000).toISOString()
const byId = (tree: ReturnType<typeof render>, id: string) => tree.root.findAll(node => node.props?.testID === id)[0]
const on = { id: "t1", ts: at(-95), type: "clinical_event", label: "Tourniquet on", site: "RIGHT_THIGH" } as LogEvent

afterEach(() => { act(() => tourniquetSheet.close()) })

describe("the tourniquet body picker on the phone (10.2.0)", () => {
  it("knows the two labels", () => {
    expect(isTourniquetLabel("Tourniquet on")).toBe(true)
    expect(isTourniquetLabel("Tourniquet off")).toBe(true)
    expect(isTourniquetLabel("Intubated")).toBe(false)
  })

  it("Tourniquet on saves the limb tapped at the column's time; a cuff already on cannot be chosen again", () => {
    const save = vi.fn(async () => null)
    const tree = render(<TourniquetHost log={[on]} save={save as never} ageDays={40 * 365} sex="MALE" clockOf={iso => iso.slice(11, 16)} />)
    act(() => tourniquetSheet.open({ ts: at(0), label: "Tourniquet on", color: "#f97316" }))
    expect(byId(tree, "tourniquet-spot-RIGHT_THIGH")!.props.disabled).toBe(true)
    expect(byId(tree, "tourniquet-save")!.props.disabled).toBe(true)
    act(() => { byId(tree, "tourniquet-spot-LEFT_UPPER_ARM")!.props.onPress() })
    act(() => { byId(tree, "tourniquet-save")!.props.onPress() })
    expect(save).toHaveBeenCalledWith({ type: "clinical_event", label: "Tourniquet on", color: "#f97316", site: "LEFT_UPPER_ARM" }, at(0))
    expect(tourniquetSheet.current()).toBeNull()
  })

  it("Tourniquet off offers only the cuffs that are on", () => {
    const save = vi.fn(async () => null)
    const tree = render(<TourniquetHost log={[on]} save={save as never} ageDays={6 * 365} clockOf={() => ""} />)
    act(() => tourniquetSheet.open({ ts: at(0), label: "Tourniquet off", color: "#22c55e" }))
    expect(byId(tree, "tourniquet-spot-LEFT_THIGH")!.props.disabled).toBe(true)
    act(() => { byId(tree, "tourniquet-spot-RIGHT_THIGH")!.props.onPress() })
    act(() => { byId(tree, "tourniquet-save")!.props.onPress() })
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ label: "Tourniquet off", site: "RIGHT_THIGH" }), at(0))
  })
})
