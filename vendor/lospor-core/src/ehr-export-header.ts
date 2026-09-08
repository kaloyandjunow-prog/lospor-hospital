/**
 * The coded half of what goes back to the hospital system.
 *
 * Sent in parallel with the protocol PDF, not instead of it. The PDF is what a
 * clinician reads; this is what a hospital system can file into fields, and the
 * receiving site chooses which it uses. Building both means a site with no
 * structured intake still gets the document, and one that can parse gets
 * figures it can query without anybody re-typing them.
 *
 * The discipline that matters throughout: **a figure nobody recorded is not
 * zero.** "Blood loss 0 mL" is a clinical finding — it says somebody looked.
 * Sending it for a case where nobody measured would put a finding in the
 * hospital record that no one ever made, and every field here is built to keep
 * those apart.
 */

import type { FluidTotals } from "./intraop-totals"
import type { DrugTotal } from "./intraop-summary"

/**
 * A quantity that may legitimately be unknown.
 *
 * Explicit rather than a bare `number | null`, because a null crossing a
 * transport boundary is exactly the thing that gets coerced to 0 somewhere
 * downstream. A receiver has to opt into reading `value`, and cannot do so
 * without seeing `recorded`.
 */
export type EhrQuantity =
  | { recorded: true; value: number; unit: string }
  | { recorded: false; unit: string }

export function quantity(value: number | null | undefined, unit: string): EhrQuantity {
  return typeof value === "number" && Number.isFinite(value)
    ? { recorded: true, value, unit }
    : { recorded: false, unit }
}

export type EhrCodedComplication = {
  label: string
  /** Kept verbatim so a mapping failure stays visible rather than silently coded wrong. */
  sourceVocabulary?: string
  sourceCode?: string
  standardConceptId?: number
}

export type EhrCodedHeader = {
  /** Which finalisation this describes, so a correction supersedes cleanly. */
  finalization: { sequence: number; finalizedAt: string; supersedes?: string }
  times: { startedAt: string | null; endedAt: string | null; timezone: string | null }
  drugs: { name: string; unit: string; total: number; count: number }[]
  fluids: {
    crystalloids: EhrQuantity
    colloids: EhrQuantity
    blood: EhrQuantity
    urine: EhrQuantity
    bloodLoss: EhrQuantity
  }
  complications: EhrCodedComplication[]
  handover: {
    aldreteTotal: EhrQuantity
    disposition: string | null
    items: string[]
  }
}

type IntraopLike = {
  startedAt?: string | null
  endedAt?: string | null
  timezone?: string | null
  urineMl?: number | null
  bloodLossMl?: number | null
  complications?: unknown
}

type PostopLike = {
  aldreteTotal?: number | null
  disposition?: string | null
  handoverItems?: unknown
  complications?: unknown
}

/**
 * Complications may be free text or a coded list depending on how they were
 * entered. Both are sent: an uncoded complication is still a complication, and
 * dropping it because it lacks a code would lose the more clinically urgent
 * half — the unusual events are the ones least likely to be in a picklist.
 */
function codedComplications(raw: unknown): EhrCodedComplication[] {
  if (Array.isArray(raw)) {
    return raw.flatMap(item => {
      if (!item || typeof item !== "object") {
        const label = String(item ?? "").trim()
        return label ? [{ label }] : []
      }
      const record = item as Record<string, unknown>
      const label = String(record.label ?? record.name ?? record.sourceCode ?? "").trim()
      if (!label) return []
      const coded: EhrCodedComplication = { label }
      if (typeof record.sourceVocabulary === "string") coded.sourceVocabulary = record.sourceVocabulary
      if (typeof record.sourceCode === "string") coded.sourceCode = record.sourceCode
      if (typeof record.standardConceptId === "number") coded.standardConceptId = record.standardConceptId
      return [coded]
    })
  }
  if (typeof raw !== "string") return []
  const text = raw.trim()
  if (!text) return []
  if (text.startsWith("[")) {
    try {
      return codedComplications(JSON.parse(text))
    } catch {
      return [{ label: text }]
    }
  }
  return [{ label: text }]
}

function stringList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  return raw.map(item => String(item ?? "").trim()).filter(Boolean)
}

export function buildCodedHeader(input: {
  finalization: { sequence: number; finalizedAt: string; supersedes?: string }
  intraop?: IntraopLike | null
  postop?: PostopLike | null
  drugTotals?: DrugTotal[]
  fluidTotals?: FluidTotals | null
}): EhrCodedHeader {
  const intraop = input.intraop ?? {}
  const postop = input.postop ?? {}
  const fluids = input.fluidTotals ?? null

  return {
    finalization: input.finalization,
    times: {
      startedAt: intraop.startedAt ?? null,
      endedAt: intraop.endedAt ?? null,
      timezone: intraop.timezone ?? null,
    },
    // Sent with their dose counts: "3 × 2 mg" and one 6 mg dose are the same
    // total and a different anaesthetic.
    drugs: (input.drugTotals ?? []).map(drug => ({
      name: drug.name, unit: drug.unit, total: drug.total, count: drug.count,
    })),
    fluids: {
      // A zero total from an empty chart is not a measured zero, so the totals
      // are only reported as recorded when a chart was actually computed.
      crystalloids: fluids ? quantity(fluids.crystalloids, "mL") : quantity(null, "mL"),
      colloids: fluids ? quantity(fluids.colloids, "mL") : quantity(null, "mL"),
      blood: fluids ? quantity(fluids.blood, "mL") : quantity(null, "mL"),
      urine: quantity(intraop.urineMl, "mL"),
      bloodLoss: quantity(intraop.bloodLossMl, "mL"),
    },
    // Both sections can carry them, and they are not duplicates: one is what
    // happened in theatre, the other what happened in recovery.
    complications: [
      ...codedComplications(intraop.complications),
      ...codedComplications(postop.complications),
    ],
    handover: {
      aldreteTotal: quantity(postop.aldreteTotal, "score"),
      disposition: postop.disposition ?? null,
      items: stringList(postop.handoverItems),
    },
  }
}
