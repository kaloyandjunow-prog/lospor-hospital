// Per-case write serialization: all writes for the same case run one at a
// time (in order), while writes for different cases proceed in parallel.
// Generalized from lospor-mobile's intraop-write-queue (v4.1.6) so both apps
// and all sections share the same collision defense.

import { createSingleFlightQueue, type SingleFlightQueue } from "./single-flight-queue"

export type CaseWriteQueue = {
  enqueue: <T>(caseId: string, operation: () => Promise<T>) => Promise<T>
  idle: (caseId: string) => Promise<void>
  clear: () => void
}

export function createCaseWriteQueue(): CaseWriteQueue {
  const queues = new Map<string, SingleFlightQueue>()

  function queueForCase(caseId: string): SingleFlightQueue {
    const existing = queues.get(caseId)
    if (existing) return existing
    const queue = createSingleFlightQueue()
    queues.set(caseId, queue)
    return queue
  }

  return {
    enqueue<T>(caseId: string, operation: () => Promise<T>): Promise<T> {
      return queueForCase(caseId).enqueue(operation)
    },
    idle(caseId: string): Promise<void> {
      return queueForCase(caseId).idle()
    },
    clear(): void {
      queues.clear()
    },
  }
}
