import "server-only"

import { vocabularyForSystem } from "@lospor/core/code-systems"

import { prisma } from "@/lib/prisma"

/**
 * What this hospital's coding-system addresses mean.
 *
 * A coded value arrives with the address of the list it belongs to, and NHIS
 * publishes no FHIR address for any of its lists, so every Bulgarian vendor
 * invents one. An address that names the list as a separate segment
 * ("…/CL013", "urn:vendor:ksmp") is recognised on its own. Anything else is
 * recorded when it arrives, and an operator answers once in Status which list
 * it is -- recognition from what actually arrived, the same bargain as the
 * laboratory code map.
 *
 * Nothing waits on an answer. Until one is given, codes from an unknown address
 * arrive exactly as the hospital labelled them, and the clinician can still
 * accept them.
 */

export const EHR_CODE_LISTS = ["ICD10", "KSMP", "NHIS_CL013", "NHIS_CL046", "NHIS_CL024"] as const
export type EhrCodeList = (typeof EHR_CODE_LISTS)[number]

/** Answered addresses, keyed by `codeSystemKey`. OTHER is not in here. */
export type CodeSystemAnswers = ReadonlyMap<string, EhrCodeList>

export const NO_CODE_SYSTEM_ANSWERS: CodeSystemAnswers = new Map()

/** Where an address was seen, as the Status screen names it. */
export type CodeSystemField = "diagnoses" | "procedures" | "routes" | "labs"

/**
 * Addresses compare trimmed and case-insensitively. A URI's scheme and host are
 * case-insensitive, and an operator retyping one should not have to match a
 * vendor's capitalisation to the letter.
 */
export function codeSystemKey(system: unknown): string {
  return typeof system === "string" ? system.trim().toLocaleLowerCase("en") : ""
}

/** NHIS lists never publish a URI, so an address is taken as one only when it names it. */
function namesList(system: string, lists: readonly string[]): boolean {
  return lists.some(list =>
    new RegExp(`(?:^|[^\\p{L}\\p{N}])${list}(?:$|[^\\p{L}\\p{N}])`, "iu").test(system))
}

const AUTOMATIC: Readonly<Record<EhrCodeList, readonly string[]>> = {
  ICD10: ["cl011", "mkb-?10", "мкб-?10"],
  KSMP: ["ksmp", "ксмп", "achi"],
  NHIS_CL013: ["cl013"],
  NHIS_CL046: ["cl046"],
  NHIS_CL024: ["cl024"],
}

/**
 * Whether an address stands for one list, either by naming it or because this
 * hospital said so. An answer can add a meaning to an address; it cannot take
 * away the one its name already carries.
 */
export function isCodeList(system: unknown, list: EhrCodeList, answers: CodeSystemAnswers): boolean {
  const text = typeof system === "string" ? system.trim() : ""
  if (!text) return false
  if (list === "ICD10" && vocabularyForSystem(text, "ICD10") === "ICD10") return true
  return namesList(text, AUTOMATIC[list]) || answers.get(codeSystemKey(text)) === list
}

/**
 * Whether an address means anything to LOSPOR, so it is not worth asking about:
 * one of the vocabularies core knows (ICD-10, SNOMED, ATC, LOINC), a list it
 * names, or an address this hospital has already answered, OTHER included.
 */
function understood(system: string, answered: ReadonlySet<string>): boolean {
  const vocabulary = vocabularyForSystem(system, "")
  if (vocabulary && vocabulary !== system.trim()) return true
  if (EHR_CODE_LISTS.some(list => namesList(system, AUTOMATIC[list]))) return true
  return answered.has(codeSystemKey(system))
}

/**
 * The laboratory codings to resolve, with a CL024 copy of each coding whose
 * address this hospital said is CL024.
 *
 * The copy goes after the original: the site's own code map is keyed on the
 * address as it arrived and must still win, and the resolver's CL024 step
 * recognises the copy by its name.
 */
export function withAnsweredLabCodings<T extends { system?: string | null; code?: string | null; display?: string | null }>(
  codings: readonly T[] | undefined,
  answers: CodeSystemAnswers,
): T[] | undefined {
  if (!codings) return codings
  const expanded: T[] = []
  for (const coding of codings) {
    expanded.push(coding)
    if (answers.get(codeSystemKey(coding?.system)) === "NHIS_CL024" && !namesList(String(coding.system), ["cl024"])) {
      expanded.push({ ...coding, system: "NHIS_CL024" })
    }
  }
  return expanded
}

/** This hospital's answers. Read per import: a stale one would misfile codes. */
export async function siteCodeSystemAnswers(): Promise<{ answers: CodeSystemAnswers; answered: ReadonlySet<string> }> {
  const rows = await prisma.hospitalEhrCodeSystem.findMany({
    where: { list: { not: null } },
    select: { system: true, list: true },
  })
  const answers = new Map<string, EhrCodeList>()
  for (const row of rows) {
    if (row.list && row.list !== "OTHER") answers.set(codeSystemKey(row.system), row.list)
  }
  return { answers, answered: new Set(rows.map(row => codeSystemKey(row.system))) }
}

export type SeenCodeSystem = {
  system: string
  field: CodeSystemField
  code?: string | null
  label?: string | null
}

/** Only the addresses nobody understands, one entry per address and field. */
export function unrecognisedCodeSystems(
  seen: readonly SeenCodeSystem[],
  answered: ReadonlySet<string>,
): SeenCodeSystem[] {
  const out = new Map<string, SeenCodeSystem>()
  for (const item of seen) {
    const system = typeof item.system === "string" ? item.system.trim() : ""
    if (!system || understood(system, answered)) continue
    const key = `${codeSystemKey(system)}|${item.field}`
    if (!out.has(key)) out.set(key, { ...item, system })
  }
  return [...out.values()]
}

/**
 * Record addresses that arrived and mean nothing yet, so Status can ask.
 *
 * A re-poll counts again and adds where it was seen, but never changes an
 * answer or the sample the operator first saw.
 */
export async function recordUnrecognisedCodeSystems(
  seen: readonly SeenCodeSystem[],
  now: Date = new Date(),
): Promise<void> {
  const byKey = new Map<string, { system: string; fields: Set<string>; code?: string; label?: string }>()
  for (const item of seen) {
    const key = codeSystemKey(item.system)
    if (!key) continue
    const entry = byKey.get(key) ?? { system: item.system.trim(), fields: new Set<string>() }
    entry.fields.add(item.field)
    entry.code ??= item.code?.trim() || undefined
    entry.label ??= item.label?.trim() || undefined
    byKey.set(key, entry)
  }
  for (const entry of byKey.values()) {
    const existing = await prisma.hospitalEhrCodeSystem.findFirst({
      where: { system: { equals: entry.system, mode: "insensitive" } },
      select: { id: true, seenIn: true },
    })
    if (existing) {
      await prisma.hospitalEhrCodeSystem.update({
        where: { id: existing.id },
        data: {
          seenCount: { increment: 1 },
          lastSeenAt: now,
          seenIn: [...new Set([...existing.seenIn, ...entry.fields])].sort(),
        },
      })
      continue
    }
    await prisma.hospitalEhrCodeSystem.create({
      data: {
        system: entry.system.slice(0, 2048),
        seenIn: [...entry.fields].sort(),
        sampleCode: entry.code?.slice(0, 512) ?? null,
        sampleLabel: entry.label?.slice(0, 512) ?? null,
        seenCount: 1,
        lastSeenAt: now,
      },
    })
  }
}
