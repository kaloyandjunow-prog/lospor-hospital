import { useCallback, useRef, useState } from "react"
import { notify } from "@/lib/notify"
import type { LabResult } from "@/lib/labs"

type PatchIntraopSection = (payload: Record<string, unknown>) => Promise<unknown>

/**
 * Laboratory results drawn during the case.
 *
 * Unlike the fluid-status figures, these save the moment the sheet is
 * confirmed rather than when the tab is left. A draw is a discrete event
 * stamped with a time, the same shape as a vital or a drug, and a clinician who
 * records one and is then pulled away must not lose it to an unsaved buffer.
 *
 * The list is written whole. Each entry carries its own `takenAt`, so the
 * server sees one array and derives the draws from it -- there is no partial
 * "add a row" call that could interleave badly with an offline replay.
 */
export function useIntraopLabs(
  patchIntraopSection: PatchIntraopSection,
  errorLabel: string,
) {
  const [labResults, setLabResults] = useState<LabResult[]>([])
  const [labsSaving, setLabsSaving] = useState(false)
  // What the server is known to hold, so a sheet closed without edits issues
  // no write.
  const lastSavedRef = useRef<string | null>(null)

  /** Adopt the stored results without marking them dirty. */
  const hydrateLabs = useCallback((stored: LabResult[] | undefined) => {
    const next = stored ?? []
    setLabResults(next)
    lastSavedRef.current = JSON.stringify(next)
  }, [])

  /**
   * Resolves true once the list is on the server or durably queued for it,
   * false when it was refused or dropped. A queued, refused or failed write
   * used to count as saved: the hospital import then recorded its results as
   * accepted though the case never received them.
   */
  const saveLabs = useCallback(async (next: LabResult[]): Promise<boolean> => {
    setLabResults(next)
    const serialised = JSON.stringify(next)
    if (serialised === lastSavedRef.current) return true
    setLabsSaving(true)
    try {
      const outcome = (await patchIntraopSection({ labResults: next })) as { result?: string } | undefined
      if (outcome?.result === "saved") lastSavedRef.current = serialised
      return outcome?.result === "saved" || outcome?.result === "queued"
    } catch {
      // The local list keeps the edit so it is not lost off-screen; the outbox
      // retries the write. Telling the clinician is what stops a silent drop.
      notify(errorLabel, "")
      return false
    } finally {
      setLabsSaving(false)
    }
  }, [patchIntraopSection, errorLabel])

  return { labResults, labsSaving, hydrateLabs, saveLabs }
}
