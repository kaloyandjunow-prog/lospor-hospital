import { useState } from "react"
import * as Haptics from "expo-haptics"
import { notify } from "@/lib/notify"
import { formatComplications } from "@/lib/intraop-complications"
import { usePreferences } from "@/lib/preferences-context"

type PatchIntraopSection = (payload: Record<string, unknown>) => Promise<unknown>

/**
 * The old line of complications text and its notes (10.1.0). Complications
 * are added on the timeline as timed entries; this keeps what cases charted
 * before then hold, readable and deletable, with the notes beside them.
 */
export function useIntraopComplicationState(
  patchIntraopSection: PatchIntraopSection,
  errorLabel: string,
) {
  const { tc } = usePreferences()
  const [selectedComplications, setSelectedComplications] = useState<string[]>([])
  const [complicationsNotes, setComplicationsNotes] = useState("")

  /**
   * Deletes an item of the old line of text, kept on cases charted before
   * 10.1.0. New complications are timed entries in the log and are deleted
   * as events.
   */
  function removeLegacyComplication(label: string) {
    const next = selectedComplications.filter(item => item !== label)
    setSelectedComplications(next)
    patchIntraopSection({ complications: formatComplications(next, complicationsNotes) }).catch(() => {
      notify(errorLabel, tc("complicationsSaveFailed"))
    })
  }

  /** Saves the notes, with the old items beside them. */
  async function saveComplications() {
    try {
      const complications = formatComplications(selectedComplications, complicationsNotes)
      await patchIntraopSection({ complications })
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {})
    } catch {
      notify(errorLabel, tc("complicationsSaveFailed"))
    }
  }

  return {
    selectedComplications,
    setSelectedComplications,
    complicationsNotes,
    setComplicationsNotes,
    removeLegacyComplication,
    saveComplications,
  }
}
