import type { LogEvent } from "@lospor/core/intraop-types"

/** 10.8.0: the one menu of the chart, the row and the event log (useIntraopCellMenu). */
export type IntraopCellMenuApi = {
  openContinuous: (cell: { kind: "agent" | "gas" | "jet" | "infusion" | "fluid"; key: string; col: number; title: string }) => void
  openEvent: (event: LogEvent, title: string) => void
}

/** The kind and key a drawn running item stands for, from its id. */
export function runningItemRef(id: string, activeAgents: { name: string }[]): { kind: "agent" | "gas" | "jet" | "infusion" | "fluid"; key: string } | null {
  if (id.startsWith("inf-")) return { kind: "infusion", key: id.slice(4) }
  if (id.startsWith("fluid-")) return { kind: "fluid", key: id.slice(6) }
  if (id.startsWith("agent-")) return { kind: "agent", key: id.slice(6) }
  if (id === "jet" || id.startsWith("jet-")) return { kind: "jet", key: "jet" }
  if (id.startsWith("gas")) return { kind: "gas", key: "gas" }
  const agent = activeAgents.find(candidate => id.includes(candidate.name))
  return agent ? { kind: "agent", key: agent.name } : null
}

/** What a tap on anything in an opened row does: open that item's menu (undefined without the menu, so the older paths stay). */
export function rowMenuHandlers(menu: IntraopCellMenuApi | undefined, activeAgents: { name: string }[], labelOf: (event: LogEvent) => string) {
  if (!menu) return { onOpenRunning: undefined, onOpenEvent: undefined, onOpenStopped: undefined }
  return {
    onOpenRunning: (item: { id: string; label: string }, col: number) => {
      const ref = runningItemRef(item.id, activeAgents)
      if (ref) menu.openContinuous({ ...ref, col, title: item.label })
    },
    onOpenEvent: (event: LogEvent) => menu.openEvent(event, labelOf(event)),
    onOpenStopped: (id: string, col: number, title?: string) => {
      const [kind, ...key] = id.split(":")
      // The chip's own name, not the item's key (an infusion's key is its id).
      menu.openContinuous({ kind: kind as "agent", key: key.join(":"), col, title: title ?? key.join(":") })
    },
  }
}
