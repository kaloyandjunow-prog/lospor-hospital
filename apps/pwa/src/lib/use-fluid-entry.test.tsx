import React from "react"
import { act } from "react-test-renderer"
import { describe, expect, it, vi } from "vitest"

import { render } from "@/test/render"
import type { ActiveFluid, LogEvent } from "./intraop-log-event"
import { useFluidEntry } from "./use-fluid-entry"

type FluidEntryHook = ReturnType<typeof useFluidEntry>

function setup() {
  let result: FluidEntryHook | null = null
  let activeFluids: ActiveFluid[] = []
  const save = vi.fn(async (
    partial: Omit<LogEvent, "id" | "ts">,
    tsOverride?: string,
  ): Promise<LogEvent> => ({
    id: "saved",
    ts: tsOverride ?? "2026-08-02T08:00:00.000Z",
    ...partial,
  }))
  const setActiveFluids = (updater: (previous: ActiveFluid[]) => ActiveFluid[]) => {
    activeFluids = updater(activeFluids)
  }

  function Harness() {
    result = useFluidEntry(save, () => {}, setActiveFluids)
    return null
  }

  render(<Harness />)
  return {
    get hook(): FluidEntryHook {
      if (!result) throw new Error("Hook not rendered")
      return result
    },
    save,
    activeFluids: () => activeFluids,
  }
}

describe("useFluidEntry", () => {
  it("persists a bag as volume without losing its planned bag amount", () => {
    const harness = setup()
    act(() => {
      harness.hook.openFluid("2026-08-02T08:00:00.000Z")
      harness.hook.setFlFluid({ name:"Plasma-Lyte", cat:"Crystalloids", color:"#06b6d4" })
      harness.hook.setFlVol("500")
      harness.hook.setFlEntryMode("VOLUME")
    })
    act(() => harness.hook.confirmFluid())

    expect(harness.save).toHaveBeenCalledWith(expect.objectContaining({
      type:"fluid_start",
      fluidEntryMode:"VOLUME",
      volume:"500",
      bagVolumeMl:500,
      rate:undefined,
    }), "2026-08-02T08:00:00.000Z")
    expect(harness.activeFluids()[0]).toMatchObject({
      fluidEntryMode:"VOLUME",
      bagVolumeMl:500,
      volume:"500",
    })
  })

  it("persists a rate separately and never treats mL/h as volume", () => {
    const harness = setup()
    act(() => {
      harness.hook.openFluid("2026-08-02T08:00:00.000Z")
      harness.hook.setFlFluid({ name:"Ringer", cat:"Crystalloids", color:"#06b6d4" })
      harness.hook.setFlEntryMode("RATE")
      harness.hook.setFlRate("70")
    })
    act(() => harness.hook.confirmFluid())

    expect(harness.save).toHaveBeenCalledWith(expect.objectContaining({
      type:"fluid_start",
      fluidEntryMode:"RATE",
      rate:"70",
      unit:"mL/h",
      volume:"",
      bagVolumeMl:undefined,
    }), "2026-08-02T08:00:00.000Z")
    expect(harness.activeFluids()[0]).toMatchObject({
      fluidEntryMode:"RATE",
      initialRate:"70",
      rate:"70",
      volume:"",
    })
  })

  it("persists the selected fluid route and effective-rule provenance", () => {
    const harness = setup()
    act(() => {
      harness.hook.openFluid("2026-08-02T08:00:00.000Z")
      harness.hook.setFlFluid({ name:"Ringer", cat:"Crystalloids", color:"#06b6d4" })
      harness.hook.setFlVol("250")
      harness.hook.setFlEntryMode("VOLUME")
      harness.hook.setFlRoute("IO")
      harness.hook.setFlRule({
        ruleKey:"PEDIATRIC_FLUID_PROFILE:RINGER:0-6574",
        ruleVersion:"pediatric-fluid.v1",
        sourceIds:["rule:ringer"],
      })
    })
    act(() => harness.hook.confirmFluid())

    expect(harness.save).toHaveBeenCalledWith(expect.objectContaining({
      type:"fluid_start",
      drugRoute:"IO",
      clinicalRuleKey:"PEDIATRIC_FLUID_PROFILE:RINGER:0-6574",
      clinicalRuleVersion:"pediatric-fluid.v1",
      clinicalRuleSourceIds:["rule:ringer"],
    }), "2026-08-02T08:00:00.000Z")
  })

  it("sends the clinician's partial-bag amount on fluid_end", () => {
    const harness = setup()
    const fluid: ActiveFluid = {
      fluidId:"bag-1",
      name:"Saline",
      category:"Crystalloids",
      volume:"500",
      bagVolumeMl:500,
      color:"#06b6d4",
      fluidEntryMode:"VOLUME",
      startTs:"2026-08-02T08:00:00.000Z",
    }
    act(() => harness.hook.openFluidEnd(fluid))
    act(() => harness.hook.confirmFluidEnd(175))

    expect(harness.save).toHaveBeenCalledWith(expect.objectContaining({
      type:"fluid_end",
      fluidId:"bag-1",
      fluidEntryMode:"VOLUME",
      administeredVolumeMl:175,
      volume:"175",
    }), expect.any(String))
  })

  it("uses the shared end-case timestamp and actual-volume override for a direct stop", async () => {
    const harness = setup()
    const fluid: ActiveFluid = {
      fluidId:"bag-end-case",
      name:"Saline",
      category:"Crystalloids",
      volume:"500",
      bagVolumeMl:500,
      color:"#06b6d4",
      fluidEntryMode:"VOLUME",
      startTs:"2026-08-02T08:00:00.000Z",
    }

    await act(async () => {
      await harness.hook.stopFluidDirect(fluid, {
        endTs:"2026-08-02T09:15:00.000Z",
        administeredVolumeMl:175,
      })
    })

    expect(harness.save).toHaveBeenCalledWith(expect.objectContaining({
      type:"fluid_end",
      fluidId:"bag-end-case",
      fluidEntryMode:"VOLUME",
      administeredVolumeMl:175,
      volume:"175",
    }), "2026-08-02T09:15:00.000Z")
  })
})
