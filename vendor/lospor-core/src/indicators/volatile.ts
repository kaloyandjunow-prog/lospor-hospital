import type { AgentSegment, GasSettingsSegment } from "../intraop-types"
import { INTRAOP_COLUMN_MINUTES } from "../intraop-engine"

/**
 * An estimate of a case's anaesthetic gas footprint (10.0.0), in kilograms of
 * CO₂-equivalent over 100 years.
 *
 * Vaporiser output is fresh gas flow × dial concentration; in a circle system
 * that is, sooner or later, what reaches the atmosphere (the patient's uptake
 * is breathed out again). So each 5-minute column contributes
 * FGF × % × 5 min of vapour, converted to mass through its molar volume. It is
 * an estimate: the recorded concentration and flow stand for the whole column.
 *
 * Global warming potentials (100 years): sevoflurane 130, isoflurane 510,
 * desflurane 2540 (Sulbaek Andersen et al. 2012), nitrous oxide 273 (IPCC
 * AR6). Molar volume 24.04 L at 20 °C.
 */
const MOLAR_VOLUME_L = 24.04

type GasData = { molarMassG: number; gwp100: number }

const AGENTS: ReadonlyArray<{ pattern: RegExp; key: string } & GasData> = [
  { key: "sevoflurane", pattern: /sevo/i, molarMassG: 200.05, gwp100: 130 },
  { key: "desflurane", pattern: /desf/i, molarMassG: 168.04, gwp100: 2540 },
  { key: "isoflurane", pattern: /isof/i, molarMassG: 184.49, gwp100: 510 },
]
const N2O: GasData = { molarMassG: 44.013, gwp100: 273 }

export function volatileAgentKey(name: string): string | null {
  return AGENTS.find(agent => agent.pattern.test(name))?.key ?? null
}

function kgCo2e(vapourLitres: number, gas: GasData): number {
  return (vapourLitres / MOLAR_VOLUME_L) * gas.molarMassG * gas.gwp100 / 1000
}

/** The agent's concentration in a column: its latest change at or before it. */
function percentAt(segment: AgentSegment, column: number): number | null {
  const changes = (segment.percentChanges ?? []).filter(change => !change.planned && change.col <= column).sort((left, right) => right.col - left.col)
  const value = changes[0]?.percent ?? segment.percent
  return value != null && Number.isFinite(value) && value > 0 ? value : null
}

function gasAt(segments: readonly GasSettingsSegment[], column: number): { fgf: number; fiN2O: number } | null {
  for (const segment of segments) {
    if (segment.planned || column < segment.startCol || column > segment.endCol) continue
    const changes = (segment.settingsChanges ?? []).filter(change => !change.planned && change.col <= column).sort((left, right) => right.col - left.col)
    const current = changes[0] ?? segment
    const fiN2O = current.fiN2O ?? (current.carrierGas === "n2o" ? Math.max(0, 100 - current.fio2) : 0)
    return { fgf: current.fgf, fiN2O }
  }
  return null
}

export type GasFootprint = {
  /** kg CO₂e; null when an agent ran with no fresh gas flow recorded to work it out from. */
  kgCo2e: number | null
  agents: string[]
  nitrousOxide: boolean
}

export function gasFootprint(agents: readonly AgentSegment[], gasSettings: readonly GasSettingsSegment[] = []): GasFootprint {
  let total = 0
  let unknown = false
  const used = new Set<string>()
  for (const segment of agents) {
    if (segment.planned) continue
    const key = volatileAgentKey(segment.name)
    if (key) used.add(key)
    const gas = AGENTS.find(agent => agent.key === key)
    for (let column = segment.startCol; column <= segment.endCol; column += 1) {
      const percent = percentAt(segment, column)
      if (!gas || percent == null) continue
      const flow = gasAt(gasSettings, column)
      if (!flow) { unknown = true; continue }
      total += kgCo2e(flow.fgf * (percent / 100) * INTRAOP_COLUMN_MINUTES, gas)
    }
  }
  let nitrousOxide = false
  for (const segment of gasSettings) {
    if (segment.planned) continue
    for (let column = segment.startCol; column <= segment.endCol; column += 1) {
      const flow = gasAt([segment], column)
      if (!flow || flow.fiN2O <= 0) continue
      nitrousOxide = true
      total += kgCo2e(flow.fgf * (flow.fiN2O / 100) * INTRAOP_COLUMN_MINUTES, N2O)
    }
  }
  const any = used.size > 0 || nitrousOxide
  return { kgCo2e: any && !(unknown && total === 0) ? Math.round(total * 100) / 100 : any ? null : 0, agents: [...used], nitrousOxide }
}
