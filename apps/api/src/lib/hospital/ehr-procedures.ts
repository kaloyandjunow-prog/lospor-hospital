import "server-only"

import fs from "node:fs"
import path from "node:path"

import { isCodeList, type CodeSystemAnswers } from "./ehr-code-systems"
import { KSMP_PROCEDURE_GROUPS, KSMP_PROCEDURE_OPERATIONS } from "./ksmp-procedure-groups"

/**
 * A procedure a hospital coded, as LOSPOR proposes it.
 *
 * Two codings are understood, and the tags they become are the shapes the
 * procedure pickers themselves store (@lospor/core/procedure-codes), so an
 * imported procedure and a hand-picked one read, print and export alike:
 *
 *   ICD-10-PCS is the exact operation. It keeps the hospital's address and
 *   wording under `imported`, and its code is the research code.
 *
 *   A Bulgarian КСМП code whose crosswalk reached exactly one ICD-10-PCS
 *   operation is proposed as that operation, keeping the КСМП code under
 *   `imported`. Any other crosswalked КСМП code is its LOSPOR group, declared
 *   as vocabulary KSMP so the research copy files it as КСМП, with the
 *   operations the crosswalk reached as `suggestedCodes` for the clinician's
 *   exact choice. Either way it is a proposal the clinician ticks or declines.
 *
 * Anything else, or a code the tables do not hold, returns nothing and arrives
 * as the hospital labelled it.
 */

type PcsRow = { code: string; description: string; group: string; domain: string }

let pcsByCode: Map<string, PcsRow> | null = null

/** The ICD-10-PCS table the procedure search serves, read once per process. */
function pcsRows(): Map<string, PcsRow> {
  if (!pcsByCode) {
    const rows = JSON.parse(fs.readFileSync(path.join(process.cwd(), "src", "data", "pcs.json"), "utf8")) as PcsRow[]
    pcsByCode = new Map(rows.map(row => [row.code, row]))
  }
  return pcsByCode
}

function exactOperation(row: PcsRow, imported: NonNullable<ProposedProcedure["imported"]>): ProposedProcedure {
  return {
    label: row.group,
    code: row.code,
    system: "ICD-10-PCS",
    group: row.group,
    domain: row.domain,
    description: row.description,
    sub: `${row.code} · ${row.description}`,
    imported,
  }
}

export type ProposedProcedure = {
  label: string
  code: string
  system: string
  group: string
  domain?: string
  description?: string
  sub?: string
  sourceVocabulary?: string
  sourceLabel?: string
  suggestedCodes?: string[]
  imported?: { code: string; system: string; sourceVocabulary?: string; sourceLabel?: string }
}

const text = (value: unknown) => typeof value === "string" && value.trim() ? value.trim() : undefined

export function procedureFromCoding(
  coding: { code?: unknown; system?: unknown },
  wording: string | undefined,
  answers: CodeSystemAnswers,
): ProposedProcedure | undefined {
  const code = text(coding.code)
  const system = text(coding.system)
  if (!code || !system) return undefined
  const sourceLabel = text(wording)

  if (isCodeList(system, "ICD10PCS", answers)) {
    const row = pcsRows().get(code.toUpperCase())
    if (row) return exactOperation(row, { code, system, ...(sourceLabel ? { sourceLabel } : {}) })
  }

  if (isCodeList(system, "KSMP", answers)) {
    const group = KSMP_PROCEDURE_GROUPS.get(code)
    if (group) {
      const operations = KSMP_PROCEDURE_OPERATIONS.get(code)
      // One operation is the whole answer the crosswalk gives, so it is proposed
      // as that operation rather than asked about.
      const only = operations?.length === 1 ? pcsRows().get(operations[0]) : undefined
      if (only && only.group === group) {
        return exactOperation(only, {
          code, system, sourceVocabulary: "KSMP", ...(sourceLabel ? { sourceLabel } : {}),
        })
      }
      return {
        label: group,
        code,
        system,
        group,
        sourceVocabulary: "KSMP",
        ...(sourceLabel && sourceLabel !== group ? { sourceLabel } : {}),
        ...(operations?.length ? { suggestedCodes: [...operations] } : {}),
      }
    }
  }
  return undefined
}

/**
 * The best reading of several codings for one procedure: an exact ICD-10-PCS
 * operation wins over a КСМП group, whichever order the hospital sent them in.
 */
export function procedureFromCodings(
  codings: readonly { code?: unknown; system?: unknown }[],
  wording: string | undefined,
  answers: CodeSystemAnswers,
): ProposedProcedure | undefined {
  const proposals = codings.map(coding => procedureFromCoding(coding, wording, answers)).filter(Boolean) as ProposedProcedure[]
  return proposals.find(proposal => proposal.system === "ICD-10-PCS") ?? proposals[0]
}

/** A dropped file's procedures, each read the same way as a FHIR coding. */
export function resolveImportedProcedures<T extends Record<string, unknown>>(
  tags: readonly T[],
  answers: CodeSystemAnswers,
): (T | (ProposedProcedure & Record<string, unknown>))[] {
  return tags.map(tag => {
    const proposal = procedureFromCoding(tag, text(tag.label), answers)
    return proposal ? { ...proposal, ...(tag.source ? { source: tag.source } : {}) } : tag
  })
}
