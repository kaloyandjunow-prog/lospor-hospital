import {
  newChartFluidsWithTimestamps as coreNewChartFluidsWithTimestamps,
  type NewChartFluidEvent as CoreNewChartFluidEvent,
} from "@lospor/core/intraop-totals"
import type { TimetableData, TimetableFluid } from "@/components/IntraopTimetable"

export {
  calculateFluidTotals,
  fluidTotalsKey,
  fluidTotalsPatch,
  type FluidTotals,
} from "@lospor/core/intraop-totals"

export type NewChartFluidEvent = {
  fluid: TimetableFluid
  ts: string
}

export function newChartFluidsWithTimestamps(
  previous: TimetableData,
  next: TimetableData,
  chartStart: Date,
): NewChartFluidEvent[] {
  return coreNewChartFluidsWithTimestamps(previous, next, chartStart) as CoreNewChartFluidEvent<TimetableFluid>[] as NewChartFluidEvent[]
}

