import { useState } from "react"
import type { LogEvent } from "@/lib/intraop-log-event"

type ActiveAgent = { name: string; color: string; percent?: number } | null

// Volatile agent on/off, plus Fi(agent)% — agents always dose in %, no
// unit/route rows. `save` is the shared persistence engine owned by the main
// screen (sync state, offline queue, etc.) — every domain hook receives it
// rather than re-implementing persistence.
export function useAgentEntry(
  save: (partial: Omit<LogEvent, "id" | "ts">, tsOverride?: string, silent?: boolean) => Promise<LogEvent>,
  setEntryTs: (ts: string | null) => void,
  activeAgent: ActiveAgent,
  setActiveAgent: (a: ActiveAgent) => void,
) {
  const [agOpen, setAgOpen] = useState(false)
  const [agPick, setAgPick] = useState<{ name: string; color: string } | null>(null)
  const [agPercent, setAgPercent] = useState<number | null>(null)

  function openAgent(ts?: string) {
    setEntryTs(ts ?? null)
    setAgOpen(true)
  }

  function confirmAgent() {
    if (!agPick) return
    const prev = activeAgent
    const pick = agPick
    const percent = agPercent ?? undefined
    // Optimistic switch + close the sheet synchronously, then persist. The two
    // saves run in order inside the IIFE so the stop precedes the start in the log.
    setActiveAgent({ name: pick.name, color: pick.color, percent })
    setAgOpen(false); setAgPick(null); setAgPercent(null)
    void (async () => {
      if (prev && prev.name !== pick.name)
        await save({ type: "agent_stop", name: prev.name, color: prev.color })
      await save({ type: "agent_start", name: pick.name, color: pick.color, value: percent !== undefined ? String(percent) : undefined })
    })()
  }

  async function stopAgent() {
    if (!activeAgent) return
    const a = activeAgent
    setActiveAgent(null)
    await save({ type: "agent_stop", name: a.name, color: a.color })
  }

  return { agOpen, setAgOpen, agPick, setAgPick, agPercent, setAgPercent, openAgent, confirmAgent, stopAgent }
}
