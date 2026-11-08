import React from "react"
import { describe, expect, it, vi } from "vitest"
import { parseIntraopAutomation } from "@lospor/core/intraop-automation"
import type { SuggestionContext } from "@lospor/core/intraop-suggestions"

vi.mock("@/lib/preferences-context", () => ({ usePreferences: () => ({ tc: (key: string) => key, language: "en" }) }))

import { render } from "@/test/render"
import { act } from "react-test-renderer"
import type { LogEvent } from "@/lib/intraop-log-event"
import { phoneGateWarnings } from "./phone-suggestion-sheets"
import { DEATH_EVENT_LABEL, usePhoneDeathPrompt } from "./use-phone-death-prompt"
import { IntraopAttentionBanner } from "@/components/intraop/IntraopAttentionBanner"

const NOW = "2026-11-02T10:30:00.000Z"
const context = (extra: Partial<Omit<SuggestionContext, "now">> = {}, reminders = true): Omit<SuggestionContext, "now"> => ({
  settings: parseIntraopAutomation({ enabled: true, groups: { reminders } }), user: {},
  patient: { ageDays: 40 * 365, weightKg: 80, idealWeightKg: 70 }, preop: {}, tofMonitor: false, keepLogging: true, labs: [], ...extra,
})
const words = { mh: "MH!", laMax: "Over the maximum" }

describe("the phone's word before an entry (10.2.0)", () => {
  it("warns before a volatile or suxamethonium with an MH history, under the reminders group only", () => {
    expect(phoneGateWarnings(context({ preop: { mhHistory: true } }), [], { type: "agent_start", name: "SEVOFLURANE" }, words, "en", NOW)).toEqual(["MH!"])
    expect(phoneGateWarnings(context({ preop: { mhHistory: true } }), [], { type: "drug", name: "Suxamethonium", atcCode: "M03AB01" }, words, "en", NOW)).toEqual(["MH!"])
    expect(phoneGateWarnings(context({ preop: { mhHistory: true } }, false), [], { type: "agent_start", name: "SEVOFLURANE" }, words, "en", NOW)).toEqual([])
    expect(phoneGateWarnings(null, [], { type: "agent_start", name: "SEVOFLURANE" }, words, "en", NOW)).toEqual([])
  })

  it("warns when a local anaesthetic bolus goes over the maximum on ideal weight", () => {
    const log = [{ id: "b", ts: "2026-11-02T10:00:00.000Z", type: "drug", name: "Bupivacaine", dose: "100", unit: "mg" }] as LogEvent[]
    const [warning] = phoneGateWarnings(context(), log, { type: "drug", name: "Bupivacaine", dose: "50", unit: "mg" }, words, "en", NOW)
    expect(warning).toContain("Over the maximum")
    expect(warning).toContain("140 mg")
    expect(phoneGateWarnings(context(), log, { type: "drug", name: "Bupivacaine", dose: "30", unit: "mg" }, words, "en", NOW)).toEqual([])
  })
})

describe("each phone warning is its own switch (10.2.0)", () => {
  const off = (...ids: string[]) => context({
    settings: parseIntraopAutomation({ enabled: true, groups: { reminders: true }, disabled: ids }), preop: { mhHistory: true },
  })
  it("keeps the other warning when one is switched off", () => {
    const sevo = { type: "agent_start", name: "SEVOFLURANE" }
    expect(phoneGateWarnings(off(), [], sevo, words, "en", NOW)).toEqual(["MH!"])
    expect(phoneGateWarnings(off("reminder:mhHistory"), [], sevo, words, "en", NOW)).toEqual([])
    const log = [{ id: "b1", ts: "2026-11-02T10:00:00.000Z", type: "drug", name: "Bupivacaine", dose: "100", unit: "mg" }] as LogEvent[]
    const bolus = { type: "drug", name: "Bupivacaine", dose: "50", unit: "mg" }
    expect(phoneGateWarnings(off(), log, bolus, words, "en", NOW)).toHaveLength(1)
    expect(phoneGateWarnings(off("reminder:localAnaestheticMax"), log, bolus, words, "en", NOW)).toEqual([])
  })
})

describe("a death charted on the phone", () => {
  it("calls once for a death charted here, never for one already on the case or on a watching screen", () => {
    const onDeath = vi.fn()
    const death = { id: "d", ts: NOW, type: "clinical_event", label: DEATH_EVENT_LABEL } as LogEvent
    function Probe({ log, active, call }: { log: LogEvent[]; active: boolean; call: () => void }) { usePhoneDeathPrompt(log, active, call); return null }
    const tree = render(<Probe log={[]} active call={onDeath} />)
    act(() => { tree.update(<Probe log={[death]} active call={onDeath} />) })
    act(() => { tree.update(<Probe log={[death]} active call={onDeath} />) })
    expect(onDeath).toHaveBeenCalledTimes(1)
    const already = vi.fn()
    render(<Probe log={[death]} active call={already} />)
    const watching = vi.fn()
    const w = render(<Probe log={[]} active={false} call={watching} />)
    act(() => { w.update(<Probe log={[death]} active={false} call={watching} />) })
    expect(already).not.toHaveBeenCalled()
    expect(watching).not.toHaveBeenCalled()
  })
})

describe("the latex banner", () => {
  it("shows above the chart when the preop record has a latex allergy", () => {
    const suggestions = { ...context({ preop: { latexAllergy: true } }), now: NOW }
    const tree = render(<IntraopAttentionBanner attention={{ items: [], resolve: vi.fn(async () => {}), clockOf: () => "", labelOf: () => "", suggestions }} />)
    expect(tree.root.findAll(node => node.props?.testID === "latex-banner").length).toBeGreaterThan(0)
  })
})
