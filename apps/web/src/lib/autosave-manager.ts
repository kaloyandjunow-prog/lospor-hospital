"use client"

import {
  createAutosaveManager,
  eventIdempotencyKey,
  IDEMPOTENCY_HEADER,
  OPERATION_ID_HEADER,
  SOURCE_HEADER,
  buildSectionRevisionHeaders,
  readBlockedSaveIssue,
  serverVersionRevision,
  type BlockedSaveIssue,
  type EventMutation,
  type OutboxSummary,
  type PatchFailure,
  type SectionRevision,
} from "@lospor/core/sync"

import { idbKV } from "./kv-idb"

export class AutosaveHttpError extends Error {
  constructor(
    public status: number,
    public serverRevision?: SectionRevision,
    public blocked?: BlockedSaveIssue,
    message = `Save failed (HTTP ${status})`,
  ) {
    super(message)
  }
}

/**
 * Exported for testing: this is where a failed save is decided to be retryable
 * (network), a conflict carrying the server's revision, or unrecoverable. Get
 * the 409 branch wrong and stale-write detection silently stops working.
 */
export function classifyError(error: unknown): PatchFailure {
  if (error instanceof TypeError) return { kind: "network" }
  if (error instanceof AutosaveHttpError) {
    return {
      kind: "http",
      status: error.status,
      blocked: error.blocked,
      message: error.message,
      ...(typeof error.serverRevision === "number"
        ? { serverRevision: error.serverRevision }
        : typeof error.serverRevision === "string"
          ? { serverUpdatedAt: error.serverRevision }
          : {}),
    }
  }
  return { kind: "other" }
}

const patchListeners = new Set<(summary: OutboxSummary) => void>()
const eventListeners = new Set<(count: number) => void>()
let pendingEventCount = 0
let pendingMutationCount = 0

function emitEventCount(): void {
  const count = pendingEventCount + pendingMutationCount
  for (const listener of eventListeners) {
    try { listener(count) } catch { /* status UI cannot break saving */ }
  }
}

async function sendMutation(operation: EventMutation, revision: SectionRevision) {
  const response = await fetch(
    `/api/cases/${operation.caseId}/events/${encodeURIComponent(operation.eventId)}`,
    {
      method: operation.kind === "event.delete" ? "DELETE" : "PUT",
      headers: {
        "Content-Type": "application/json",
        [SOURCE_HEADER]: "web",
        [OPERATION_ID_HEADER]: operation.operationId,
        ...buildSectionRevisionHeaders("intraop", revision),
      },
      body: operation.kind === "event.upsert" ? JSON.stringify(operation.event) : undefined,
    },
  )
  const body = await response.json().catch(() => ({})) as {
    intraopRevision?: unknown
    intraopUpdatedAt?: unknown
  }
  return {
    ok: response.ok,
    status: response.status,
    revision:
      typeof body.intraopRevision === "number" ? body.intraopRevision :
      typeof body.intraopUpdatedAt === "string" ? body.intraopUpdatedAt :
      undefined,
    serverRevision: serverVersionRevision(body) ?? undefined,
  }
}

export const autosaveManager = createAutosaveManager({
  outbox: {
    kv: idbKV,
    sendPatch: async (caseId, section, payload, revision) => {
      const payloadRecord = payload && typeof payload === "object"
        ? payload as Record<string, unknown>
        : {}
      const response = await fetch(`/api/cases/${caseId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...buildSectionRevisionHeaders(section, revision),
        },
        body: JSON.stringify({
          ...(section === "preop" && payloadRecord.clinicalMode
            ? { clinicalMode: payloadRecord.clinicalMode }
            : {}),
          [section]: payload,
        }),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) {
        const message = body && typeof body === "object" && typeof (body as { error?: unknown }).error === "string"
          ? (body as { error: string }).error
          : `Save failed (HTTP ${response.status})`
        throw new AutosaveHttpError(
          response.status,
          serverVersionRevision(body) ?? undefined,
          readBlockedSaveIssue(body) ?? undefined,
          message,
        )
      }
      return body
    },
    classifyError,
    onChange: (summary) => {
      for (const listener of patchListeners) {
        try { listener(summary) } catch { /* status UI cannot break saving */ }
      }
    },
  },
  pendingEvents: {
    kv: idbKV,
    postEvent: async (caseId, event, revision) => {
      const response = await fetch(`/api/cases/${caseId}/events`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(event.id ? { [IDEMPOTENCY_HEADER]: eventIdempotencyKey(caseId, String(event.id)) } : {}),
          [SOURCE_HEADER]: "web",
          ...buildSectionRevisionHeaders("intraop", revision),
        },
        body: JSON.stringify(event),
      })
      const body = await response.json().catch(() => ({})) as {
        intraopRevision?: unknown
        intraopUpdatedAt?: unknown
        serverVersion?: { revision?: unknown; updatedAt?: unknown }
      }
      return {
        ok: response.ok,
        status: response.status,
        revision:
          typeof body.intraopRevision === "number" ? body.intraopRevision :
          typeof body.intraopUpdatedAt === "string" ? body.intraopUpdatedAt :
          null,
        serverRevision:
          typeof body.serverVersion?.revision === "number" ? body.serverVersion.revision :
          typeof body.serverVersion?.updatedAt === "string" ? body.serverVersion.updatedAt :
          undefined,
      }
    },
    isNetworkError: (error) => error instanceof TypeError,
    onChange: (count) => {
      pendingEventCount = count
      emitEventCount()
    },
  },
  eventMutations: {
    kv: idbKV,
    send: sendMutation,
    isNetworkError: (error) => error instanceof TypeError,
    onChange: (count) => {
      pendingMutationCount = count
      emitEventCount()
    },
  },
})

export function onPatchOutboxChange(listener: (summary: OutboxSummary) => void): () => void {
  patchListeners.add(listener)
  return () => { patchListeners.delete(listener) }
}

export function onEventJournalChange(listener: (count: number) => void): () => void {
  eventListeners.add(listener)
  return () => { eventListeners.delete(listener) }
}

export function isNetworkSaveError(error: unknown): boolean {
  return error instanceof TypeError
}
