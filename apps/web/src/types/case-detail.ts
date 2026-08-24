import type { CaseDetailDto } from "@lospor/core/case-detail"

export type {
  CaseDetailDto,
  CaseDetailIntraop,
  CaseDetailIntraopDto,
  CaseDetailPostop,
  CaseDetailPostopDto,
  CaseDetailPreop,
  CaseDetailPreopDto,
  Serialized,
} from "@lospor/core/case-detail"

/**
 * What this reader may do with this case, as the API works it out per request.
 *
 * `isCreator` and `isAssignee` come apart the moment a case is handed on: the
 * creator keeps read and print access within the institution, the assignee
 * holds write. Read it through `caseIsWritable` in `@/lib/case-capabilities`,
 * which fails closed, rather than off the object directly.
 */
export type CaseAccessCapabilities = {
  canRead: boolean
  canWrite: boolean
  isCreator: boolean
  isAssignee: boolean
}

/**
 * Optional rather than required, because not every source of a case detail
 * carries it — the print-data endpoint behind the mobile print-token flow
 * returns the record without it, and an older API predates the field entirely.
 * Absence means read-only, never "unknown, so allow it".
 */
export type CaseDetail = CaseDetailDto & {
  capabilities?: CaseAccessCapabilities | null
}
