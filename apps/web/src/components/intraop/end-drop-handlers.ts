import type { ContinuousTarget } from "@/components/intraop/TimetableMenuHost"

type Segment = { id?: string; startCol: number; endCol: number; stopped?: boolean; name: string }
export type EndDropKind = "agent" | "infusion" | "fluid"

/**
 * Dropping the end grip of an agent, infusion or fluid bar (10.8.0, rule 6): the menu's own stop / fix-end,
 * so the gesture writes the same events as the menu and leaves the same Undo bar. No question is asked.
 * `endDrop` is the host's (TimetableMenuHost.api.endDrop), reached through a ref because the chart
 * that makes these handlers renders the host.
 */
export function createEndDropHandlers({ agents, infusions, fluids, endDrop }: {
  agents: Segment[]
  infusions: Segment[]
  fluids: Segment[]
  endDrop: (target: ContinuousTarget, stopped: boolean) => void
}) {
  function handleEndDrop(kind: EndDropKind, id: string, dropCol: number) {
    const seg = kind === "agent" ? agents.find(item => item.startCol === Number(id)) : (kind === "infusion" ? infusions : fluids).find(item => item.id === id)
    if (!seg) return
    const col = Math.max(dropCol, seg.startCol)
    // Let go where it already ends: nothing moved, nothing is written (a running bar is not stopped by a slip).
    if (col === seg.endCol) return
    const anchor = document.querySelector<HTMLElement>("[data-tt-armed]")?.getBoundingClientRect()
    endDrop({ kind, key: kind === "agent" ? seg.name : id, col, title: seg.name, rect: anchor ?? new DOMRect(window.innerWidth / 2, window.innerHeight / 2, 0, 0) }, !!seg.stopped)
  }
  return { handleEndDrop }
}
