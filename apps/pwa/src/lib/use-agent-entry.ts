import { useState } from "react"

import { formatMessage } from "@/i18n/locale"
import { atRow, type SaveIntraopEvent } from "@/lib/intraop-stamp"
import { actionSheet } from "@/lib/notify"
import { usePreferences } from "@/lib/preferences-context"
import type { RunningAgent } from "@/lib/use-intraop-running-state"

type StopOptions = { exactTs?: string; endCaseStop?: boolean }

// Volatile agents on/off, plus Fi(agent)% — agents always dose in %, no
// unit/route rows. Several may run at once (1.4.9): every event is marked
// "concurrent" and a stop names its agent. Starting one while another runs
// asks whether to switch (an explicit stop of the other, same time) or run
// both. `save` is the shared persistence engine owned by the main screen.
export function useAgentEntry(
  save: SaveIntraopEvent,
  setEntryTs: (ts: string | null) => void,
  activeAgents: RunningAgent[],
  setActiveAgents: (updater: (prev: RunningAgent[]) => RunningAgent[]) => void,
) {
  const { tc } = usePreferences()
  const [agOpen, setAgOpen] = useState(false)
  const [agPick, setAgPick] = useState<{ name: string; color: string } | null>(null)
  const [agPercent, setAgPercent] = useState<number | null>(null)
  // The row the sheet was opened from (null = now), kept here so a switch's
  // stop and start share one time.
  const [agTs, setAgTs] = useState<string | null>(null)

  function openAgent(ts?: string) {
    setEntryTs(ts ?? null)
    setAgTs(ts ?? null)
    setAgOpen(true)
  }

  function startPicked(pick: { name: string; color: string }, percent: number | undefined, stopOthers: RunningAgent[]) {
    const stopped = new Set(stopOthers.map(agent => agent.name))
    setActiveAgents(prev => [
      ...prev.filter(agent => agent.name !== pick.name && !stopped.has(agent.name)),
      { name: pick.name, color: pick.color, percent },
    ])
    const at = atRow(agTs)
    void (async () => {
      for (const other of stopOthers) {
        await save({ type: "agent_stop", name: other.name, color: other.color, agentMode: "concurrent" }, at)
      }
      await save({
        type: "agent_start",
        name: pick.name,
        color: pick.color,
        value: percent !== undefined ? String(percent) : undefined,
        agentMode: "concurrent",
      }, at)
    })()
  }

  function confirmAgent() {
    if (!agPick) return
    const pick = agPick
    const percent = agPercent ?? undefined
    const others = activeAgents.filter(agent => agent.name !== pick.name)
    setAgOpen(false); setAgPick(null); setAgPercent(null)
    if (others.length === 0) {
      startPicked(pick, percent, [])
      return
    }
    // Switching is an explicit choice, never implied by starting another agent.
    actionSheet(
      formatMessage(tc("agentSwitchTitle"), { name: others.map(agent => agent.name).join(", ") }),
      undefined,
      [
        {
          label: formatMessage(tc("agentSwitchFrom"), { name: others.map(agent => agent.name).join(", ") }),
          onPress: () => startPicked(pick, percent, others),
        },
        { label: tc("agentRunBoth"), onPress: () => startPicked(pick, percent, []) },
        { label: tc("cancelLabel"), cancel: true },
      ],
    )
  }

  // rowTs: the row the stop was entered in (null = now).
  async function stopAgent(name?: string, rowTs?: string | null, options: StopOptions = {}) {
    const target = name
      ? activeAgents.find(agent => agent.name === name)
      : activeAgents[activeAgents.length - 1]
    if (!target) return
    setActiveAgents(prev => prev.filter(agent => agent.name !== target.name))
    await save({
      type: "agent_stop",
      name: target.name,
      color: target.color,
      agentMode: "concurrent",
      ...(options.endCaseStop ? { endCaseStop: true } : {}),
    }, options.exactTs ?? atRow(rowTs))
  }

  return { agOpen, setAgOpen, agPick, setAgPick, agPercent, setAgPercent, openAgent, confirmAgent, stopAgent }
}
