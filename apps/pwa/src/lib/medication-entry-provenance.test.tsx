import React from "react"
import { act } from "react-test-renderer"
import { describe, expect, it, vi } from "vitest"
import { render } from "@/test/render"
import type { LogEvent } from "@/lib/intraop-log-event"
import { useDrugEntry } from "@/lib/use-drug-entry"
import { useInfusionEntry } from "@/lib/use-infusion-entry"

const savedEvent = { id: "saved", ts: "2026-08-22T12:00:00.000Z", type: "drug" } as LogEvent

describe("manual medication event provenance", () => {
  it("records hidden drug rule and ruleset provenance with the typed dose", () => {
    const save = vi.fn(async () => savedEvent)
    let entry: ReturnType<typeof useDrugEntry> | undefined
    function Harness() {
      entry = useDrugEntry(
        save,
        () => {},
        [{ cat: "Hidden", color: "#ef4444", drugs: [{ name: "Hideamine", unit: "mg" }] }],
        [],
        () => {},
        () => {},
        () => {},
      )
      return null
    }
    render(<Harness />)

    act(() => entry?.applyDrugSelection({
      pick: { name: "Hideamine", unit: "mg" },
      dose: "12",
      route: "IV",
      rule: {
        key: "institution.hideamine",
        version: "9",
        sourceIds: ["source-hidden"],
        presetId: "institution-preset",
        presetVersion: 4,
        presetScope: "INSTITUTION",
      },
    }))
    act(() => entry?.confirmDrug())

    expect(save).toHaveBeenCalledWith(expect.objectContaining({
      type: "drug",
      name: "Hideamine",
      dose: "12",
      unit: "mg",
      drugRoute: "IV",
      clinicalRuleKey: "institution.hideamine",
      clinicalRuleVersion: "9",
      clinicalRuleSourceIds: ["source-hidden"],
      clinicalPresetId: "institution-preset",
      clinicalPresetVersion: 4,
      clinicalPresetScope: "INSTITUTION",
    }))
  })

  it("records hidden infusion provenance on both the start event and active item", () => {
    const save = vi.fn(async () => ({ ...savedEvent, type: "infusion_start" } as LogEvent))
    const setActiveInfusions = vi.fn()
    let entry: ReturnType<typeof useInfusionEntry> | undefined
    function Harness() {
      entry = useInfusionEntry(save, () => {}, setActiveInfusions)
      return null
    }
    render(<Harness />)

    act(() => {
      entry?.setInfDrug({ name: "Hideamine", unit: "mcg/kg/min", color: "#ef4444" })
      entry?.setInfRate("3")
      entry?.setInfRoute("IM")
      entry?.setInfRule({
        key: "institution.inf.hideamine",
        version: "8",
        sourceIds: ["source-hidden"],
        presetId: "institution-preset",
        presetVersion: 5,
        presetScope: "INSTITUTION",
      })
    })
    act(() => entry?.confirmInfusion())

    expect(save).toHaveBeenCalledWith(expect.objectContaining({
      type: "infusion_start",
      name: "Hideamine",
      rate: "3",
      unit: "mcg/kg/min",
      drugRoute: "IM",
      clinicalRuleKey: "institution.inf.hideamine",
      clinicalRuleVersion: "8",
      clinicalRuleSourceIds: ["source-hidden"],
      clinicalPresetId: "institution-preset",
      clinicalPresetVersion: 5,
      clinicalPresetScope: "INSTITUTION",
    }))
    expect(setActiveInfusions).toHaveBeenCalledOnce()
    const updater = setActiveInfusions.mock.calls[0]?.[0] as (previous: unknown[]) => Array<Record<string, unknown>>
    expect(updater([])[0]).toMatchObject({
      clinicalRuleKey: "institution.inf.hideamine",
      clinicalPresetId: "institution-preset",
      clinicalPresetVersion: 5,
      clinicalPresetScope: "INSTITUTION",
    })
  })
})
