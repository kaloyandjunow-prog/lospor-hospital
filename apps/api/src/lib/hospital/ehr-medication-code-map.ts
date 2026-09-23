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
  return {
    unmapped: unmapped.map(serialize),
    mapped: mapped.map(serialize),
    drugs,
  }
}
