import "server-only"

import {
  medicationById,
  medicationByNhisCode,
  medicationsWithAtc,
  searchMedications,
  type MedicationRow,
} from "@lospor/core/medications"
import { medicationRows } from "@lospor/core/vocabulary/medications"
import type { Prisma } from "@/generated/prisma/client"
import { prisma } from "@/lib/prisma"

export type FhirMedicationMapping = {
  drugId: string
  name: string
  inn: string | null
  atcCode: string | null
}

export type MedicationCodeMapEntry = {
  system: string
  code: string
  drugId: string | null
  drugName: string | null
  inn: string | null
  atcCode: string | null
  reportedLabel: string | null
  seenCount: number
  lastSeenAt: Date | null
  mappedAt: Date | null
}

export type MedicationVocabulary = "ATC" | "RXNORM" | "NHIS_PRODUCT"

export type MedicationCatalogDrug = {
  id: string
  name: string
  inn: string | null
  atcCode: string | null
  form?: string | null
  strength?: string | null
}

/**
 * A product from Core's medication list, offered for a code. `id` is the Drug
 * row it becomes (`drug-<catalogId>`, the id the vocabulary seed gives it), so
 * a Status mapping and an automatic match land on the same row.
 */
export type MedicationCodeCandidate = MedicationCatalogDrug & {
  catalogId: string
  form: string | null
  strength: string | null
  nhisCode: string | null
}

export function catalogDrugId(catalogId: string): string {
  return `drug-${catalogId}`
}

export function catalogMedicationCandidate(row: MedicationRow): MedicationCodeCandidate {
  return {
    id: catalogDrugId(row.id),
    catalogId: row.id,
    name: row.name,
    inn: row.inn || null,
    atcCode: row.atc || null,
    form: row.form || null,
    strength: row.strength || null,
    nhisCode: row.nhisCode ?? null,
  }
}

/** Search the medication list the way the clinician drug search does. */
export function searchMedicationCatalog(query: string, limit = 30): MedicationCodeCandidate[] {
  return searchMedications(medicationRows(), query, limit).map(catalogMedicationCandidate)
}

/**
 * The Drug row for a list product, created when a site never ran the
 * terminology import that seeds them. A mapping points at a Drug row, and the
 * Drug table is otherwise filled only by that optional import (9.13.3).
 */
export async function ensureCatalogDrug(
  db: Prisma.TransactionClient | typeof prisma,
  catalogId: string,
): Promise<string | null> {
  const row = medicationById(medicationRows(), catalogId)
  if (!row) return null
  const candidate = catalogMedicationCandidate(row)
  const fields = {
    name: candidate.name,
    inn: candidate.inn,
    atcCode: candidate.atcCode,
    form: candidate.form,
    strength: candidate.strength,
  }
  const drug = await db.drug.upsert({
    where: { id: candidate.id },
    create: { id: candidate.id, ...fields },
    update: fields,
    select: { id: true },
  })
  return drug.id
}

export function medicationVocabulary(system: string | null | undefined): MedicationVocabulary | null {
  const value = (system ?? "").trim().toLowerCase()
  if (!value) return null
  if (value.includes("rxnorm")) return "RXNORM"
  if (value.includes("atc") || value.includes("whocc") || value.includes("who.cc")) return "ATC"
  if (value.includes("cl009") || value.includes("cl026")) return "NHIS_PRODUCT"
  return null
}

export function normalizeAtcCode(code: string | null | undefined): string {
  return (code ?? "").trim().toUpperCase().replace(/\s+/g, "")
}

export function medicationLabelKey(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ")
}

export function selectUniqueMedicationCandidate(
  candidates: readonly MedicationCatalogDrug[],
  reportedLabel: string | null | undefined,
): MedicationCatalogDrug | undefined {
  const unique = [...new Map(candidates.map(candidate => [candidate.id, candidate])).values()]
  if (unique.length === 0) return undefined

  const label = medicationLabelKey(reportedLabel)
  if (label) {
    const exactName = unique.filter(candidate => {
      const name = medicationLabelKey(candidate.name)
      return name && (label === name || label.startsWith(name + " ") || label.includes(" " + name + " "))
    })
    if (exactName.length === 1) return exactName[0]
    // One product in several strengths: the label usually says which.
    const strengthKey = (value: string | null | undefined) => (value ?? "").toLocaleLowerCase().replace(/,/g, ".").replace(/\s+/g, " ").trim()
    const reported = strengthKey(reportedLabel)
    const strength = exactName.filter(candidate => {
      const value = strengthKey(candidate.strength)
      // "5 mg" must not be read out of "2,5 mg" or "25 mg".
      return value && new RegExp(`(^|[^\\d.])${value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}($|[^\\d])`).test(reported)
    })
    if (strength.length === 1) return strength[0]
  }
  return unique.length === 1 ? unique[0] : undefined
}

function mappingForDrug(drug: MedicationCatalogDrug): FhirMedicationMapping {
  return { drugId: drug.id, name: drug.name, inn: drug.inn, atcCode: drug.atcCode }
}

// A reported label usually carries more than a product name ("Amlocor 10 mg
// tablets"), which no name contains: search by its first word as well, and let
// selectUniqueMedicationCandidate decide from the whole label.
function drugsMatchingLabels(labels: readonly string[]): MedicationCodeCandidate[] {
  const values = [...new Set(labels.flatMap(value => {
    const whole = value.trim()
    const first = medicationLabelKey(whole).split(" ")[0] ?? ""
    return [whole, first.length >= 3 ? first : ""]
  }).filter(Boolean))]
  const found = values.flatMap(value => searchMedicationCatalog(value, 100))
  return [...new Map(found.map(candidate => [candidate.id, candidate])).values()]
}

function atcCandidates(code: string, limit: number): MedicationCodeCandidate[] {
  const atcCode = normalizeAtcCode(code)
  return atcCode ? medicationsWithAtc(medicationRows(), atcCode, limit).map(catalogMedicationCandidate) : []
}

export async function automaticMedicationCodeMap(
  seen: readonly { system: string; code: string; display?: string }[],
): Promise<Record<string, FhirMedicationMapping>> {
  const result: Record<string, FhirMedicationMapping> = {}
  for (const item of seen) {
    const vocabulary = medicationVocabulary(item.system)
    const sourceLabel = item.display?.trim() || undefined

    // A national product code names one product in CL009: no guessing needed.
    const national = vocabulary === "NHIS_PRODUCT" ? medicationByNhisCode(medicationRows(), item.code) : undefined
    let selected: MedicationCatalogDrug | undefined = national ? catalogMedicationCandidate(national) : undefined

    if (!selected && vocabulary === "ATC") {
      selected = selectUniqueMedicationCandidate(atcCandidates(item.code, 100), sourceLabel)
    }
    if (!selected && sourceLabel) {
      selected = selectUniqueMedicationCandidate(drugsMatchingLabels([sourceLabel]), sourceLabel)
    }

    if (!selected && vocabulary === "RXNORM") {
      const concepts = await prisma.omopConcept.findMany({
        where: {
          vocabularyId: { in: ["RxNorm", "RxNorm Extension"] },
          conceptCode: item.code.trim(),
          invalidReason: null,
        },
        select: { conceptName: true },
        take: 10,
      })
      const labels = [sourceLabel, ...concepts.map(concept => concept.conceptName)].filter((value): value is string => Boolean(value))
      selected = selectUniqueMedicationCandidate(drugsMatchingLabels(labels), sourceLabel ?? concepts[0]?.conceptName)
    }

    if (selected) result[medicationCodeKey(item.system, item.code)] = mappingForDrug(selected)
  }
  return result
}

/** What Status offers for a code before the operator searches. */
export function medicationCodeCandidates(
  system: string,
  code: string,
  reportedLabel: string | null,
  limit = 20,
): MedicationCodeCandidate[] {
  const vocabulary = medicationVocabulary(system)
  const national = vocabulary === "NHIS_PRODUCT" ? medicationByNhisCode(medicationRows(), code) : undefined
  if (national) return [catalogMedicationCandidate(national)]
  let candidates = vocabulary === "ATC" ? atcCandidates(code, limit) : []
  if (candidates.length === 0 && reportedLabel) candidates = drugsMatchingLabels([reportedLabel])
  return candidates.slice(0, limit)
}
export function medicationCodeKey(
  system: string | null | undefined,
  code: string | null | undefined,
): string {
  return `${(system ?? "").trim()}|${(code ?? "").trim()}`
}

/** The source-code mappings consulted while a FHIR import is being staged. */
export async function siteMedicationCodeMap(): Promise<Record<string, FhirMedicationMapping>> {
  const rows = await prisma.hospitalEhrMedicationCodeMap.findMany({
    where: { drugId: { not: null } },
    select: {
      system: true,
      code: true,
      drug: { select: { id: true, name: true, inn: true, atcCode: true } },
    },
  })
  return Object.fromEntries(rows.filter(row => row.drug).map(row => [medicationCodeKey(row.system, row.code), {
    drugId: row.drug!.id,
    name: row.drug!.name,
    inn: row.drug!.inn,
    atcCode: row.drug!.atcCode,
  }]))
}

/** Remember a code that arrived without a local medication mapping. */
export async function recordUnmappedMedicationCodes(
  seen: readonly { system: string; code: string; display?: string; count: number }[],
  now: Date = new Date(),
): Promise<void> {
  for (const item of seen) {
    const system = (item.system ?? "").trim()
    const code = (item.code ?? "").trim()
    if (!code && !system) continue
    await prisma.hospitalEhrMedicationCodeMap.upsert({
      where: { system_code: { system, code } },
      update: { seenCount: { increment: item.count }, lastSeenAt: now },
      create: {
        system,
        code,
        reportedLabel: item.display?.trim() || null,
        drugId: null,
        seenCount: item.count,
        lastSeenAt: now,
      },
    })
  }
}

export async function unmappedMedicationCodes(limit = 200): Promise<MedicationCodeMapEntry[]> {
  const rows = await prisma.hospitalEhrMedicationCodeMap.findMany({
    where: { drugId: null },
    orderBy: [{ seenCount: "desc" }, { lastSeenAt: "desc" }],
    take: limit,
    select: {
      system: true, code: true, drugId: true, reportedLabel: true,
      seenCount: true, lastSeenAt: true, mappedAt: true,
    },
  })
  return rows.map(row => ({
    ...row,
    drugId: null,
    drugName: null,
    inn: null,
    atcCode: null,
  }))
}

export async function mappedMedicationCodes(limit = 500): Promise<MedicationCodeMapEntry[]> {
  const rows = await prisma.hospitalEhrMedicationCodeMap.findMany({
    where: { drugId: { not: null } },
    orderBy: [{ reportedLabel: "asc" }, { code: "asc" }],
    take: limit,
    select: {
      system: true, code: true, drugId: true, reportedLabel: true,
      seenCount: true, lastSeenAt: true, mappedAt: true,
      drug: { select: { name: true, inn: true, atcCode: true } },
    },
  })
  return rows.filter(row => row.drug).map(row => ({
    system: row.system,
    code: row.code,
    drugId: row.drugId,
    drugName: row.drug!.name,
    inn: row.drug!.inn,
    atcCode: row.drug!.atcCode,
    reportedLabel: row.reportedLabel,
    seenCount: row.seenCount,
    lastSeenAt: row.lastSeenAt,
    mappedAt: row.mappedAt,
  }))
}

export async function ehrMedicationCodeMapView() {
  const [unmapped, mapped] = await Promise.all([
    unmappedMedicationCodes(),
    mappedMedicationCodes(),
  ])
  const serialize = (row: MedicationCodeMapEntry) => ({
    ...row,
    lastSeenAt: row.lastSeenAt?.toISOString() ?? null,
    mappedAt: row.mappedAt?.toISOString() ?? null,
  })
  return {
    unmapped: unmapped.map(row => ({
      ...serialize(row),
      candidates: medicationCodeCandidates(row.system, row.code, row.reportedLabel),
    })),
    mapped: mapped.map(serialize),
    // Status searches the whole list (the ehr-medication-codes search) rather
    // than paging through a dropdown; this used to hold the first 500 Drug rows
    // alphabetically, and nothing when the Drug table was never seeded.
    drugs: [] as MedicationCodeCandidate[],
    medicationListSize: medicationRows().length,
  }
}
