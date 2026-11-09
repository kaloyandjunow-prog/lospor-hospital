import { describe, expect, it } from "vitest"
import { intraopAttentionItems, intraopAttentionText, intraopResolveAttention, type IntraopAttentionItem } from "../intraop-attention"
import { applyIntraopEventOps } from "../intraop-timetable-edit"
import { scenario } from "./scenarios"

/**
 * A stress test for everything the clinician can be asked at once (10.2.0). Random logs and patients go through the
 * whole attention engine and the same few rules must always hold: it never throws, every line has its own key,
 * answering a line writes something and removes that line, answering the same line twice changes nothing more, and
 * answering one line never makes another one disappear. The seeds are fixed, so a failure names the case that
 * breaks and reproduces.
 */

// FUZZ_SEEDS=5000 npx vitest run src/intraop-suggestions/attention-fuzz.test.ts hunts further; the default keeps CI quick.
const SEEDS = Number((globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.FUZZ_SEEDS ?? 0) || 0

describe("the attention engine under random logs", () => {
  it("is fed enough variety to mean something: every kind of line turns up", () => {
    const seen = new Map<string, number>()
    for (let seed = 1; seed <= (SEEDS || 400); seed++) {
      const { log, context } = scenario(seed)
      for (const item of intraopAttentionItems(log, context)) {
        const kind = item.suggestion ? `suggestion:${item.suggestion.item.type}` : item.kind
        seen.set(kind, (seen.get(kind) ?? 0) + 1)
      }
    }
    for (const kind of ["suggestion:card", "suggestion:reverse", "suggestion:reading", "suggestion:timer", "suggestion:context", "suggestion:reminder", "vital_deviation", "unconfirmed_stop"]) {
      expect(seen.get(kind) ?? 0, `${kind} (saw ${JSON.stringify([...seen])})`).toBeGreaterThan(0)
    }
  })

  it("never throws, keeps every key unique, and writes text in both languages", () => {
    for (let seed = 1; seed <= (SEEDS || 400); seed++) {
      const { log, context } = scenario(seed)
      let items: IntraopAttentionItem[] = []
      expect(() => { items = intraopAttentionItems(log, context) }, `seed ${seed}`).not.toThrow()
      const keys = items.map(item => item.key)
      expect(new Set(keys).size, `seed ${seed} repeats a key: ${keys.join(" | ")}`).toBe(keys.length)
      for (const item of items) {
        expect(() => intraopAttentionText(item, "en"), `seed ${seed} ${item.key} en`).not.toThrow()
        const bg = intraopAttentionText(item, "bg")
        expect(bg.trim().length, `seed ${seed} ${item.key} bg`).toBeGreaterThan(0)
        expect(/undefined|NaN|\[object/.test(bg + intraopAttentionText(item, "en")), `seed ${seed} ${item.key} prints a hole`).toBe(false)
      }
    }
  })

  it("answers a line once: it leaves, nothing else leaves, and answering again changes nothing", () => {
    const problems: string[] = []
    for (let seed = 1; seed <= (SEEDS || 250); seed++) {
      const { log, context } = scenario(seed)
      const items = intraopAttentionItems(log, context)
      for (const item of items) {
        for (const action of item.actions) {
          if (action === "open") continue
          const choice = item.suggestion?.item.type === "reverse" ? item.suggestion.item.question.choices[0]
            : item.suggestion?.item.type === "reading" && item.suggestion.item.question.kind === "nearZero" ? item.suggestion.item.question.choices[0]
            : undefined
          let ops
          try { ops = intraopResolveAttention(log, item.key, action, context, choice) } catch (error) { problems.push(`seed ${seed} ${item.key} ${action} throws ${String(error)}`); continue }
          if (ops.add.length + ops.update.length + ops.remove.length === 0) {
            // An answer that needs a pick it was not given writes nothing, which is fine; anything else is a dead button.
            if (!(action === "log_complication" && item.suggestion && choice == null && (item.suggestion.item.type === "reverse" || item.suggestion.item.type === "reading"))) {
              problems.push(`seed ${seed} ${item.key} ${action} writes nothing`)
            }
            continue
          }
          const after = applyIntraopEventOps(log, ops)
          const nextItems = intraopAttentionItems(after, context)
          const nextKeys = new Set(nextItems.map(next => next.key))
          const gone = items.filter(other => other.key !== item.key && !nextKeys.has(other.key)).map(other => other.key)
          // Logging a complication from a vitals question turns the question into a card; that is the one expected swap.
          if (gone.length && action !== "log_complication") problems.push(`seed ${seed} ${action} on ${item.key} also removes ${gone.join(", ")}`)
          if (action !== "log_complication" && nextKeys.has(item.key)) problems.push(`seed ${seed} ${action} on ${item.key} leaves it waiting`)
          const again = applyIntraopEventOps(after, ops)
          if (again.length !== after.length) problems.push(`seed ${seed} ${action} on ${item.key} grows the log when applied twice (${after.length} -> ${again.length})`)
        }
      }
    }
    expect(problems.slice(0, 25)).toEqual([])
  }, SEEDS ? 600_000 : 30_000)
})
