import { buildPreopPayload } from "@/lib/preop-payload"
import type { PreopFormInput } from "@/lib/preop-form-schema"
import { readBlockedSaveIssue, type BlockedSaveIssue } from "@lospor/core/sync"

type ApiFetch = (path: string, init?: RequestInit) => Promise<Response>

type PostPreopServerCaseSuccess = {
  ok: true
  id: string
  updatedAt: string | null
  revision: number | null
  acceptedPayload: Record<string, unknown>
  blocked?: BlockedSaveIssue
}

type PostPreopServerCaseFailure = {
  ok: false
  message: string
  status?: number
  body?: Record<string, unknown>
  error?: unknown
}

export type PostPreopServerCaseResult = PostPreopServerCaseSuccess | PostPreopServerCaseFailure

export async function postPreopServerCase(
  values: PreopFormInput,
  draftId: string,
  fetcher: ApiFetch
): Promise<PostPreopServerCaseResult | null> {
  if (!values || Object.keys(values).length === 0) return null

  try {
    const patientNumber = values.patientNumber?.trim()
    if (!patientNumber) {
      return { ok: false, message: "Hospital patient number is required" }
    }
    const fullPayload = buildPreopPayload(values)
    const acceptedPayload: Record<string, unknown> = { ...fullPayload }
    delete acceptedPayload.patientNumber
    let firstBlocked: BlockedSaveIssue | undefined
    const maxAttempts = Object.keys(fullPayload).length + 1

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const res = await fetcher("/api/cases", {
        method: "POST",
        headers: { "X-Idempotency-Key": draftId },
        body: JSON.stringify({ patientNumber, preop: acceptedPayload }),
      })
      const body = await res.json().catch(() => ({})) as Record<string, unknown>

      if (!res.ok) {
        const issue = readBlockedSaveIssue(body)
        if (issue) {
          firstBlocked ??= issue
          const before = Object.keys(acceptedPayload).length
          for (const key of issue.blockedKeys) delete acceptedPayload[key]
          if (Object.keys(acceptedPayload).length < before) continue
        }
        return {
          ok: false,
          status: res.status,
          body,
          message: typeof body.error === "string" ? body.error : `Save failed (HTTP ${res.status})`,
        }
      }

      const updatedAt = body.preopUpdatedAt
        ?? (body.preop as { updatedAt?: unknown } | undefined)?.updatedAt
        ?? body.updatedAt
        ?? null
      const revision = typeof body.preopRevision === "number"
        ? body.preopRevision
        : typeof (body.preop as { syncRevision?: unknown } | undefined)?.syncRevision === "number"
          ? (body.preop as { syncRevision: number }).syncRevision
          : null
      if (typeof body.id !== "string") {
        return { ok: false, status: res.status, body, message: "Save failed: server returned no case ID" }
      }
      return {
        ok: true,
        id: body.id,
        updatedAt: typeof updatedAt === "string" ? updatedAt : null,
        revision,
        acceptedPayload,
        ...(firstBlocked ? { blocked: firstBlocked } : {}),
      }
    }
    return { ok: false, message: "Save failed: too many blocked fields" }
  } catch (error) {
    return {
      ok: false,
      error,
      message: `Network error: ${error instanceof Error ? error.message : "cannot reach server"}`,
    }
  }
}
