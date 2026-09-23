import "server-only"

import { FHIR_VITAL_FIELDS, type FhirVitalField, type UnmappedVitalCode } from "./ehr-fhir-vitals"
import { prisma } from "@/lib/prisma"

export type VitalCodeMapEntry = {
  system: string
  code: string
  field: FhirVitalField
  reportedLabel: string | null
  seenCount: number
  lastSeenAt: Date | null
  mappedAt: Date | null
}

export function vitalCodeKey(system: string | null | undefined, code: string | null | undefined): string {
  return (system ?? "").trim() + "|" + (code ?? "").trim()
}

export async function siteVitalCodeMap(): Promise<Record<string, FhirVitalField>> {
  const rows = await prisma.hospitalEhrVitalCodeMap.findMany({
    where: { field: { not: "" } },
    select: { system: true, code: true, field: true },
  })
  const allowed = new Set<string>(FHIR_VITAL_FIELDS)
  return Object.fromEntries(rows
    .filter(row => allowed.has(row.field))
    .map(row => [vitalCodeKey(row.system, row.code), row.field as FhirVitalField]))
}

export async function recordUnmappedVitalCodes(
  seen: readonly UnmappedVitalCode[],
  now: Date = new Date(),
): Promise<void> {
  for (const item of seen) {
    const system = (item.system ?? "").trim()
    const code = (item.code ?? "").trim()
    if (!code && !system) continue
    await prisma.hospitalEhrVitalCodeMap.upsert({
      where: { system_code: { system, code } },
      update: { seenCount: { increment: item.count }, lastSeenAt: now },
      create: {
        system,
        code,
        reportedLabel: item.display?.trim() || null,
        field: "",
        seenCount: item.count,
        lastSeenAt: now,
      },
    })
  }
}

export async function unmappedVitalCodes(limit = 200): Promise<VitalCodeMapEntry[]> {
  return prisma.hospitalEhrVitalCodeMap.findMany({
    where: { field: "" },
    orderBy: [{ seenCount: "desc" }, { lastSeenAt: "desc" }],
    take: limit,
    select: {
      system: true, code: true, field: true, reportedLabel: true,
      seenCount: true, lastSeenAt: true, mappedAt: true,
    },
  }) as Promise<VitalCodeMapEntry[]>
}

export async function mappedVitalCodes(): Promise<VitalCodeMapEntry[]> {
  return prisma.hospitalEhrVitalCodeMap.findMany({
    where: { field: { not: "" } },
    orderBy: [{ field: "asc" }, { code: "asc" }],
    select: {
      system: true, code: true, field: true, reportedLabel: true,
      seenCount: true, lastSeenAt: true, mappedAt: true,
    },
  }) as Promise<VitalCodeMapEntry[]>
}

export async function ehrVitalCodeMapView() {
  const [unmapped, mapped] = await Promise.all([
    unmappedVitalCodes(),
    mappedVitalCodes(),
  ])
  const viewRow = (row: VitalCodeMapEntry) => ({
    ...row,
    mappedAt: row.mappedAt?.toISOString() ?? null,
    lastSeenAt: row.lastSeenAt?.toISOString() ?? null,
  })
  return {
    unmapped: unmapped.map(viewRow),
    mapped: mapped.map(viewRow),
    fields: [...FHIR_VITAL_FIELDS],
  }
}
