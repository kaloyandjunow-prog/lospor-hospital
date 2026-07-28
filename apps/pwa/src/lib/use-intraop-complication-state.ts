import { useState } from "react"
import * as Haptics from "expo-haptics"
import { notify } from "@/lib/notify"
import { addComplicationLabel, formatComplications, toggleComplicationLabel } from "@/lib/intraop-complications"

type PatchIntraopSection = (payload: Record<string, unknown>) => Promise<unknown>

export function useIntraopComplicationState(
  patchIntraopSection: PatchIntraopSection,
  errorLabel: string,
) {
  const [compOpen, setCompOpen] = useState(false)
  const [selectedComplications, setSelectedComplications] = useState<string[]>([])
  const [complicationsNotes, setComplicationsNotes] = useState("")
  const [compGroupExpanded, setCompGroupExpanded] = useState<Record<string, boolean>>({})
  const [compSaving, setCompSaving] = useState(false)

  function addComplicationFromEvent(label: string) {
    const next = addComplicationLabel(selectedComplications, label)
    if (!next) return
    setSelectedComplications(next)
    patchIntraopSection({ complications: formatComplications(next, complicationsNotes) }).catch(() => {})
  }

  async function saveComplications() {
    setCompSaving(true)
    try {
      const complications = formatComplications(selectedComplications, complicationsNotes)
      await patchIntraopSection({ complications })
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {})
      setCompOpen(false)
    } catch {
      notify(errorLabel, "Could not save complications.")
    } finally {
      setCompSaving(false)
    }
  }

  function toggleComplication(item: string) {
    setSelectedComplications(prev => toggleComplicationLabel(prev, item))
  }

  function toggleComplicationGroup(groupId: string) {
    setCompGroupExpanded(prev => ({ ...prev, [groupId]: !prev[groupId] }))
  }

  return {
    compOpen,
    setCompOpen,
    selectedComplications,
    setSelectedComplications,
    complicationsNotes,
    setComplicationsNotes,
    compGroupExpanded,
    compSaving,
    addComplicationFromEvent,
    saveComplications,
    toggleComplication,
    toggleComplicationGroup,
  }
}
