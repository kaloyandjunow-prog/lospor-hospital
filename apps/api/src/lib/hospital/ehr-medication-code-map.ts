import "server-only"

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

export type MedicationCodeCandidate = MedicationCatalogDrug

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
  }
  return unique.length === 1 ? unique[0] : undefined
}

function mappingForDrug(drug: MedicationCatalogDrug): FhirMedicationMapping {
  return { drugId: drug.id, name: drug.name, inn: drug.inn, atcCode: drug.atcCode }
}

async function drugsMatchingLabels(labels: readonly string[]): Promise<MedicationCatalogDrug[]> {
  const values = [...new Set(labels.map(medicationLabelKey).filter(Boolean))]
  if (values.length === 0) return []
  return prisma.drug.findMany({
    where: {
      OR: values.flatMap(value => [
        { name: { contains: value, mode: "insensitive" as const } },
        { inn: { contains: value, mode: "insensitive" as const } },
      ]),
    },
    orderBy: [{ name: "asc" }, { inn: "asc" }],
    take: 100,
    select: { id: true, name: true, inn: true, atcCode: true, form: true, strength: true },
  })
}

export async function automaticMedicationCodeMap(
  seen: readonly { system: string; code: string; display?: string }[],
): Promise<Record<string, FhirMedicationMapping>> {
  const result: Record<string, FhirMedicationMapping> = {}
  for (const item of seen) {
    const vocabulary = medicationVocabulary(item.system)
    const sourceLabel = item.display?.trim() || undefined
    let candidates: MedicationCatalogDrug[] = []

    if (vocabulary === "ATC") {
      const atcCode = normalizeAtcCode(item.code)
      if (atcCode) {
        candidates = await prisma.drug.findMany({
          where: { atcCode },
          orderBy: [{ name: "asc" }, { inn: "asc" }],
          take: 100,
          select: { id: true, name: true, inn: true, atcCode: true, form: true, strength: true },
        })
      }
    }

    let selected = selectUniqueMedicationCandidate(candidates, sourceLabel)
    if (!selected && sourceLabel) {
      selected = selectUniqueMedicationCandidate(await drugsMatchingLabels([sourceLabel]), sourceLabel)
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
      selected = selectUniqueMedicationCandidate(await drugsMatchingLabels(labels), sourceLabel ?? concepts[0]?.conceptName)
    }

    if (selected) result[medicationCodeKey(item.system, item.code)] = mappingForDrug(selected)
  }
  return result
}

export async function medicationCodeCandidates(
  system: string,
  code: string,
  reportedLabel: string | null,
  limit = 20,
): Promise<MedicationCodeCandidate[]> {
  const vocabulary = medicationVocabulary(system)
  let candidates: MedicationCatalogDrug[] = []
  if (vocabulary === "ATC") {
    const atcCode = normalizeAtcCode(code)
    if (atcCode) {
      candidates = await prisma.drug.findMany({
        where: { atcCode },
        orderBy: [{ name: "asc" }, { inn: "asc" }],
        take: limit,
        select: { id: true, name: true, inn: true, atcCode: true, form: true, strength: true },
      })
    }
  }
  if (candidates.length === 0 && reportedLabel) candidates = await drugsMatchingLabels([reportedLabel])
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

export async function medicationMapDrugOptions(limit = 500) {
  return prisma.drug.findMany({
    orderBy: [{ name: "asc" }, { inn: "asc" }],
    take: limit,
    select: { id: true, name: true, inn: true, atcCode: true, form: true, strength: true },
  })
}

export async function ehrMedicationCodeMapView() {
  const [unmapped, mapped, drugs] = await Promise.all([
    unmappedMedicationCodes(),
    mappedMedicationCodes(),
    medicationMapDrugOptions(),
  ])
  const serialize = (row: MedicationCodeMapEntry) => ({
    ...row,
    lastSeenAt: row.lastSeenAt?.toISOString() ?? null,
    mappedAt: row.mappedAt?.toISOString() ?? null,
  })
  const unmappedWithCandidates = await Promise.all(unmapped.map(async row => ({
    ...serialize(row),
    candidates: await medicationCodeCandidates(row.system, row.code, row.reportedLabel).catch(() => []),
  })))
  return {
    unmapped: unmappedWithCandidates,
    mapped: mapped.map(serialize),
    drugs,
  }
}
