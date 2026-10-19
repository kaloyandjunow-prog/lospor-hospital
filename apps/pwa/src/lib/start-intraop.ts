import { canProgressAfterSave } from "@lospor/core/save-progression"
import { autosaveManager } from "@/lib/autosave-manager"
import { monthYearForDate } from "@/lib/intraop-timing"

/**
 * Opens the intraop record of a case whose preop is done: the move from
 * preop (or the preop summary) to intraop. Returns false when the save could
 * not be made good enough to build on; the caller keeps the clinician where
 * they are and says the save is pending.
 */
export async function startIntraop(caseId: string): Promise<boolean> {
  const transition = await autosaveManager.saveSection(
    caseId,
    "intraop",
    { monthYear: monthYearForDate(new Date()) },
    { partial: true },
  )
  return canProgressAfterSave(transition.result, { caseExistedBeforeSave: true }).canProgress
}
