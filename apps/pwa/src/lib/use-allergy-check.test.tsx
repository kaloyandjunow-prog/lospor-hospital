import React from "react"
import { act } from "react-test-renderer"
import { describe, expect, it, vi } from "vitest"

const dialog = vi.hoisted(() => ({ confirmAction: vi.fn(async () => true) }))
vi.mock("@/lib/notify", () => ({ confirmAction: dialog.confirmAction, notify: vi.fn() }))

import { render } from "@/test/render"
import { useAllergyCheck, type AllergyCheck } from "./use-allergy-check"
import { useDrugEntry } from "./use-drug-entry"
import { useInfusionEntry } from "./use-infusion-entry"

const ALLERGIC = { allergies: true, allergyDetails: [{ label: "Penicillin", source: "ehr" }] }
const tc = (key: string) => key

function checkFor(preop: object | null): AllergyCheck {
  let check!: AllergyCheck
  function Harness() {
    check = useAllergyCheck(preop as never, tc as never)
    return null
  }
  render(<Harness />)
  return check
}

describe("the allergy check when a drug is given", () => {
  it("asks about a clash and records the acknowledgement on Give anyway", async () => {
    dialog.confirmAction.mockClear().mockResolvedValue(true)
    const verdict = await checkFor(ALLERGIC)({ name: "Ampicillin", atcCode: "J01CA01" })

    expect(dialog.confirmAction).toHaveBeenCalledWith(
      "⚠ allergyAlertTitle: Ampicillin",
      expect.stringContaining("Penicillin (allergyFromEhr) — allergySameClass"),
      expect.objectContaining({ confirmLabel: "allergyGiveAnyway", cancelLabel: "allergyDontGive" }),
    )
    expect(verdict).toEqual({ give: true, allergyAck: [{ allergy: "Penicillin", level: "same_class" }] })
  })

  it("gives nothing on Don't give", async () => {
    dialog.confirmAction.mockClear().mockResolvedValue(false)
    expect(await checkFor(ALLERGIC)({ name: "Cefazolin", atcCode: "J01DB04" })).toEqual({ give: false })
  })

  it("does not ask about a drug that clashes with nothing", async () => {
    dialog.confirmAction.mockClear()
    expect(await checkFor(ALLERGIC)({ name: "Propofol", atcCode: "N01AX10" })).toEqual({ give: true })
    expect(dialog.confirmAction).not.toHaveBeenCalled()
  })
})

describe("the infusion sheet with the check in front of it", () => {
  function infusionHarness(check: AllergyCheck) {
    const save = vi.fn(async () => null)
    const active: unknown[] = []
    let entry!: ReturnType<typeof useInfusionEntry>
    function Harness() {
      entry = useInfusionEntry(save as never, () => {}, updater => { active.splice(0, active.length, ...updater(active as never)) }, {
        Ampicillin: { atcCode: "J01CA01" },
      }, undefined, check)
      return null
    }
    render(<Harness />)
    return { save, active, entry: () => entry }
  }

  it("never shows a declined infusion as running", async () => {
    const { save, active, entry } = infusionHarness(async () => ({ give: false }))
    act(() => { entry().setInfDrug({ name: "Ampicillin", unit: "mg/h", color: "#fff" }) })
    act(() => { entry().setInfRate("10") })
    await act(async () => { entry().confirmInfusion() })

    expect(active).toEqual([])
    expect(save).not.toHaveBeenCalled()
  })

  it("starts an acknowledged infusion with the acknowledgement on it", async () => {
    const ack = [{ allergy: "Penicillin", level: "same_class" as const }]
    const { save, active, entry } = infusionHarness(async () => ({ give: true, allergyAck: ack }))
    act(() => { entry().setInfDrug({ name: "Ampicillin", unit: "mg/h", color: "#fff" }) })
    act(() => { entry().setInfRate("10") })
    await act(async () => { entry().confirmInfusion() })

    expect(active).toHaveLength(1)
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ type: "infusion_start", allergyAck: ack }))
  })
})

describe("the bolus sheet with the check in front of it", () => {
  it("saves nothing when the bolus is declined", async () => {
    const save = vi.fn(async () => null)
    let entry!: ReturnType<typeof useDrugEntry>
    function Harness() {
      entry = useDrugEntry(save as never, () => {}, [], [], () => {}, () => {}, () => {}, {}, {}, {}, async () => ({ give: false }))
      return null
    }
    render(<Harness />)
    act(() => { entry.setDrugPick({ name: "Ampicillin", unit: "mg" }) })
    act(() => { entry.setDrugDose("500") })
    await act(async () => { entry.confirmDrug() })

    expect(save).not.toHaveBeenCalled()
  })
})
