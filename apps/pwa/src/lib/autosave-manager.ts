import {
  createAutosaveManager,
  eventIdempotencyKey,
  IDEMPOTENCY_HEADER,
  OPERATION_ID_HEADER,
  SOURCE_HEADER,
  buildSectionRevisionHeaders,
  readBlockedSaveIssue,
  serverVersionRevision,
  type EventMutation,
  type KVAdapter,
  type PatchFailure,
  type SectionRevision,
} from "@lospor/core/sync"

import { ApiError, apiFetch } from "./api"
import { clinicalSyncKv } from "./clinical-sync-kv"

const kv: KVAdapter = clinicalSyncKv

/**
 * How long a save waits for the server before giving up and queueing.
 *
 * Briefly lowered to 3 s on the theory that falling back to the durable queue
 * faster was strictly better. It is not: a healthy save over mobile data
 * regularly takes longer than 3 s, so the abort was classified as a network
 * failure, tripped the offline circuit breaker, and the app announced "Offline"
 * while it was online and saving fine. Telling a clinician their work is not
 * reaching the server, when it is, is worse than waiting a few more seconds.
 *
 * The circuit breaker below is what stops this being paid repeatedly: the full
 * wait happens once, then saves queue immediately until the cooldown expires.
 */
const AUTOSAVE_NETWORK_TIMEOUT_MS = 8_000

/**
 * How long autosave stops attempting the network after a failure.
 *
 * Deliberately shorter than the 15 s queued-save flush interval, so every flush
 * cycle still gets one real attempt and a recovered network is picked up on the
 * next tick rather than being locked out.
 */
const NETWORK_COOLDOWN_MS = 10_000

/**
 * Autosave used to spend the full timeout on every save while the API was
 * unreachable, and intraop writes serialise per case — so one unreachable save
 * stalled everything queued behind it, and the delay was paid again for the
 * next save, and the next. The screen froze for seconds at a time while the
 * answer ("we are offline") was already known.
 *
 * After a network failure, saves now go straight to the durable outbox without
 * touching the network until the cooldown expires. This is safe precisely
 * because the outbox exists: a save that never reaches the network is queued
 * and retried, not lost.
 */
let networkDownUntil = 0

function networkIsDown(): boolean {
  return Date.now() < networkDownUntil
}

function tripNetworkBreaker(): void {
  networkDownUntil = Date.now() + NETWORK_COOLDOWN_MS
}

/** Returning to the foreground is a fresh chance — forget the cooldown. */
export function resetAutosaveNetworkBreaker(): void {
  networkDownUntil = 0
}

/** Diagnostics: whether autosave is currently skipping the network, and until when. */
export function autosaveNetworkState(): { down: boolean; downUntil: number } {
  return { down: networkIsDown(), downUntil: networkDownUntil }
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError"
}

async function autosaveFetch(path: string, init: RequestInit): Promise<Response> {
  if (networkIsDown()) {
    throw new ApiError("Offline — save queued", 0, "NETWORK")
  }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), AUTOSAVE_NETWORK_TIMEOUT_MS)
  try {
    const response = await apiFetch(path, { ...init, signal: controller.signal })
    // The server answered — even a 4xx/5xx proves the network is up.
    resetAutosaveNetworkBreaker()
    return response
  } catch (error) {
    if (isAbortError(error)) {
      tripNetworkBreaker()
      throw new ApiError("Network request timed out", 0, "NETWORK")
    }
    if (error instanceof TypeError || (error instanceof ApiError && error.code === "NETWORK")) {
      tripNetworkBreaker()
    }
    throw error
  } finally {
    clearTimeout(timer)
  }
}

function classifyPatchError(error: unknown): PatchFailure {
  if (error instanceof TypeError) return { kind: "network" }
  if (error instanceof ApiError) {
    if (error.code === "NETWORK") return { kind: "network" }
    const version = error.serverVersion
    return {
      kind: "http",
      status: error.status,
      blocked: readBlockedSaveIssue(error.details) ?? undefined,
      message: error.message,
      serverRevision: typeof version?.revision === "number" ? version.revision : undefined,
      serverUpdatedAt: typeof version?.updatedAt === "string" ? version.updatedAt : undefined,
    }
  }
  return { kind: "other" }
}

function isNetworkError(error: unknown): boolean {
  return error instanceof TypeError
    || isAbortError(error)
    || (error instanceof ApiError && error.code === "NETWORK")
}

async function mutationRequest(operation: EventMutation, revision: SectionRevision) {
  const headers: Record<string, string> = {
    [SOURCE_HEADER]: "mobile",
    [OPERATION_ID_HEADER]: operation.operationId,
    ...buildSectionRevisionHeaders("intraop", revision),
  }
  const response = await autosaveFetch(
    `/api/cases/${operation.caseId}/events/${encodeURIComponent(operation.eventId)}`,
    {
      method: operation.kind === "event.delete" ? "DELETE" : "PUT",
      headers,
      body: operation.kind === "event.upsert" ? JSON.stringify(operation.event) : undefined,
    },
  )
  const body = await response.json().catch(() => ({})) as {
    intraopRevision?: unknown
    intraopUpdatedAt?: unknown
    serverVersion?: { revision?: unknown; updatedAt?: unknown }
  }
  const acknowledged =
    typeof body.intraopRevision === "number" ? body.intraopRevision :
    typeof body.intraopUpdatedAt === "string" ? body.intraopUpdatedAt :
    undefined
  const serverRevision = serverVersionRevision(body) ?? undefined
  return { ok: response.ok, status: response.status, revision: acknowledged, serverRevision }
}

export const autosaveManager = createAutosaveManager({
  outbox: {
    kv,
    sendPatch: async (caseId, section, payload, revision) => {
      const sectionPayload = payload as Record<string, unknown>
      const clinicalMode = section === "preop"
        && (sectionPayload.clinicalMode === "ADULT" || sectionPayload.clinicalMode === "PEDIATRIC")
        ? sectionPayload.clinicalMode
        : undefined
      const response = await autosaveFetch(`/api/cases/${caseId}`, {
        method: "PATCH",
        headers: buildSectionRevisionHeaders(section, revision),
        body: JSON.stringify({
          ...(clinicalMode ? { clinicalMode } : {}),
          [section]: sectionPayload,
        }),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) {
        const typed = body as { error?: string; serverVersion?: Record<string, unknown> }
        throw new ApiError(
          typed.error ?? "Save failed",
          response.status,
          typeof (body as { code?: unknown }).code === "string" ? (body as { code: string }).code : undefined,
          typed.serverVersion,
          body as Record<string, unknown>,
        )
      }
      return body
    },
    classifyError: classifyPatchError,
  },
  pendingEvents: {
    kv,
    postEvent: async (caseId, event, revision) => {
      const response = await autosaveFetch(`/api/cases/${caseId}/events`, {
        method: "POST",
        headers: {
          [IDEMPOTENCY_HEADER]: eventIdempotencyKey(caseId, String(event.id)),
          [SOURCE_HEADER]: "mobile",
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
        serverRevision: serverVersionRevision(body) ?? undefined,
      }
    },
    isNetworkError,
  },
  eventMutations: {
    kv,
    send: mutationRequest,
    isNetworkError,
  },
})
