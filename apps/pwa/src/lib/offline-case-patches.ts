// Compatibility facade for existing screens. The v5.6 Autosave Manager owns
// the durable outbox, revisions, ordering, and replay; callers keep the old
// function names while no longer creating their own save pipeline.
import {
  type BaseUpdatedAtInput,
  type CasePatchResponse,
  type CasePatchResult,
  type CaseSection,
  type OutboxSummary,
  type SectionRevision,
} from "@lospor/core/sync"

import { autosaveManager } from "./autosave-manager"

export type CasePatchSection = CaseSection
export type { CasePatchResult, CasePatchResponse }
export type QueueSummary = OutboxSummary

function resolveRevision(input?: BaseUpdatedAtInput): SectionRevision | undefined {
  return typeof input === "function" ? input() : input
}

export function getQueuedCasePatchSummary(): Promise<QueueSummary> {
  return autosaveManager.outbox.summary()
}

export function getQueuedCaseIds(): Promise<string[]> {
  return autosaveManager.outbox.queuedCaseIds()
}

export function clearAllQueuedCasePatches(): Promise<number> {
  return autosaveManager.outbox.clearAll()
}

export async function queueCasePatch(
  caseId: string,
  section: CasePatchSection,
  payload: unknown,
  baseUpdatedAt?: BaseUpdatedAtInput,
): Promise<void> {
  const revision = resolveRevision(baseUpdatedAt)
  if (revision != null) autosaveManager.setRevision(caseId, section, revision)
  await autosaveManager.outbox.queue(caseId, section, payload, revision)
}

export function reconcileQueue(): Promise<void> {
  return autosaveManager.outbox.reconcile()
}

export function clearQueuedCasePatch(caseId: string, section: CasePatchSection): Promise<void> {
  return autosaveManager.outbox.clearOne(caseId, section)
}

export function clearAllQueuedPatchesForCase(caseId: string): Promise<void> {
  return autosaveManager.discardCase(caseId)
}

export function loadQueuedCasePatch<T = unknown>(
  caseId: string,
  section: CasePatchSection,
): Promise<T | null> {
  return autosaveManager.outbox.load<T>(caseId, section)
}

export async function saveCasePatchWithQueue(
  caseId: string,
  section: CasePatchSection,
  payload: unknown,
  baseUpdatedAt?: BaseUpdatedAtInput,
): Promise<{ result: CasePatchResult; response?: CasePatchResponse }> {
  const revision = resolveRevision(baseUpdatedAt)
  if (revision != null) autosaveManager.setRevision(caseId, section, revision)
  return autosaveManager.saveSection(caseId, section, payload as Record<string, unknown>, {
    partial: true,
  })
}

export function flushQueuedCasePatch(
  caseId: string,
  section: CasePatchSection,
): Promise<{ result: CasePatchResult; response?: CasePatchResponse }> {
  return autosaveManager.outbox.flushOne(caseId, section)
}

export async function flushAllQueuedCasePatches(): Promise<{
  saved: number
  failed: number
  discarded: number
}> {
  return autosaveManager.outbox.flushAll()
}
