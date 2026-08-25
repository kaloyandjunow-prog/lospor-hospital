import { z } from "zod"

export const CENTRAL_CASE_EXPORT_STATES = [
  "NEVER_EXPORTED",
  "QUEUED",
  "ACCEPTED",
  "WITHDRAWAL_PENDING",
  "WITHDRAWN",
  "REJECTED",
] as const

export const CENTRAL_DELIVERY_STATUSES = [
  "PENDING",
  "GENERATING",
  "READY",
  "UPLOADING",
  "AWAITING_RECEIPT",
  "ACCEPTED",
  "REJECTED",
  "RETRY",
  "CANCELLED",
] as const

export const CENTRAL_DELIVERY_ACTIONS = ["UPSERT", "WITHDRAW"] as const

const isoInstant = z.string().datetime({ offset: true })
const machineCode = z.string().regex(/^[A-Z0-9_]{1,80}$/)

export const centralCaseExportControlSchema = z.object({
  schemaVersion: z.literal(2),
  state: z.enum(CENTRAL_CASE_EXPORT_STATES),
  decidedAt: isoInstant.nullable(),
  lastBatch: z.object({
    status: z.enum(CENTRAL_DELIVERY_STATUSES),
    action: z.enum(CENTRAL_DELIVERY_ACTIONS).nullable(),
    acceptedAt: isoInstant.nullable(),
    errorCode: machineCode.nullable(),
  }).strict().nullable(),
  canWithdraw: z.boolean(),
  canResend: z.boolean(),
}).strict()

export type CentralCaseExportControl = z.infer<typeof centralCaseExportControlSchema>

const centralDeliveryCaseListSchema = z.object({
  schemaVersion: z.literal(1),
  cases: z.array(z.object({
    caseId: z.string().min(1).max(128),
    finalizedAt: isoInstant,
    control: centralCaseExportControlSchema,
  }).strict()).max(20),
  page: z.number().int().min(0).max(100_000),
  pageSize: z.literal(20),
  total: z.number().int().min(0),
}).strict()

export type CentralDeliveryCaseList = z.infer<typeof centralDeliveryCaseListSchema>

/**
 * The Hospital's per-case delivery response is copied through a strict schema.
 * An unexpected field (including a batch id, pseudonym, identifier, or audit
 * note) invalidates the whole payload instead of entering client state.
 */
export function parseCentralCaseExportControl(value: unknown): CentralCaseExportControl | null {
  const parsed = centralCaseExportControlSchema.safeParse(value)
  return parsed.success ? parsed.data : null
}

export function centralCaseExportControlUrl(caseId: string): string {
  return `/api/hospital/cases/${encodeURIComponent(caseId)}/export-control`
}

/** Reject the whole discovery response if an API starts exposing extra fields. */
export function parseCentralDeliveryCaseList(value: unknown): CentralDeliveryCaseList | null {
  const parsed = centralDeliveryCaseListSchema.safeParse(value)
  return parsed.success ? parsed.data : null
}
