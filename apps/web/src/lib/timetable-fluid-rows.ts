import { packLaneRows } from "@lospor/core/timetable"
import type { TimetableFluid } from "@/types/timetable"

export const FLUID_CAT_COLOR: Record<string, string> = {
  "Crystalloids": "#06b6d4",
  "Colloids": "#818cf8",
  "Blood products": "#fb7185",
  "Other": "#94a3b8",
}

export interface FluidLibraryGroup {
  cat: string
  fluids: { name: string }[]
}

export interface FluidLaneRow {
  label: string
  cat: string
  color: string
  segs: TimetableFluid[]
}

export function fluidColor(name: string, fluidGroups: FluidLibraryGroup[]): string {
  const cat = fluidCategory(name, fluidGroups)
  return FLUID_CAT_COLOR[cat] ?? "#94a3b8"
}

export function fluidCategory(name: string, fluidGroups: FluidLibraryGroup[]): string {
  for (const cat of fluidGroups) {
    if (cat.fluids.some(f => f.name === name)) return cat.cat
  }
  return "Other"
}

export function computeFluidRows(
  fluids: TimetableFluid[],
  fluidGroups: FluidLibraryGroup[],
): FluidLaneRow[] {
  const byCat = new Map<string, TimetableFluid[]>()
  for (const f of fluids) {
    const cat = f.category ?? fluidCategory(f.name, fluidGroups)
    const normalised = f.endCol < f.startCol ? { ...f, endCol: f.startCol } : f
    const list = byCat.get(cat) ?? []
    list.push(normalised)
    byCat.set(cat, list)
  }

  const rows: FluidLaneRow[] = []
  for (const [cat, catFluids] of byCat) {
    const lanes = packLaneRows(catFluids)
    const catColor = FLUID_CAT_COLOR[cat] ?? "#94a3b8"
    lanes.forEach((lane, idx) => {
      rows.push({ label: idx === 0 ? cat : `${cat} ${idx + 1}`, cat, color: catColor, segs: lane })
    })
  }
  return rows
}
