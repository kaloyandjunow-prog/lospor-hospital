import type { TimetableData, TimetableFluid } from "@/components/IntraopTimetable"

/** What the End case dialog decided about everything still running. */
export type EndCaseResult = {
  continuedItems: string[]
  infusionTotals: { name: string; total: number; unit: string }[]
  discontinuedAgentCols: number[]
  discontinuedInfusionIds: string[]
  finalizedFluidWithAmounts: { id: string; amount: number; category: string; endTs: string }[]
  discontinuedGasIds: string[]
  /** 10.8.0: keys (agent-col, inf-id, fluid-id, gas-id) of what goes on after the case. */
  continuesAfterEnd?: string[]
}

/**
 * The chart after the End case dialog: the discontinued agents, infusions and
 * gas settings stop at the current column, and each ended fluid is stamped with
 * the volume actually infused so the summary reads that, not the bag size.
 * One combined read and one combined write, so discontinuing several kinds of
 * item at once cannot overwrite itself from a stale closure.
 */
export function chartAfterEndCase(
  d: TimetableData,
  result: EndCaseResult,
  col: number,
  finalizedFluid: (fluid: TimetableFluid, amount: number, endTs: string, endCol: number) => TimetableFluid,
): TimetableData {
  const agentCols = new Set(result.discontinuedAgentCols)
  const infusionIds = new Set(result.discontinuedInfusionIds)
  const gasIds = new Set(result.discontinuedGasIds)
  const endedFluidById = new Map(result.finalizedFluidWithAmounts.map(fluid => [fluid.id, fluid]))
  const goesOn = new Set(result.continuesAfterEnd ?? [])
  const after = (key: string) => goesOn.has(key) ? { continuesAfterEnd: true as const } : {}
  return {
    ...d,
    agents: d.agents.map(a => agentCols.has(a.startCol) ? { ...a, endCol: col, stopped: true as const, endCaseStop: true, ...after(`agent-${a.startCol}`) } : a),
    infusions: (d.infusions ?? []).map(i => infusionIds.has(i.id) ? { ...i, endCol: col, stopped: true as const, endCaseStop: true, ...after(`inf-${i.id}`) } : i),
    fluids: (d.fluids ?? []).map(fluid => {
      const ended = endedFluidById.get(fluid.id)
      return ended ? { ...finalizedFluid(fluid, ended.amount, ended.endTs, col), endCaseStop: true, ...after(`fluid-${fluid.id}`) } : fluid
    }),
    gasSettings: (d.gasSettings ?? []).map(g => gasIds.has(g.id) ? { ...g, endCol: col, stopped: true as const, endCaseStop: true, ...after(`gas-${g.id}`) } : g),
  }
}
