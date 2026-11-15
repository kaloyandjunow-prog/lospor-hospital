import type { Prisma, PrismaClient } from "@/generated/prisma/client"

/** Anything that can run a `case` query — the client, or a `$transaction` handle. */
type Db = PrismaClient | Prisma.TransactionClient

/** The department's clock (Europe/Sofia), the same as its calendar day everywhere else. */
const CASE_CODE_TIMEZONE = "Europe/Sofia"

/** "20261115-143207": the department's date and time to the second. */
export function caseCodeStamp(at: Date): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: CASE_CODE_TIMEZONE,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(at)
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find(item => item.type === type)?.value ?? "00"
  return `${part("year")}${part("month")}${part("day")}-${part("hour")}${part("minute")}${part("second")}`
}

/**
 * The year and sequence number a code carries, in either format: the appliance's
 * "20261115-143207-0042" (hospital 1.9.2) or the older "2026-0042", which cases
 * created before it keep. Null for anything else.
 */
export function parseCaseCode(caseCode: string): { year: number; issued: number; stamp: string | null } | null {
  const stamped = /^(\d{4})\d{4}-\d{6}-(\d+)$/.exec(caseCode)
  if (stamped) return { year: Number(stamped[1]), issued: Number(stamped[2]), stamp: caseCode.slice(0, 15) }
  const plain = /^(\d{4})-(\d+)$/.exec(caseCode)
  if (plain) return { year: Number(plain[1]), issued: Number(plain[2]), stamp: null }
  return null
}

function sequenceNumber(issued: number): string {
  return String(issued).padStart(4, "0")
}

/**
 * Next case code, e.g. "20261115-143207-0007": the department's date and time
 * the case was created, to the second, then the clinician's yearly sequence
 * number. Appliance only; the code never leaves the hospital (the research
 * export and Central carry a pseudonym instead).
 *
 * The time alone is not unique -- two cases can be created in the same second --
 * so the sequence number stays, and with it the guarantees below.
 */
export async function generateCaseCode(userId: string, db: Db, at: Date = new Date()): Promise<string> {
  const stamp = caseCodeStamp(at)
  return `${stamp}-${sequenceNumber(await issueNumber(userId, db, Number(stamp.slice(0, 4))))}`
}

/**
 * A new number for a case that clashes with one the recipient of a handover
 * already holds. Only the sequence number changes: the date and time say when
 * the case was created, and that does not change because it moved.
 */
export async function renumberCaseCode(userId: string, db: Db, caseCode: string): Promise<string> {
  const parsed = parseCaseCode(caseCode)
  if (!parsed) return generateCaseCode(userId, db)
  const issued = sequenceNumber(await issueNumber(userId, db, parsed.year))
  return parsed.stamp ? `${parsed.stamp}-${issued}` : `${parsed.year}-${issued}`
}

/**
 * Next number in a user's yearly sequence.
 *
 * Codes are per-user and reset each calendar year. Uniqueness is
 * `@@unique([userId, caseCode])`, so two clinicians both holding 2026-0001 is
 * normal and expected — which is precisely why a case moving between users may
 * have to be renumbered. See `transferCaseOwnership`.
 *
 * Takes a `Db` so it can run inside the same transaction as the write that
 * consumes it; computing a code outside the transaction that inserts it leaves
 * a race the unique index has to catch.
 *
 * A renumbering stays in the year the code already carries. A case handed over
 * in January and performed the previous December must not be renumbered into
 * the recipient's *new* year: the code is printed on the anaesthetic chart, and
 * a 2027 number on a 2026 operation misdates the record and puts it in the
 * wrong year's sequence for anyone counting.
 */
async function issueNumber(userId: string, db: Db, year: number): Promise<number> {
  // Read from a counter, never from the cases this person currently owns.
  //
  // Deriving it from ownership is what made handovers unsafe: hand away your
  // highest case and the ceiling drops, so the next case you create takes the
  // number you just handed over -- already printed on that chart, and accepted
  // by the database because the old case now belongs to someone else.
  //
  // The counter is seeded for every existing clinician-year by
  // 20260819160000_case_code_sequence, so it starts above everything already
  // issued. `increment` is a single atomic UPDATE, and it runs in the caller's
  // transaction, so a case that rolls back does not burn a number.
  const sequence = await db.caseCodeSequence.upsert({
    where: { userId_year: { userId, year } },
    // First case of a year for this clinician: issue 1, store 2.
    create: { userId, year, next: 2 },
    update: { next: { increment: 1 } },
    select: { next: true },
  })
  // upsert returns the row after the write in both branches, so the number just
  // issued is one below what is stored for next time.
  return sequence.next - 1
}

/**
 * Make sure `userId`'s counter is above `caseCode`, so it is never issued again.
 *
 * A case arriving by handover keeps its number whenever the recipient does not
 * already hold it — which is the common case, and means a number lands in their
 * sequence that their own counter knows nothing about. Left alone the counter
 * would walk up to it and issue it a second time.
 *
 * Called on every transfer, including the ones that did not renumber. Cheap,
 * and the alternative is relying on a unique-constraint retry to notice, which
 * only works where a retry exists.
 */
export async function reserveCaseCode(userId: string, db: Db, caseCode: string): Promise<void> {
  const parsed = parseCaseCode(caseCode)
  if (!parsed) return
  const year = parsed.year
  const after = parsed.issued + 1

  const existing = await db.caseCodeSequence.findUnique({
    where: { userId_year: { userId, year } },
    select: { next: true },
  })
  if (!existing) {
    await db.caseCodeSequence.create({ data: { userId, year, next: after } })
    return
  }
  // Only ever forward. A handover of an old, low-numbered case must not drag
  // the counter back over numbers already issued.
  if (existing.next < after) {
    await db.caseCodeSequence.update({
      where: { userId_year: { userId, year } },
      data: { next: after },
    })
  }
}

/** True when `err` is a Prisma unique-constraint violation, optionally on `field`. */
export function isPrismaUniqueError(err: unknown, field?: string): boolean {
  if (!err || typeof err !== "object" || !("code" in err) || err.code !== "P2002") return false
  if (!field) return true
  const target = "meta" in err && err.meta && typeof err.meta === "object" && "target" in err.meta
    ? err.meta.target
    : undefined
  return Array.isArray(target) ? target.includes(field) : false
}
