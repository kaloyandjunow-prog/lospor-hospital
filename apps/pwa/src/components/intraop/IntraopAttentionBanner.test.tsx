import React from "react"
import { act } from "react-test-renderer"
import { describe, expect, it, vi } from "vitest"
import { intraopAttentionItems } from "@lospor/core/intraop-attention"
import { INTRAOP_ATTENTION_SCENARIOS } from "@lospor/core/intraop-attention-scenarios"

const preferences = vi.hoisted(() => ({ language: "en" }))
vi.mock("@/lib/preferences-context", () => ({ usePreferences: () => ({ tc: (key: string) => key, language: preferences.language }) }))

import { logAfterAttentionAnswer } from "@/lib/use-intraop-attention"
import { render } from "@/test/render"
import { IntraopAttentionBanner } from "./IntraopAttentionBanner"

// The PWA against Core's shared scenarios (9.13.0). The web app runs the same
// scenarios; if either lists or writes differently, its own test fails.

const answerTestIds = {
  stopped: "attention-stopped",
  still_running: "attention-still-running",
  happened: "end-case-after-end-move",
  did_not_happen: "end-case-after-end-delete",
} as const

describe.each(INTRAOP_ATTENTION_SCENARIOS)("$name", scenario => {
  it("shows exactly the items Core lists, and each answer reaches Core unchanged", () => {
    const resolve = vi.fn(async () => {})
    const items = intraopAttentionItems(scenario.log, scenario.context)
    const tree = render(
      <IntraopAttentionBanner attention={{ items, resolve, clockOf: () => "00:00", labelOf: event => event.id }} />,
    )
    const shown = tree.root.findAll(node => typeof node.props?.testID === "string" && node.props.testID.startsWith("attention-stopped-")
      || typeof node.props?.testID === "string" && node.props.testID.startsWith("end-case-after-end-move-"))
      .map(node => String(node.props.testID).replace(/^(attention-stopped|end-case-after-end-move)-/, ""))
    expect([...new Set(shown)]).toEqual(scenario.expected.map(item => item.key))
    for (const resolution of scenario.resolutions) {
      const button = tree.root.findAll(node => node.props?.testID === `${answerTestIds[resolution.action]}-${resolution.key}`)[0]
      act(() => { button.props.onPress() })
      expect(resolve).toHaveBeenLastCalledWith(resolution.key, resolution.action)
    }
  })

  it.each(scenario.resolutions.map(resolution => [resolution.action, resolution] as const))(
    "%s writes Core's operations into the log",
    (_action, resolution) => {
      const next = logAfterAttentionAnswer(scenario.log, resolution.key, resolution.action, scenario.context)!
      for (const removed of resolution.removes ?? []) expect(next.some(event => event.id === removed)).toBe(false)
      for (const [id, fields] of Object.entries(resolution.updates ?? {})) {
        expect(next.find(event => event.id === id)).toMatchObject(fields)
      }
    },
  )
})

describe("a change the server refused", () => {
  it("is listed in Core's words at the entry's own time, until marked seen", async () => {
    const { intraopRefusedEntry } = await import("@lospor/core/intraop-attention")
    const log = [
      { id: "start", ts: "2026-09-27T12:00:00.000Z", type: "infusion_start", infId: "i", name: "Remifentanil", rate: "0.1", unit: "mcg/kg/min" },
      { id: "stop", ts: "2026-09-27T12:40:00.000Z", type: "infusion_stop", infId: "i" },
    ] as never[]
    const refused = [{ eventId: "stop", status: 412, at: "2026-09-27T12:50:00.000Z", change: "edit" as const, event: { id: "stop", ts: "2026-09-27T12:35:00.000Z", type: "infusion_stop", infId: "i" } }]
    const dismissRefused = vi.fn()
    const clockOf = (ts: string) => ts.slice(11, 16)
    const tree = render(
      <IntraopAttentionBanner attention={{
        items: [], resolve: vi.fn(async () => {}), clockOf, labelOf: () => "raw label", log,
        saveState: { queuedEventIds: [], sendingEventId: null, refused, queuedSections: [], dismissRefused },
      }} />,
    )
    const text = tree.root.findAll(node => String(node.type) === "Text")
      .map(node => node.children.filter(child => typeof child === "string").join("")).join("\n")
    const entry = intraopRefusedEntry(refused[0], "en", log)
    expect(text).toContain(`12:35 · ${entry.text}`)
    expect(text).toContain("Remifentanil")
    expect(text).not.toContain("raw label")
    act(() => { tree.root.findAll(node => node.props?.testID === "intraop-refused-dismiss")[0].props.onPress() })
    expect(dismissRefused).toHaveBeenCalled()
  })
})

describe("in Bulgarian", () => {
  it.each(INTRAOP_ATTENTION_SCENARIOS.filter(scenario => scenario.expected.length > 0))("$name says Core's Bulgarian line", async scenario => {
    const { intraopAttentionText } = await import("@lospor/core/intraop-attention")
    preferences.language = "bg"
    try {
      const items = intraopAttentionItems(scenario.log, scenario.context)
      const tree = render(
        <IntraopAttentionBanner attention={{ items, resolve: vi.fn(async () => {}), clockOf: () => "00:00", labelOf: () => "" }} />,
      )
      const text = tree.root.findAll(node => String(node.type) === "Text")
        .map(node => node.children.filter(child => typeof child === "string").join(""))
        .join("\n")
      for (const item of items) expect(text).toContain(intraopAttentionText(item, "bg"))
      expect(/[А-Яа-я]/.test(text)).toBe(true)
    } finally {
      preferences.language = "en"
    }
  })
})
