import { clearAllLocalCaseDrafts } from "./local-case-store"
import { clearAllQueuedCasePatches } from "./offline-case-patches"
import { clearAllPendingIntraopEvents } from "./pending-intraop-events"
import { autosaveManager } from "./autosave-manager"

export async function clearLocalClinicalCache(): Promise<{ drafts: number; patches: number; intraopQueues: number }> {
  const [drafts, patches, pendingEvents, pendingMutations] = await Promise.all([
    clearAllLocalCaseDrafts(),
    clearAllQueuedCasePatches(),
    clearAllPendingIntraopEvents(),
    autosaveManager.eventMutations.clearAll(),
  ])
  return { drafts, patches, intraopQueues: pendingEvents + pendingMutations }
}
