import { roundDown5Min } from "@/lib/intraop-projection"
import { newChartFluidsWithTimestamps } from "@/lib/intraop-chart-change"
import type { ActiveFluid, LogEvent } from "@/lib/intraop-log-event"
import type { TimetableData } from "@/components/IntraopTimetable"

type Save = (partial: Omit<LogEvent, "id" | "ts">, tsOverride?: string, silent?: boolean) => Promise<LogEvent | null>

export function applyIntraopChartChange({ start, timetable, next, onFluidStart, save, onChange }: {
  start: Date | null
  timetable: TimetableData
  next: TimetableData
  onFluidStart: (fluid: ActiveFluid) => void
  save: Save
  onChange: (data: TimetableData) => void
}) {
  if (start) {
    const base = roundDown5Min(start)
    for (const { fluid, ts } of newChartFluidsWithTimestamps(timetable, next, base)) {
      const bagVolumeMl = Number(fluid.volume)
      const bagVolume = Number.isFinite(bagVolumeMl) ? bagVolumeMl : undefined
      onFluidStart({ fluidId: fluid.id, name: fluid.name, volume: fluid.volume, color: fluid.color, fluidEntryMode: "VOLUME", bagVolumeMl: bagVolume, startTs: ts })
      void save({ type: "fluid_start", fluidId: fluid.id, name: fluid.name, volume: fluid.volume, color: fluid.color, category: fluid.category, fluidEntryMode: "VOLUME", bagVolumeMl: bagVolume }, ts, true)
    }
  }
  onChange(next)
}
