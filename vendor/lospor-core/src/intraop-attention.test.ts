import { describe, expect, it } from "vitest"

import { intraopAttentionItems, intraopResolveAttention } from "./intraop-attention"
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
})
