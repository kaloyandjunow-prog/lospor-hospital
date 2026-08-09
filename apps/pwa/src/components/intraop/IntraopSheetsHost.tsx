import type { ComponentProps } from "react"

import { AgentSheet } from "@/components/intraop/AgentSheet"
import { ComplicationsSheet } from "@/components/intraop/ComplicationsSheet"
import { DrugSheet } from "@/components/intraop/DrugSheet"
import { EditEventSheet } from "@/components/intraop/EditEventSheet"
import { EndCaseSheet } from "@/components/intraop/EndCaseSheet"
import { FluidEndSheet } from "@/components/intraop/FluidEndSheet"
import { FluidSheet } from "@/components/intraop/FluidSheet"
import { GasSettingsSheet } from "@/components/intraop/GasSettingsSheet"
import { InfusionActionSheet } from "@/components/intraop/InfusionActionSheet"
import { InfusionSheet } from "@/components/intraop/InfusionSheet"
import { PostopContinueFooter } from "@/components/intraop/PostopContinueFooter"
import { PremedicationLibrarySheet } from "@/components/intraop/PremedicationLibrarySheet"
import { SlotActionSheet } from "@/components/intraop/SlotActionSheet"
import { StartAtSheet } from "@/components/intraop/StartAtSheet"
import { VitalsSheet } from "@/components/intraop/VitalsSheet"

export type IntraopSheetsHostProps = {
  slot: ComponentProps<typeof SlotActionSheet>
  gas: ComponentProps<typeof GasSettingsSheet>
  drug: ComponentProps<typeof DrugSheet>
  vitals: ComponentProps<typeof VitalsSheet>
  infusion: ComponentProps<typeof InfusionSheet>
  infusionAction: ComponentProps<typeof InfusionActionSheet>
  fluid: ComponentProps<typeof FluidSheet>
  fluidEnd: ComponentProps<typeof FluidEndSheet>
  agent: ComponentProps<typeof AgentSheet>
  editEvent: ComponentProps<typeof EditEventSheet>
  complications: ComponentProps<typeof ComplicationsSheet>
  startAt: ComponentProps<typeof StartAtSheet>
  endCase: ComponentProps<typeof EndCaseSheet>
  premedicationLibrary: ComponentProps<typeof PremedicationLibrarySheet>
  postopContinue?: ComponentProps<typeof PostopContinueFooter>
}

/**
 * Renders only the sheet that is actually open.
 *
 * All fourteen used to render on every parent render. `Modal` draws nothing
 * while hidden, so this looked free — but each component body still ran, and
 * those bodies filter the drug catalogue, build scenario lists and compute
 * doses. On-device measurement put the whole closed set at **1335–1652 ms per
 * intraop tab switch**, against 5–41 ms for the tab actually being opened. It
 * was the entire cost of switching tabs, spent on sheets nobody had touched.
 *
 * 8.3.3 did this for tabs; the sheets were missed. A closed sheet holds no
 * state worth preserving — it is rebuilt from props when it opens.
 */
export function IntraopSheetsHost({
  slot,
  gas,
  drug,
  vitals,
  infusion,
  infusionAction,
  fluid,
  fluidEnd,
  agent,
  editEvent,
  complications,
  startAt,
  endCase,
  premedicationLibrary,
  postopContinue,
}: IntraopSheetsHostProps) {
  return (
    <>
      {slot.visible ? <SlotActionSheet {...slot} /> : null}
      {gas.visible ? <GasSettingsSheet {...gas} /> : null}
      {drug.visible ? <DrugSheet {...drug} /> : null}
      {vitals.visible ? <VitalsSheet {...vitals} /> : null}
      {infusion.visible ? <InfusionSheet {...infusion} /> : null}
      {infusionAction.visible ? <InfusionActionSheet {...infusionAction} /> : null}
      {fluid.visible ? <FluidSheet {...fluid} /> : null}
      {fluidEnd.visible ? <FluidEndSheet {...fluidEnd} /> : null}
      {agent.visible ? <AgentSheet {...agent} /> : null}
      {editEvent.visible ? <EditEventSheet {...editEvent} /> : null}
      {complications.visible ? <ComplicationsSheet {...complications} /> : null}
      {startAt.visible ? <StartAtSheet {...startAt} /> : null}
      {endCase.visible ? <EndCaseSheet {...endCase} /> : null}
      {premedicationLibrary.visible ? <PremedicationLibrarySheet {...premedicationLibrary} /> : null}
      {/* Not a modal — a footer that is part of the screen when postop is next. */}
      {postopContinue ? <PostopContinueFooter {...postopContinue} /> : null}
    </>
  )
}
