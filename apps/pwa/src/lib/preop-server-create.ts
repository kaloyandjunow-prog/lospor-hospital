import { buildPreopPayload } from "@/lib/preop-payload"
import type { PreopFormInput } from "@/lib/preop-form-schema"
import { patientReferenceFromResponse, type PatientReference } from "@/lib/patient-reference"
import type { ApiRequestInit } from "@/lib/api"
import {
  readBlockedSaveIssue,
  type BlockedSaveIssue,
  type RejectedField,
} from "@lospor/core/sync"

type ApiFetch = (path: string, init?: ApiRequestInit) => Promise<Response>
type ExpectedOwner = { userId: string; institutionId: string }

type PostPreopServerCaseSuccess = {
  ok: true
  id: string
  updatedAt: string | null
  revision: number | null
  acceptedPayload: Record<string, unknown>
  patientReference: PatientReference | null
  blocked?: BlockedSaveIssue
  rejectedFields?: RejectedField[]
}

type PostPreopServerCaseFailure = {
  ok: false
  message: string
  status?: number
  body?: Record<string, unknown>
  error?: unknown
}

export type PostPreopServerCaseResult = PostPreopServerCaseSuccess | PostPreopServerCaseFailure

/**
 * Fields that only ever hold something a clinician typed or chose. Structural
 * defaults (clinicalMode, empty arrays, the false-by-default flags) are excluded
 * deliberately: they are present the instant the screen opens and say nothing
 * about whether a patient was being recorded.
 */
const CLINICIAN_ENTERED_FIELDS = [
  "sex", "asaScore", "ageYears", "ageValue", "ageUnit", "heightCm", "weightKg",
  "bpSystolic", "bpDiastolic", "heartRate", "spO2", "temperature",
  "bloodType", "rhFactor", "surgeryName", "notes",
] as const

const NON_EMPTY_LISTS = [
  "diagnoses", "procedures", "comorbidities", "currentMedications",
  "allergyDetails", "labResults",
] as const

export function hasClinicianEnteredContent(values: Record<string, unknown>): boolean {
  for (const field of CLINICIAN_ENTERED_FIELDS) {
    const value = values[field]
    if (value !== undefined && value !== null && value !== "") return true
  }
  for (const list of NON_EMPTY_LISTS) {
    const value = values[list]
    if (Array.isArray(value) && value.length > 0) return true
  }
  return false
}

export async function postPreopServerCase(
  values: PreopFormInput,
  draftId: string,
  fetcher: ApiFetch,
  expectedOwner: ExpectedOwner,
): Promise<PostPreopServerCaseResult | null> {
  if (!values || Object.keys(values).length === 0) return null
  // A form's own defaults make the object non-empty, so an emptiness check alone
  // let merely opening "New case" create a server draft once the debounce fired.
  // Require something a clinician actually entered.
  if (!hasClinicianEnteredContent(values)) return null

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
        headers: {
          "X-Idempotency-Key": draftId,
          "X-LOSPOR-Expected-Institution": expectedOwner.institutionId,
        },
        expectedIdentity: expectedOwner,
        body: JSON.stringify({
          patientNumber,
          clinicalMode: values.clinicalMode ?? "ADULT",
          preop: acceptedPayload,
        }),

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
      const rejectedFields = Array.isArray(body.rejectedFields)
        ? body.rejectedFields.flatMap(field => {
            if (!field || typeof field !== "object") return []
            const { path, message } = field as Record<string, unknown>
            return typeof path === "string"
              ? [{ path, message: typeof message === "string" ? message : "Rejected by server" }]
              : []
          })
        : []
      return {
        ok: true,
        id: body.id,
        updatedAt: typeof updatedAt === "string" ? updatedAt : null,
        revision,
        acceptedPayload,
        patientReference: patientReferenceFromResponse(body),
        ...(firstBlocked ? { blocked: firstBlocked } : {}),
        ...(rejectedFields.length > 0 ? { rejectedFields } : {}),
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
