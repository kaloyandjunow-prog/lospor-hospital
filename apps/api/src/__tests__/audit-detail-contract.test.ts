import { readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

import { assertSafeAuditDetail } from "@/lib/audit-evidence"

/**
 * Every audit payload the API constructs, checked against the real guard.
 *
 * This exists because the guard and the routes it guards were tested entirely
 * apart. Route suites mock the writer -- `vi.mock("@/lib/audit", () => ({
 * logAuditInTransaction: vi.fn() }))` appears throughout -- so a payload the
 * guard rejects still passed every test, while in production
 * logAuditInTransaction threw *inside the caller's transaction* and rolled the
 * whole act back with it.
 *
 * Five administrative actions were broken that way and nothing reported it:
 * account suspension, reactivation, restoration, authority change, and
 * institution-scoped clinical preset selection. Two more -- the PII block and
 * the maintenance seed refusal -- called the non-throwing writer instead, so
 * they did not break the request; they silently discarded a security record on
 * every occurrence.
 *
 * The rule the guard enforces is that operator free text never enters an audit
 * detail. The shape that satisfies it is a boolean -- `reasonRecorded` -- or,
 * where the value is a bounded enum rather than prose, a key the guard permits,
 * such as `reasonCode`.
 */

const SOURCE_ROOT = join(process.cwd(), "src")

/** Keys the guard rejects, in the shapes the codebase has actually used. */
const REJECTED_SHAPES: Array<[string, object]> = [
  ["a bare reason", { reason: "an administrator's explanation" }],
  ["a reason that is undefined", { reason: undefined }],
  ["a nested reason", { outer: { reason: "still free text" } }],
  ["a suffixed reason", { declineReason: "no" }],
]

/** The shapes callers are expected to use instead. */
const ACCEPTED_SHAPES: Array<[string, object]> = [
  ["reasonRecorded", { reasonRecorded: true }],
  ["reasonCode with a bounded enum", { reasonCode: "likely_name" }],
  ["correctionReasonRecorded", { correctionReasonRecorded: true }],
]

describe("the audit detail privacy contract", () => {
  it.each(REJECTED_SHAPES)("rejects %s", (_label, detail) => {
    expect(() => assertSafeAuditDetail(detail)).toThrow(/Unsafe audit detail field/)
  })

  it.each(ACCEPTED_SHAPES)("accepts %s", (_label, detail) => {
    expect(() => assertSafeAuditDetail(detail)).not.toThrow()
  })

  /**
   * The check that would have caught the original defect.
   *
   * A literal `reason:` key inside an audit call is the exact construction that
   * throws. Scanning the source is cruder than driving each route, but it holds
   * for every present and future call site without needing a database, and it
   * fails on the shape rather than on one route somebody remembered to cover.
   */
  it("no audit call in the API passes a key the guard would reject", () => {
    const files = readdirSync(SOURCE_ROOT, { recursive: true, encoding: "utf8" })
      .filter(name => name.endsWith(".ts"))
      .filter(name => !name.includes(".test.") && !name.includes("generated"))

    const offenders: string[] = []
    for (const name of files) {
      const source = readFileSync(join(SOURCE_ROOT, name), "utf8")
      const lines = source.split("\n")
      lines.forEach((line, index) => {
        if (!/logAudit(InTransaction)?\s*\(/.test(line)) return
        // Call sites only. The writer's own definition in audit-evidence.ts
        // matches the same pattern, and scanning forward from it runs into
        // recordAdministrativeReason -- which stores `reason` on purpose,
        // because storing it somewhere governed is the entire point of it.
        if (/function\s+logAudit/.test(line)) return
        // Only the call's own argument list. A fixed line window reached past
        // the closing `})` and matched `reason: string` in the signature of the
        // *next* function, reporting two call sites that were already correct.
        const collected: string[] = []
        for (let cursor = index; cursor < lines.length && cursor < index + 40; cursor += 1) {
          collected.push(lines[cursor]!)
          if (/^\s*\}?\)\s*$/.test(lines[cursor]!)) break
        }
        const keys = collected.join("\n").match(/(\w*)([Rr]eason)\s*:/g) ?? []
        for (const key of keys) {
          const normalized = key.replace(/\s*:$/, "").toLowerCase().replace(/[^a-z0-9]/g, "")
          if (normalized.endsWith("reason")) {
            offenders.push(`${name}:${index + 1} passes \`${key.replace(/\s*:$/, "")}\``)
          }
        }
      })
    }

    expect(offenders, [
      "These audit calls pass a key assertSafeAuditDetail rejects.",
      "logAuditInTransaction throws inside the caller's transaction, so the act",
      "is rolled back; logAudit swallows it, so the record is lost silently.",
      "Use `reasonRecorded: Boolean(...)`, or `reasonCode` for a bounded enum.",
    ].join(" ")).toEqual([])
  })
})
