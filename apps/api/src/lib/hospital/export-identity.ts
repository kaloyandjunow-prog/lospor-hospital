import { patientExportPseudonym } from "./patient-identity"

/**
 * Which identity a case is exported under, for every OMOP export the hospital
 * makes: to LOSPOR Central, and the research and administrator exports that stay
 * on site.
 *
 * The person when the site knows one (an ЕГН), otherwise the admission (the
 * record number). A record number is reissued at every admission and restarts
 * every January, so keying a person on it makes the same patient a new person
 * each time they come back. Only keyed pseudonyms leave: neither number does.
 */
type IdentityRow = {
  id: string
  institutionId: string | null
  patientLink?: {
    identifierHash: string
    institutionId?: string | null
    personLink?: { identifierHash: string; institutionId?: string | null } | null
  } | null
}

export function personIdentifierHash(row: IdentityRow): string | null {
  return row.patientLink?.personLink?.identifierHash
    ?? row.patientLink?.identifierHash
    ?? null
}

export type ExportIdentity = Record<string, { personKey: string; personSourceValue: string }>

export function exportIdentityByCase(rows: readonly IdentityRow[]): ExportIdentity {
  return Object.fromEntries(rows.flatMap(row => {
    const identifierHash = personIdentifierHash(row)
    if (!identifierHash || !row.institutionId) return []
    // A patient link from another hospital would build an identity that
    // matches no row anywhere; such a case keeps its own per-case person.
    if (row.patientLink?.institutionId && row.patientLink.institutionId !== row.institutionId) return []
    return [[row.id, {
      personKey: identifierHash,
      personSourceValue: patientExportPseudonym(row.institutionId, identifierHash),
    }]]
  }))
}
