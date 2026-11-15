import { describe, expect, it } from "vitest"

import { intraopAttentionItems, intraopResolveAttention, type IntraopAttentionContext } from "./intraop-attention"
import type { LogEvent } from "./intraop-types"
import { INTRAOP_ATTENTION_SCENARIOS } from "./intraop-attention-scenarios"

describe.each(INTRAOP_ATTENTION_SCENARIOS)("$name", scenario => {
  it("lists exactly the expected items", () => {
    expect(intraopAttentionItems(scenario.log, scenario.context).map(item => ({ key: item.key, kind: item.kind })))
      .toEqual(scenario.expected)
  })

  it.each(scenario.resolutions.map(resolution => [resolution.action, resolution] as const))(
    "%s writes exactly its operations",
    (_action, resolution) => {
      const ops = intraopResolveAttention(scenario.log, resolution.key, resolution.action, scenario.context)
      expect(ops.add).toEqual([])
      expect([...ops.remove].sort()).toEqual([...(resolution.removes ?? [])].sort())
      expect(ops.update.map(event => event.id).sort()).toEqual(Object.keys(resolution.updates ?? {}).sort())
      for (const event of ops.update) expect(event).toMatchObject(resolution.updates![event.id])
    },
  )
})

describe("answers that no longer fit", () => {
  it("write nothing", () => {
    const [scenario] = INTRAOP_ATTENTION_SCENARIOS
    expect(intraopResolveAttention(scenario.log, "stop", "happened", scenario.context))
      .toEqual({ add: [], update: [], remove: [] })
    expect(intraopResolveAttention(scenario.log, "unknown", "stopped", scenario.context))
      .toEqual({ add: [], update: [], remove: [] })
  })
})

describe("what each question is about", () => {
  it("names the item a stop belongs to", () => {
    const [scenario] = INTRAOP_ATTENTION_SCENARIOS
    expect(intraopAttentionItems(scenario.log, scenario.context)[0].subject).toBe("Remifentanil")
  })
})

describe("the line shown for a question", () => {
  it("says what it is about, in English and in Bulgarian", async () => {
    const { intraopAttentionText } = await import("./intraop-attention")
    const [stop] = INTRAOP_ATTENTION_SCENARIOS
    const [item] = intraopAttentionItems(stop.log, stop.context)
    expect(intraopAttentionText(item, "en")).toBe("Remifentanil · Infusion stopped")
    expect(intraopAttentionText(item, "bg")).toBe("Remifentanil · Спиране на инфузия")
    const rate = INTRAOP_ATTENTION_SCENARIOS.find(scenario => scenario.name.includes("rate change"))!
    const [change] = intraopAttentionItems(rate.log, rate.context)
    expect(intraopAttentionText(change, "bg")).toBe("Remifentanil · Промяна на инфузия 0.2 mcg/kg/min")
  })

  it("never shows an entry's raw type for anything charted after the end", async () => {
    const { intraopAttentionText } = await import("./intraop-attention")
    const log: LogEvent[] = [
      { id: "pos", ts: "2026-11-15T11:00:00Z", type: "position_change", name: "PRONE" },
      { id: "phase", ts: "2026-11-15T11:01:00Z", type: "phase_change", name: "emergence" },
      { id: "comp", ts: "2026-11-15T11:02:00Z", type: "complication", label: "Hypotension" },
      { id: "shock", ts: "2026-11-15T11:03:00Z", type: "defibrillation", energyJ: 150 },
      { id: "event", ts: "2026-11-15T11:04:00Z", type: "clinical_event" },
    ]
    const items = intraopAttentionItems(log, { now: "2026-11-15T12:00:00Z", endedAt: "2026-11-15T10:00:00Z" } as IntraopAttentionContext)
    expect(items.map(item => item.kind)).toEqual(["after_end", "after_end", "after_end", "after_end", "after_end"])
    for (const locale of ["en", "bg"]) {
      for (const item of items) {
        const text = intraopAttentionText(item, locale)
        expect(text, `${item.event.type} ${locale}`).not.toMatch(/^(position_change|phase_change|complication|defibrillation|clinical_event)$|_/)
        expect(text.length, `${item.event.type} ${locale}`).toBeGreaterThan(0)
      }
    }
    expect(items.map(item => intraopAttentionText(item, "bg"))).toEqual([
      "Позиция по корем", "Етап · Събуждане", "Хипотенсия", "Дефибрилация · 150 J", "Събитие",
    ])
  })
})
