import type { Dispatch, SetStateAction } from "react"
import { resolveEndDrop } from "@/components/intraop/end-drag"

export type PendingStop = { kind: "agent" | "infusion" | "fluid"; id: string; col: number; name: string }
type Segment = { id?: string; startCol: number; endCol: number; stopped?: boolean; name: string }

export function createEndDropHandlers({ agents, infusions, fluids, nowCol, setPendingStop, extendAgent, resumeAgent, extendInfusion, restoreInfusion, extendFluid, resumeFluid }: {
  agents: Segment[]
  infusions: Segment[]
  fluids: Segment[]
  nowCol: number | null
  setPendingStop: Dispatch<SetStateAction<PendingStop | null>>
  extendAgent: (startCol: number, endCol: number) => void
  resumeAgent: (startCol: number) => void
  extendInfusion: (id: string, endCol: number) => void
  restoreInfusion: (id: string) => void
  extendFluid: (id: string, endCol: number) => void
  resumeFluid: (id: string) => void
}) {
  function handleEndDrop(kind: PendingStop["kind"], id: string, dropCol: number) {
    const seg = kind === "agent" ? agents.find(item => item.startCol === Number(id)) : (kind === "infusion" ? infusions : fluids).find(item => item.id === id)
    if (!seg) return
    const outcome = resolveEndDrop({ stopped: !!seg.stopped, startCol: seg.startCol, endCol: seg.endCol, dropCol, nowCol })
    if (outcome.kind === "none") return
    if (outcome.kind === "confirm-stop") { setPendingStop({ kind, id, col: outcome.col, name: seg.name }); return }
    if (outcome.kind === "move-stop") {
      if (kind === "agent") extendAgent(Number(id), outcome.col)
      else if (kind === "infusion") extendInfusion(id, outcome.col)
      else extendFluid(id, outcome.col)
      return
    }
    if (kind === "agent") resumeAgent(Number(id))
    else if (kind === "infusion") restoreInfusion(id)
    else resumeFluid(id)
  }
  function confirmPendingStop(pending: PendingStop | null) {
    if (!pending) return
    if (pending.kind === "agent") extendAgent(Number(pending.id), pending.col)
    else if (pending.kind === "infusion") extendInfusion(pending.id, pending.col)
    else extendFluid(pending.id, pending.col)
    setPendingStop(null)
  }
  return { handleEndDrop, confirmPendingStop }
}
