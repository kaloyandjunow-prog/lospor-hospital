import type { ActiveAgent } from "./intraop-active-state"
import type { ActiveFluid, ActiveGasSettings, ActiveInfusion } from "./intraop-log-event"

export type EndCaseRunningItem = {
  key: string
  label: string
  sublabel: string
  color: string
  onStop: () => void | Promise<void>
}

type BuildEndCaseRunningItemsInput = {
  activeAgent: ActiveAgent
  activeGas: ActiveGasSettings
  activeInfusions: ActiveInfusion[]
  activeFluids: ActiveFluid[]
  stopAgent: () => void | Promise<void>
  stopGasSettings: () => void | Promise<void>
  stopInfusion: (infusion: ActiveInfusion) => void | Promise<void>
  stopFluid: (fluid: ActiveFluid) => void | Promise<void>
}

export function hasEndCaseRunningItems({
  activeAgent,
  activeGas,
  activeInfusions,
  activeFluids,
}: Pick<BuildEndCaseRunningItemsInput, "activeAgent" | "activeGas" | "activeInfusions" | "activeFluids">): boolean {
  return activeInfusions.length > 0 || activeFluids.length > 0 || !!activeAgent || !!activeGas
}

export function buildEndCaseRunningItems({
  activeAgent,
  activeGas,
  activeInfusions,
  activeFluids,
  stopAgent,
  stopGasSettings,
  stopInfusion,
  stopFluid,
}: BuildEndCaseRunningItemsInput): EndCaseRunningItem[] {
  const items: EndCaseRunningItem[] = []
  if (activeAgent) items.push({
    key: `agent-${activeAgent.name}`,
    label: activeAgent.name,
    sublabel: "Volatile - inhalational",
    color: activeAgent.color,
    onStop: stopAgent,
  })
  if (activeGas) items.push({
    key: "gas-settings",
    label: "Gas settings",
    sublabel: `FGF ${activeGas.fgf}L/min - FiO2 ${activeGas.fio2}%`,
    color: "#6366f1",
    onStop: stopGasSettings,
  })
  items.push(...activeInfusions.map(infusion => ({
    key: `inf-${infusion.infId}`,
    label: infusion.name,
    sublabel: `${infusion.rate} ${infusion.unit} - infusion`,
    color: infusion.color,
    onStop: () => stopInfusion(infusion),
  })))
  items.push(...activeFluids.map(fluid => ({
    key: `fluid-${fluid.fluidId}`,
    label: fluid.name,
    sublabel: `${fluid.volume} mL - fluid`,
    color: fluid.color,
    onStop: () => stopFluid(fluid),
  })))
  return items
}
