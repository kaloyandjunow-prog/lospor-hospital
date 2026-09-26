import type { RunningAgent } from "./use-intraop-running-state"
import type { ActiveFluid, ActiveGasSettings, ActiveInfusion } from "./intraop-log-event"
import { calculatedFluidVolumeMl, fluidEntryModeOf, fluidEntryValueLabel } from "./fluid-entry"
import type { EndCaseStopContext } from "@/components/intraop/EndCaseSheet"

export type EndCaseRunningItem = {
  key: string
  label: string
  sublabel: string
  color: string
  onStop: (context?: EndCaseStopContext) => void | Promise<void>
  fluidVolume?: {
    mode: "VOLUME" | "RATE"
    atEnd: (endTs: string) => number
  }
}

/** A stop made at End case: at the end time, marked so Resume can offer to remove it. */
export type EndCaseStopOptions = { exactTs?: string; endCaseStop?: boolean }

type BuildEndCaseRunningItemsInput = {
  activeAgents: RunningAgent[]
  activeGas: ActiveGasSettings
  activeInfusions: ActiveInfusion[]
  activeFluids: ActiveFluid[]
  stopAgent: (name: string, rowTs: null, options: EndCaseStopOptions) => void | Promise<void>
  stopGasSettings: (rowTs: null, options: EndCaseStopOptions) => void | Promise<void>
  stopInfusion: (infusion: ActiveInfusion, rowTs: null, options: EndCaseStopOptions) => void | Promise<void>
  stopFluid: (fluid: ActiveFluid, context?: EndCaseStopContext) => void | Promise<void>
  labels?: {
    volatileInhalational: string
    gasSettings: string
    infusion: string
    fluid: string
  }
}

export function hasEndCaseRunningItems({
  activeAgents,
  activeGas,
  activeInfusions,
  activeFluids,
}: Pick<BuildEndCaseRunningItemsInput, "activeAgents" | "activeGas" | "activeInfusions" | "activeFluids">): boolean {
  return activeInfusions.length > 0 || activeFluids.length > 0 || activeAgents.length > 0 || !!activeGas
}

function atEnd(context?: EndCaseStopContext): EndCaseStopOptions {
  return context ? { exactTs: context.endTs, endCaseStop: true } : {}
}

export function buildEndCaseRunningItems({
  activeAgents,
  activeGas,
  activeInfusions,
  activeFluids,
  stopAgent,
  stopGasSettings,
  stopInfusion,
  stopFluid,
  labels = {
    volatileInhalational: "Volatile - inhalational",
    gasSettings: "Gas settings",
    infusion: "infusion",
    fluid: "fluid",
  },
}: BuildEndCaseRunningItemsInput): EndCaseRunningItem[] {
  const items: EndCaseRunningItem[] = []
  items.push(...activeAgents.map(agent => ({
    key: `agent-${agent.name}`,
    label: agent.name,
    sublabel: labels.volatileInhalational,
    color: agent.color,
    onStop: (context?: EndCaseStopContext) => stopAgent(agent.name, null, atEnd(context)),
  })))
  if (activeGas) items.push({
    key: "gas-settings",
    label: labels.gasSettings,
    sublabel: `FGF ${activeGas.fgf}L/min - FiO2 ${activeGas.fio2}%`,
    color: "#6366f1",
    onStop: (context?: EndCaseStopContext) => stopGasSettings(null, atEnd(context)),
  })
  items.push(...activeInfusions.map(infusion => ({
    key: `inf-${infusion.infId}`,
    label: infusion.name,
    sublabel: `${infusion.rate} ${infusion.unit} - ${labels.infusion}`,
    color: infusion.color,
    onStop: (context?: EndCaseStopContext) => stopInfusion(infusion, null, atEnd(context)),
  })))
  items.push(...activeFluids.map(fluid => ({
    key: `fluid-${fluid.fluidId}`,
    label: fluid.name,
    sublabel: `${fluidEntryValueLabel(fluid)} - ${labels.fluid}`,
    color: fluid.color,
    fluidVolume: {
      mode: fluidEntryModeOf(fluid),
      atEnd: (endTs: string) => calculatedFluidVolumeMl(fluid, endTs),
    },
    onStop: (context?: EndCaseStopContext) => context ? stopFluid(fluid, context) : stopFluid(fluid),
  })))
  return items
}
