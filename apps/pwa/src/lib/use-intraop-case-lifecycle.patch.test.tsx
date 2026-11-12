import React from "react"
import { act } from "react-test-renderer"
import { describe, expect, it, vi } from "vitest"
import { render } from "@/test/render"
import { useEventStatePatch } from "./use-intraop-case-lifecycle"

function Probe({ setTechniques, setTechniqueSides, grab }: { setTechniques: (next: string[]) => void; setTechniqueSides: (next: Record<string, "LEFT" | "RIGHT" | "BOTH">) => void; grab: (apply: ReturnType<typeof useEventStatePatch>) => void }) {
  grab(useEventStatePatch(setTechniques, setTechniqueSides))
  return null
}

describe("useEventStatePatch", () => {
  it("puts the technique and the sides an answer names into the screen's state", () => {
    const setTechniques = vi.fn()
    const setTechniqueSides = vi.fn()
    let apply!: ReturnType<typeof useEventStatePatch>
    render(<Probe setTechniques={setTechniques} setTechniqueSides={setTechniqueSides} grab={fn => { apply = fn }} />)
    act(() => apply({ techniques: ["BLOCK_FEMORAL"], techniqueSides: { BLOCK_FEMORAL: "LEFT" } }))
    expect(setTechniques).toHaveBeenCalledWith(["BLOCK_FEMORAL"])
    expect(setTechniqueSides).toHaveBeenCalledWith({ BLOCK_FEMORAL: "LEFT" })
  })

  it("sets only what the patch has", () => {
    const setTechniques = vi.fn()
    const setTechniqueSides = vi.fn()
    let apply!: ReturnType<typeof useEventStatePatch>
    render(<Probe setTechniques={setTechniques} setTechniqueSides={setTechniqueSides} grab={fn => { apply = fn }} />)
    act(() => apply({ techniques: ["GENERAL_INHALATION"] }))
    expect(setTechniques).toHaveBeenCalledWith(["GENERAL_INHALATION"])
    expect(setTechniqueSides).not.toHaveBeenCalled()
  })
})
