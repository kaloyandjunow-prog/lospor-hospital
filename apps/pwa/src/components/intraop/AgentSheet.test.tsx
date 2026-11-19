import { act } from "react-test-renderer"
import { describe, expect, it, vi } from "vitest"

vi.mock("@/lib/haptic", () => ({ hapticTick: vi.fn() }))
vi.mock("expo-haptics", () => ({}))

import { pressByText } from "@/test/render"
import { AgentSheet } from "./AgentSheet"
import { DoseSelector } from "./DoseSelector"
import { renderWithPreferences } from "./fluid-sheet-test-fixtures"

describe("AgentSheet autofill on select", () => {
  it("starts the agent percent at 0, not at the library's first quick value", () => {
    const setAgPick = vi.fn()
    const setAgPercent = vi.fn()
    const tree = renderWithPreferences(
      <AgentSheet
        visible
        onClose={() => {}}
        agents={[{ name: "Sevoflurane", color: "#a855f7" }]}
        agPick={null}
        setAgPick={setAgPick}
        activeAgent={null}
        onConfirm={() => {}}
        agPercent={null}
        setAgPercent={setAgPercent}
      />,
    )

    pressByText(tree, "Sevoflurane")

    expect(setAgPick).toHaveBeenCalledWith({ name: "Sevoflurane", color: "#a855f7" })
    expect(setAgPercent).toHaveBeenCalledWith(0)
  })

  it("keeps agent selection manual when the governed baseline is unavailable", () => {
    const agent = { name: "Sevoflurane", color: "#a855f7" }
    const setAgPercent = vi.fn()
    const tree = renderWithPreferences(
      <AgentSheet
        visible
        onClose={() => {}}
        agents={[agent]}
        agPick={null}
        setAgPick={() => {}}
        activeAgent={null}
        onConfirm={() => {}}
        agPercent={null}
        setAgPercent={setAgPercent}
      />,
    )

    pressByText(tree, "Sevoflurane")
    expect(setAgPercent).toHaveBeenCalledWith(0)

    const selectedTree = renderWithPreferences(
      <AgentSheet
        visible
        onClose={() => {}}
        agents={[agent]}
        agPick={agent}
        setAgPick={() => {}}
        activeAgent={null}
        onConfirm={() => {}}
        agPercent={null}
        setAgPercent={() => {}}
      />,
    )
    // The slider and the quick buttons stay in every mode; nothing is filled in
    // for the clinician.
    const selector = selectedTree.root.findByType(DoseSelector)
    expect(selector.props.manualEntryOnly).toBeUndefined()
    expect(selector.props.quickValues).toEqual([1, 2, 2.5, 3, 8])
    expect(selector.props.value).toBe("")
  })

  it("gives a child the slider and the quick buttons too, with nothing filled in", () => {
    const agent = { name: "Sevoflurane", color: "#a855f7" }
    const tree = renderWithPreferences(
      <AgentSheet
        visible onClose={() => {}} agents={[agent]} agPick={agent} setAgPick={() => {}} activeAgent={null}
        onConfirm={() => {}} agPercent={null} setAgPercent={() => {}}
      />,
    )
    const selector = tree.root.findByType(DoseSelector)
    expect(selector.props.manualEntryOnly).toBeUndefined()
    expect(selector.props.quickValues).toEqual([1, 2, 2.5, 3, 8])
    expect(selector.props.value).toBe("")
    expect(tree.root.findAllByProps({ testID: "dose-fallback-stepper" }).length).toBe(0)
    // Nothing is filled in, so nothing can be confirmed until a value is chosen.
    expect(selector.props.confirmDisabled).toBe(true)
  })

  it("steps an agent by 0.1 % with the + and - buttons", () => {
    const agent = { name: "Sevoflurane", color: "#a855f7" }
    let percent: number | null = 1
    const tree = renderWithPreferences(
      <AgentSheet
        visible onClose={() => {}} agents={[agent]} agPick={agent} setAgPick={() => {}} activeAgent={null}
        onConfirm={() => {}} agPercent={percent} setAgPercent={value => { percent = value }}
      />,
    )
    act(() => tree.root.findByProps({ testID: "stepper-plus" }).props.onStep())
    expect(percent).toBe(1.1)
    act(() => tree.root.findByProps({ testID: "stepper-minus" }).props.onStep())
    expect(percent).toBe(0.9)
  })

  it("takes each agent's range from the catalogue: desflurane goes above 10 %, sevoflurane stops at 8", () => {
    const run = (name: string, start: number) => {
      const agent = { name, color: "#a855f7" }
      let percent: number | null = start
      const tree = renderWithPreferences(
        <AgentSheet
          visible onClose={() => {}} agents={[agent]} agPick={agent} setAgPick={() => {}} activeAgent={null}
          onConfirm={() => {}} agPercent={percent} setAgPercent={value => { percent = value }}
        />,
      )
      act(() => tree.root.findByProps({ testID: "stepper-plus" }).props.onStep())
      return percent
    }
    expect(run("Desflurane", 12)).toBe(12.1)
    expect(run("Sevoflurane", 8)).toBe(8)
  })

  it("says Change, not Start, for an agent that is already running", () => {
    const agent = { name: "Sevoflurane", color: "#a855f7" }
    const render = (runningNames: string[]) => JSON.stringify(renderWithPreferences(
      <AgentSheet
        visible onClose={() => {}} agents={[agent]} agPick={agent} setAgPick={() => {}} activeAgent={agent}
        onConfirm={() => {}} agPercent={1.5} setAgPercent={() => {}} runningNames={runningNames}
      />,
    ).toJSON())
    expect(render(["Sevoflurane"])).toContain("Change Sevoflurane")
    expect(render([])).toContain("Start Sevoflurane")
  })
})
