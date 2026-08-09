import React from "react"
import { act } from "react-test-renderer"
import { describe, expect, it, vi } from "vitest"

import { render } from "@/test/render"
import {
  EndCaseSheet,
  type EndCaseCleanupItem,
  type EndCaseStopContext,
} from "./EndCaseSheet"

function renderSheet(items: EndCaseCleanupItem[], onFinalize = vi.fn()) {
  const decisions = Object.fromEntries(items.map(item => [item.key, "stop" as const]))
  const tree = render(
    <EndCaseSheet
      visible
      onClose={() => {}}
      items={items}
      decisions={decisions}
      continueLabel="Finalise"
      onDecision={() => {}}
      onFinalize={onFinalize}
    />,
  )
  return { tree, onFinalize }
}

describe("EndCaseSheet fluid cleanup", () => {
  it("defaults a bag to its planned amount and sends the clinician's edited actual volume", async () => {
    const stopFluid = vi.fn(async (_context?: EndCaseStopContext) => {})
    const { tree, onFinalize } = renderSheet([{
      key:"fluid-bag-1",
      label:"Saline",
      sublabel:"500 mL - fluid",
      color:"#06b6d4",
      fluidVolume:{ mode:"VOLUME", atEnd:() => 500 },
      onStop:stopFluid,
    }])

    const input = tree.root.findByProps({ testID:"end-case-fluid-actual-fluid-bag-1" })
    expect(input.props.value).toBe("500")
    act(() => input.props.onChangeText("175"))

    await act(async () => {
      await tree.root.findByProps({ testID:"end-case-finalize" }).props.onPress()
    })

    expect(stopFluid).toHaveBeenCalledOnce()
    const context = stopFluid.mock.calls[0]?.[0]
    expect(context).toBeDefined()
    if (!context) throw new Error("Missing fluid stop context")
    expect(context).toEqual({
      endTs:expect.any(String),
      administeredVolumeMl:175,
    })
    expect(onFinalize).toHaveBeenCalledWith([], context.endTs)
  })

  it("uses one timestamp for every fluid while preserving generic stop behavior", async () => {
    const rateOneAtEnd = vi.fn(() => 25)
    const rateTwoAtEnd = vi.fn(() => 35)
    const stopRateOne = vi.fn(async (_context?: EndCaseStopContext) => {})
    const stopRateTwo = vi.fn(async (_context?: EndCaseStopContext) => {})
    const stopAgent = vi.fn(async () => {})
    const items: EndCaseCleanupItem[] = [
      {
        key:"fluid-rate-1",
        label:"Ringer",
        sublabel:"50 mL/h - fluid",
        color:"#06b6d4",
        fluidVolume:{ mode:"RATE", atEnd:rateOneAtEnd },
        onStop:stopRateOne,
      },
      {
        key:"fluid-rate-2",
        label:"Glucose",
        sublabel:"70 mL/h - fluid",
        color:"#0ea5e9",
        fluidVolume:{ mode:"RATE", atEnd:rateTwoAtEnd },
        onStop:stopRateTwo,
      },
      {
        key:"agent-sevoflurane",
        label:"Sevoflurane",
        sublabel:"Volatile - inhalational",
        color:"#a855f7",
        onStop:stopAgent,
      },
    ]
    const onFinalize = vi.fn()
    const tree = render(
      <EndCaseSheet
        visible
        onClose={() => {}}
        items={items}
        decisions={{
          "fluid-rate-1":"stop",
          "fluid-rate-2":"continue",
          "agent-sevoflurane":"continue",
        }}
        continueLabel="Finalise"
        onDecision={() => {}}
        onFinalize={onFinalize}
      />,
    )
    act(() => {
      tree.root.findByProps({ testID:"end-case-fluid-actual-fluid-rate-2" })
        .props.onChangeText("42")
    })

    await act(async () => {
      await tree.root.findByProps({ testID:"end-case-finalize" }).props.onPress()
    })

    const firstContext = stopRateOne.mock.calls[0]?.[0]
    const secondContext = stopRateTwo.mock.calls[0]?.[0]
    expect(firstContext).toBeDefined()
    expect(secondContext).toBeDefined()
    if (!firstContext || !secondContext) throw new Error("Missing fluid stop context")
    expect(firstContext.endTs).toBe(secondContext.endTs)
    expect(firstContext.administeredVolumeMl).toBe(25)
    expect(secondContext.administeredVolumeMl).toBe(42)
    expect(rateOneAtEnd).toHaveBeenCalledWith(firstContext.endTs)
    expect(rateTwoAtEnd).toHaveBeenCalled()
    expect(stopAgent).not.toHaveBeenCalled()
    expect(onFinalize).toHaveBeenCalledWith([
      "Glucose (70 mL/h - fluid)",
      "Sevoflurane (Volatile - inhalational)",
    ], firstContext.endTs)
  })
})
