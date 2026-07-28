// Thin adapter over the shared per-case write queue in @lospor/core/sync.
// One app-wide instance: ALL case writes (events, section patches, flushes)
// are serialized per case through this queue.
import { autosaveManager } from "@/lib/autosave-manager"

export function enqueueIntraopCaseWrite<T>(
  caseId: string,
  operation: () => Promise<T>,
): Promise<T> {
  return autosaveManager.runExclusive(caseId, operation)
}

export function waitForIntraopCaseWrites(caseId: string): Promise<void> {
  return autosaveManager.waitForCase(caseId)
}

export function clearIntraopWriteQueuesForTest(): void {
  autosaveManager.clearQueues()
}
