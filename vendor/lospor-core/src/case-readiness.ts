/**
 * What still stands between a case and finalization, as one list.
 *
 * The rules are `evaluateCaseFinalization`'s and nothing here adds one. What
 * this adds is the answer to "where do I fix it": each issue becomes an item
 * that names the stage and the part of the form it belongs to, so a client can
 * show everything at once with a way straight to it. Before this, both clients
 * reported only the first refusal, and a clinician found the blockers one press
 * of Finalize at a time.
 *
 * Built for two inputs that must agree. A client evaluates the case it holds,
 * to show the list before anyone presses Finalize; and the server's refusal
 * carries its own blocker list, which is turned into the same items. Same
 * mapping, so the list a clinician worked through is the one the server checks.
 *
 * The words are not here. Each client keeps its own copy keyed by
 * `ReadinessKind`, so a kind added here is a compile error in a client that
 * has no label for it rather than a blank line on a ward.
 */

import {
  evaluateCaseFinalization,
  PREOP_SECTIONS,
  type CaseReadinessInput,
  type ClinicalIssue,
  type ClinicalIssueCode,
  type PreopSection,
} from "./clinical-validation"

export type ReadinessStage = "preop" | "intraop" | "postop"

/** The part of the intraoperative record an item belongs to. */
export type IntraopArea =
  | "times"
  | "events"
  | "technique"
  | "airway"
  | "position"
  | "monitoring"
  | "vascular_access"
  | "vitals"
  | "medications"
  | "fluids"
  | "complications"

/** The part of the postoperative record an item belongs to. */
export type PostopArea = "recovery" | "disposition"

export type ReadinessTarget =
  | { stage: "preop"; section: PreopSection | null }
  | { stage: "intraop"; area: IntraopArea }
  | { stage: "postop"; area: PostopArea }

/**
 * Every kind a client must have words for. The finalization codes, with the
 * preoperative "incomplete" split by section so each says which part is missing.
 */
export type ReadinessKind =
  | "missing_preop"
  | `incomplete_preop_${PreopSection}`
  | "missing_start_time"
  | "missing_end_time"
  | "invalid_intraop_times"
  | "entries_after_case_end"
  | "unconfirmed_stops"
  | "missing_technique"
  | "missing_airway_documentation"
  | "missing_position"
  | "missing_monitoring"
  | "missing_vascular_access"
  | "missing_vitals"
  | "missing_medications"
  | "missing_fluids"
  | "missing_complication_documentation"
  | "missing_postop"
  | "missing_aldrete"
  | "missing_disposition"
  | "unacknowledged_allergy_conflict"
  /** A code this build does not know, from a newer server. Shown, never dropped. */
  | "other"

export const READINESS_KINDS: readonly ReadinessKind[] = [
  "missing_preop",
  ...PREOP_SECTIONS.map(section => `incomplete_preop_${section}` as const),
  "missing_start_time",
  "missing_end_time",
  "invalid_intraop_times",
  "entries_after_case_end",
  "unconfirmed_stops",
  "missing_technique",
  "missing_airway_documentation",
  "missing_position",
  "missing_monitoring",
  "missing_vascular_access",
  "missing_vitals",
  "missing_medications",
  "missing_fluids",
  "missing_complication_documentation",
  "missing_postop",
  "missing_aldrete",
  "missing_disposition",
  "unacknowledged_allergy_conflict",
  "other",
]

export type ReadinessItem = {
  kind: ReadinessKind
  /** A blocker stops finalization; a warning is worth a look and stops nothing. */
  severity: "blocker" | "warning"
  target: ReadinessTarget
}

export type CaseReadiness = {
  /** True when nothing blocks finalization. Warnings do not count. */
  ready: boolean
  blockers: ReadinessItem[]
  warnings: ReadinessItem[]
}

const INTRAOP_AREA: Partial<Record<ClinicalIssueCode, IntraopArea>> = {
  missing_start_time: "times",
  missing_end_time: "times",
  invalid_intraop_times: "times",
  entries_after_case_end: "events",
  unconfirmed_stops: "events",
  missing_technique: "technique",
  missing_airway_documentation: "airway",
  missing_position: "position",
  missing_monitoring: "monitoring",
  missing_vascular_access: "vascular_access",
  missing_vitals: "vitals",
  missing_medications: "medications",
  missing_fluids: "fluids",
  missing_complication_documentation: "complications",
  unacknowledged_allergy_conflict: "medications",
}

const POSTOP_AREA: Partial<Record<ClinicalIssueCode, PostopArea>> = {
  missing_postop: "recovery",
  missing_aldrete: "recovery",
  missing_disposition: "disposition",
}

const KNOWN_KINDS = new Set<string>(READINESS_KINDS)

function isPreopSection(value: string): value is PreopSection {
  return (PREOP_SECTIONS as readonly string[]).includes(value)
}

/**
 * One issue, as an item with somewhere to go.
 *
 * Takes the bare `{ code, path }` the server sends as well as Core's own issue,
 * which is why the severity is passed in rather than read: the refusal's
 * blocker list carries blockers only.
 */
export function readinessItem(
  issue: { code: string; path?: readonly string[] | null },
  severity: ReadinessItem["severity"] = "blocker",
): ReadinessItem {
  const path = issue.path?.[0] ?? ""

  if (issue.code === "incomplete_preop") {
    const section = path.startsWith("preop.") ? path.slice("preop.".length) : ""
    return isPreopSection(section)
      ? { kind: `incomplete_preop_${section}`, severity, target: { stage: "preop", section } }
      : { kind: "other", severity, target: { stage: "preop", section: null } }
  }
  if (issue.code === "missing_preop") {
    return { kind: "missing_preop", severity, target: { stage: "preop", section: null } }
  }

  const intraop = INTRAOP_AREA[issue.code as ClinicalIssueCode]
  if (intraop) {
    return { kind: issue.code as ReadinessKind, severity, target: { stage: "intraop", area: intraop } }
  }
  const postop = POSTOP_AREA[issue.code as ClinicalIssueCode]
  if (postop) {
    return { kind: issue.code as ReadinessKind, severity, target: { stage: "postop", area: postop } }
  }

  // Unknown here means newer than this build. Still listed, under the stage its
  // path names, so the count beside Finalize never undercounts what the server
  // will refuse.
  const stage: ReadinessStage = path.startsWith("intraop") ? "intraop"
    : path.startsWith("postop") ? "postop"
    : "preop"
  const kind = KNOWN_KINDS.has(issue.code) ? issue.code as ReadinessKind : "other"
  const target: ReadinessTarget = stage === "intraop" ? { stage, area: "events" }
    : stage === "postop" ? { stage, area: "recovery" }
    : { stage, section: null }
  return { kind, severity, target }
}

function key(item: ReadinessItem): string {
  const t = item.target
  return `${item.kind}|${t.stage}|${"section" in t ? t.section : t.area}`
}

function unique(items: ReadinessItem[]): ReadinessItem[] {
  const seen = new Set<string>()
  return items.filter(item => {
    const k = key(item)
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
}

export type CaseReadinessOptions = {
  /**
   * Leave the postoperative stage out.
   *
   * For the check at End case: the patient is leaving theatre and recovery has
   * not happened yet, so "no Aldrete score" is not something anyone in the room
   * can or should fix. Everything else is, while the team is still there.
   */
  omitPostop?: boolean
}

/** The readiness of the case a client holds. */
export function caseReadiness(
  input: CaseReadinessInput,
  options: CaseReadinessOptions = {},
): CaseReadiness {
  const items = evaluateCaseFinalization(input).issues.map((issue: ClinicalIssue) =>
    readinessItem(issue, issue.severity === "error" ? "blocker" : "warning"))
  return split(items, options)
}

/**
 * The readiness the server reported when it refused to finalize.
 *
 * Its blocker list is what the server will actually check, so when a client
 * has one it is shown in preference to the client's own evaluation.
 */
export function readinessFromRefusal(body: unknown): CaseReadiness | null {
  if (typeof body !== "object" || body === null) return null
  const blockers = (body as { blockers?: unknown }).blockers
  if (!Array.isArray(blockers) || blockers.length === 0) return null
  const items = blockers.flatMap(entry => {
    if (typeof entry !== "object" || entry === null) return []
    const { code, path } = entry as { code?: unknown; path?: unknown }
    if (typeof code !== "string") return []
    const parts = Array.isArray(path) ? path.filter((part): part is string => typeof part === "string") : []
    return [readinessItem({ code, path: parts }, "blocker")]
  })
  return items.length > 0 ? split(items, {}) : null
}

function split(items: ReadinessItem[], options: CaseReadinessOptions): CaseReadiness {
  const kept = options.omitPostop ? items.filter(item => item.target.stage !== "postop") : items
  // In the order the rules report, which is the order of the record: preop,
  // then intraop, then postop.
  const blockers = unique(kept.filter(item => item.severity === "blocker"))
  const warnings = unique(kept.filter(item => item.severity === "warning"))
  return { ready: blockers.length === 0, blockers, warnings }
}
