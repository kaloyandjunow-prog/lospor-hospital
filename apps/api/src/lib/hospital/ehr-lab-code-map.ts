import "server-only"

import { LAB_CATEGORIES, LAB_LIBRARY } from "@lospor/core/labs"

import { prisma } from "@/lib/prisma"

/**
 * What this hospital's laboratory codes mean, and how an operator says so.
 *
 * The mapping is entered from *their* side, not ours. Starting from our field —
 * "Haemoglobin: type what they call it" — asks an operator to reproduce `ХГБ`
 * from memory, including its coding system, and a single wrong character fails
 * silently forever. So the screen lists what has actually arrived and could not
 * be placed, with counts, and the operator picks one of our tests from a list.
 * Recognition rather than recall.
 *
 * Four things follow from entering it that way, and they are the reason it is
 * worth the extra table:
 *
 *   codes we already understand never appear, because there is nothing to
 *   decide about them, so an empty list means genuinely finished rather than
 *   not started;
 *
 *   the counts are the priority order, and they are real — a code seen twelve
 *   times this week is worth more of an operator's attention than one seen once;
 *
 *   several of their codes may point at one of our tests and not the reverse,
 *   which is exactly the shape a hospital with five analysers needs;
 *
 *   nothing is blocked while a code is unmapped. The result still imports under
 *   whatever the hospital called it, so mapping improves where a result lands
 *   rather than deciding whether it arrives.
 */

/** `system|code`, the same key a FHIR search uses for a coded value. */
export function labCodeKeyOf(system: string | null | undefined, code: string | null | undefined): string {
  return `${(system ?? "").trim()}|${(code ?? "").trim()}`
}

const LIBRARY_TESTS = new Set(LAB_LIBRARY.map(test => test.name))

/**
 * The tests an operator may map onto, grouped as the clinical form groups them.
 *
 * Sixty-six names in one flat list is a scroll; the same names under Haematology,
 * Coagulation, Blood gas and the rest is a place someone finds haemoglobin in a
 * second. The unit is carried because it is what the operator is really
 * deciding — mapping `ХГБ` to Haemoglobin (Hb) is also saying results will be
 * read as g/L.
 */
export function mappableTests(): { name: string; unit: string; category: string }[] {
  return LAB_CATEGORIES.flatMap(category =>
    category.tests.map(test => ({ name: test.name, unit: test.unit, category: category.label })))
}

export type LabCodeMapEntry = {
  system: string
  code: string
  test: string
  reportedLabel: string | null
  assumedUnit: string | null
  seenCount: number
  lastSeenAt: Date | null
}

/**
 * The map the Observation reader consults, in the shape core expects.
 *
 * Read on every import rather than cached. It is one small table, a site edits
 * it rarely, and a cache that serves a stale mapping puts results under the
 * wrong test — which is the failure this whole table exists to prevent.
 */
export async function siteLabCodeMap(): Promise<Record<string, string>> {
  const rows = await prisma.hospitalEhrLabCodeMap.findMany({
    where: { test: { not: "" } },
    select: { system: true, code: true, test: true },
  })
  return Object.fromEntries(rows.map(row => [labCodeKeyOf(row.system, row.code), row.test]))
}

/** Units a site has stated for codes that arrive without one. */
export async function assumedUnits(): Promise<Record<string, string>> {
  const rows = await prisma.hospitalEhrLabCodeMap.findMany({
    where: { assumedUnit: { not: null } },
    select: { system: true, code: true, assumedUnit: true },
  })
  return Object.fromEntries(rows.map(row => [labCodeKeyOf(row.system, row.code), row.assumedUnit!]))
}

/**
 * Record that some codes arrived without a mapping.
 *
 * Written as unmapped rows with a count rather than kept in a log, because the
 * list an operator works through *is* this table: an unmapped row is a question
 * waiting to be answered, and answering it is setting `test`. A site that has
 * not integrated yet has an empty screen, which is honest — there is nothing to
 * map until something has arrived.
 */
export async function recordUnmappedCodes(
  seen: readonly { system: string; code: string; display?: string }[],
  now: Date = new Date(),
): Promise<void> {
  for (const item of seen) {
    const system = (item.system ?? "").trim()
    const code = (item.code ?? "").trim()
    if (!code && !system) continue
    await prisma.hospitalEhrLabCodeMap.upsert({
      where: { system_code: { system, code } },
      // An existing row keeps its mapping and its label. A re-poll must not
      // undo an operator's decision, and must not overwrite the name they
      // recognise with a different spelling of it from the same laboratory.
      update: { seenCount: { increment: 1 }, lastSeenAt: now },
      create: {
        system,
        code,
        reportedLabel: item.display?.trim() || null,
        test: "",
        seenCount: 1,
        lastSeenAt: now,
      },
    })
  }
}

export type UnmappedCode = {
  system: string
  code: string
  reportedLabel: string | null
  seenCount: number
  lastSeenAt: Date | null
}

/** What the screen shows: codes still waiting for an answer, busiest first. */
export async function unmappedLabCodes(limit = 200): Promise<UnmappedCode[]> {
  return prisma.hospitalEhrLabCodeMap.findMany({
    where: { test: "" },
    orderBy: [{ seenCount: "desc" }, { lastSeenAt: "desc" }],
    take: limit,
    select: { system: true, code: true, reportedLabel: true, seenCount: true, lastSeenAt: true },
  })
}

/** What the screen shows as done, so an operator can check and revise it. */
export async function mappedLabCodes(): Promise<LabCodeMapEntry[]> {
  return prisma.hospitalEhrLabCodeMap.findMany({
    where: { test: { not: "" } },
    orderBy: [{ test: "asc" }, { code: "asc" }],
    select: {
      system: true, code: true, test: true, reportedLabel: true,
      assumedUnit: true, seenCount: true, lastSeenAt: true,
    },
  })
}

export type LabCodeMapError =
  /** The chosen test is not in our library. A stale screen, or a bad client. */
  | "UNKNOWN_TEST"
  /** A code cannot be mapped to nothing by this route; unmap it explicitly. */
  | "MISSING_TEST"

/**
 * Point one of their codes at one of our tests.
 *
 * The test is checked against the library rather than trusted, because the
 * library is code and cannot be a foreign key: a release that renames or
 * removes a test would otherwise leave rows pointing at a name that no longer
 * exists, and results would quietly stop being placed.
 */
export async function mapLabCode(input: {
  system: string
  code: string
  test: string
  assumedUnit?: string | null
  actorId: string
  now?: Date
}): Promise<{ ok: true } | { ok: false; error: LabCodeMapError }> {
  const test = input.test.trim()
  if (!test) return { ok: false, error: "MISSING_TEST" }
  if (!LIBRARY_TESTS.has(test)) return { ok: false, error: "UNKNOWN_TEST" }

  const system = input.system.trim()
  const code = input.code.trim()
  const now = input.now ?? new Date()
  const assumedUnit = input.assumedUnit?.trim() || null

  await prisma.hospitalEhrLabCodeMap.upsert({
    where: { system_code: { system, code } },
    update: { test, assumedUnit, mappedAt: now, mappedById: input.actorId },
    create: { system, code, test, assumedUnit, mappedAt: now, mappedById: input.actorId },
  })
  return { ok: true }
}

/**
 * Undo a mapping without forgetting the code.
 *
 * The row stays, holding its count and the name the laboratory uses, so the
 * code reappears on the screen as a question rather than vanishing and being
 * rediscovered from scratch the next time a result arrives.
 */
export async function unmapLabCode(input: {
  system: string
  code: string
  actorId: string
  now?: Date
}): Promise<void> {
  await prisma.hospitalEhrLabCodeMap.updateMany({
    where: { system: input.system.trim(), code: input.code.trim() },
    data: { test: "", assumedUnit: null, mappedAt: input.now ?? new Date(), mappedById: input.actorId },
  })
}
