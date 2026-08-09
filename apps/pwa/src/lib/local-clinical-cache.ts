import { clearAllLocalCaseDrafts } from "./local-case-store"
import { clearAllQueuedCasePatches } from "./offline-case-patches"
import { clearAllPendingIntraopEvents } from "./pending-intraop-events"
import { autosaveManager } from "./autosave-manager"
import { clearClinicalRulesSnapshots } from "./pediatric-clinical-rules"
import { clearMobileClinicalPreferences } from "./clinical-preferences-mobile"

export async function clearLocalClinicalCache(): Promise<{ drafts: number; patches: number; intraopQueues: number }> {
  const [drafts, patches, pendingEvents, pendingMutations] = await Promise.all([
    clearAllLocalCaseDrafts(),
    clearAllQueuedCasePatches(),
    clearAllPendingIntraopEvents(),
    autosaveManager.eventMutations.clearAll(),
    clearClinicalRulesSnapshots(),
    // Settings, not case data — but they are per-account, and leaving them on
    // the device let the next person to sign in inherit them.
    clearMobileClinicalPreferences(),
  ])
  return { drafts, patches, intraopQueues: pendingEvents + pendingMutations }
}
