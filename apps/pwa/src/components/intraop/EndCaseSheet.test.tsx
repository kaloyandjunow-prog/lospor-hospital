import React from "react"
import { act } from "react-test-renderer"
import { describe, expect, it, vi } from "vitest"

vi.mock("@/lib/preferences-context", () => ({
  usePreferences: () => ({ tc: (key: string) => key }),
}))

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

  // 1.4.9: only items marked "stop" get a stop, all at one end time. Items
  // continued postoperatively get none: the chart and every total stop at the end.
  it("stops only the items marked stop, at one end time", async () => {
    const rateOneAtEnd = vi.fn(() => 25)
    const stopRateOne = vi.fn(async (_context?: EndCaseStopContext) => {})
    const stopRateTwo = vi.fn(async (_context?: EndCaseStopContext) => {})
    const stopAgent = vi.fn(async (_context?: EndCaseStopContext) => {})
    const stopInfusion = vi.fn(async (_context?: EndCaseStopContext) => {})
    const items: EndCaseCleanupItem[] = [
      { key:"fluid-rate-1", label:"Ringer", sublabel:"50 mL/h - fluid", color:"#06b6d4",
        fluidVolume:{ mode:"RATE", atEnd:rateOneAtEnd }, onStop:stopRateOne },
      { key:"fluid-rate-2", label:"Glucose", sublabel:"70 mL/h - fluid", color:"#0ea5e9",
        fluidVolume:{ mode:"RATE", atEnd:vi.fn(() => 35) }, onStop:stopRateTwo },
      { key:"agent-sevoflurane", label:"Sevoflurane", sublabel:"Volatile - inhalational", color:"#a855f7", onStop:stopAgent },
      { key:"inf-1", label:"Propofol", sublabel:"6 mg/kg/h - infusion", color:"#3b82f6", onStop:stopInfusion },
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
          "inf-1":"stop",
        }}
        continueLabel="Finalise"
        onDecision={() => {}}
        onFinalize={onFinalize}
      />,
    )
    // A continued fluid has no "actual volume" box: nothing is stopped for it.
    expect(tree.root.findAllByProps({ testID:"end-case-fluid-actual-fluid-rate-2" })).toHaveLength(0)

    await act(async () => {
      await tree.root.findByProps({ testID:"end-case-finalize" }).props.onPress()
    })

    const fluidContext = stopRateOne.mock.calls[0]?.[0]
    const infusionContext = stopInfusion.mock.calls[0]?.[0]
    if (!fluidContext || !infusionContext) throw new Error("Missing stop context")
    expect(fluidContext.endTs).toBe(infusionContext.endTs)
    expect(fluidContext.administeredVolumeMl).toBe(25)
    expect(rateOneAtEnd).toHaveBeenCalledWith(fluidContext.endTs)
    expect(stopRateTwo).not.toHaveBeenCalled()
    expect(stopAgent).not.toHaveBeenCalled()
    expect(onFinalize).toHaveBeenCalledWith([
      "Glucose (70 mL/h - fluid)",
      "Sevoflurane (Volatile - inhalational)",
    ], fluidContext.endTs)
  })

  it("cannot finalise while an entry lies after the end", () => {
    const onResolveAfterEnd = vi.fn()
    const tree = render(
      <EndCaseSheet
        visible
        onClose={() => {}}
        items={[]}
        afterEnd={[{ id:"planned-1", label:"Ondansetron 4 mg", time:"23:30", color:"#f59e0b" }]}
        onResolveAfterEnd={onResolveAfterEnd}
        decisions={{}}
        continueLabel="Finalise"
        onDecision={() => {}}
        onFinalize={vi.fn()}
      />,
    )
    expect(tree.root.findByProps({ testID:"end-case-finalize" }).props.disabled).toBe(true)
    act(() => { tree.root.findByProps({ testID:"end-case-after-end-delete-planned-1" }).props.onPress() })
    expect(onResolveAfterEnd).toHaveBeenCalledWith("planned-1", "delete")
  })
})
