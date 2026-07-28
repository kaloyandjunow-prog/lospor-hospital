import { timeAtCol } from "./intraop-projection"

export type RowQuickAddAction = "vital" | "bp" | "drug" | "infusion" | "fluid" | "agent" | "gas" | "event"

type RowQuickAddCallbacks = {
  openVitals: (mode: "full" | "bp", ts: string) => void
  openDrug: (ts: string) => void
  openInfusion: (ts: string) => void
  openFluid: (ts: string) => void
  openAgent: (ts: string) => void
  openGasSettings: (ts: string) => void
  openEvent: (date: Date) => void
}

export function slotIsoTimestamp(slot: Date | null | undefined): string | undefined {
  return slot?.toISOString()
}

export function dispatchRowQuickAdd(
  chartStart: Date,
  col: number,
  action: RowQuickAddAction,
  callbacks: RowQuickAddCallbacks,
): void {
  const date = timeAtCol(chartStart, col)
  const ts = date.toISOString()
  switch (action) {
    case "vital": callbacks.openVitals("full", ts); break
    case "bp": callbacks.openVitals("bp", ts); break
    case "drug": callbacks.openDrug(ts); break
    case "infusion": callbacks.openInfusion(ts); break
    case "fluid": callbacks.openFluid(ts); break
    case "agent": callbacks.openAgent(ts); break
    case "gas": callbacks.openGasSettings(ts); break
    case "event": callbacks.openEvent(date); break
  }
}
