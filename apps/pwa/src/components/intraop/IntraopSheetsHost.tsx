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
      <SlotActionSheet {...slot} />
      <GasSettingsSheet {...gas} />
      <DrugSheet {...drug} />
      <VitalsSheet {...vitals} />
      <InfusionSheet {...infusion} />
      <InfusionActionSheet {...infusionAction} />
      <FluidSheet {...fluid} />
      <FluidEndSheet {...fluidEnd} />
      <AgentSheet {...agent} />
      <EditEventSheet {...editEvent} />
      <ComplicationsSheet {...complications} />
      <StartAtSheet {...startAt} />
      <EndCaseSheet {...endCase} />
      <PremedicationLibrarySheet {...premedicationLibrary} />
      {postopContinue ? <PostopContinueFooter {...postopContinue} /> : null}
    </>
  )
}
