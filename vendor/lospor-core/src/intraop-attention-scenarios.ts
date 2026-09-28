import type { IntraopAttentionAction, IntraopAttentionContext, IntraopAttentionKind } from "./intraop-attention"
import type { LogEvent } from "./intraop-types"

/**
 * Scenarios for the items the timeline asks about (9.13.0), shared by Core's
 * own tests and the PWA's and the web app's. Each app feeds these through its
 * screens and asserts it lists exactly `expected` and writes exactly
 * `resolutions` -- so the two cannot drift apart without a test failing.
 */

export type IntraopAttentionScenario = {
  name: string
  log: LogEvent[]
  context: IntraopAttentionContext
  expected: { key: string; kind: IntraopAttentionKind }[]
  resolutions: {
    key: string
    action: IntraopAttentionAction
    /** Event ids removed, in any order. */
    removes?: string[]
    /** Fields each updated event must carry. */
    updates?: Record<string, Partial<LogEvent>>
  }[]
}

const START = "2026-09-27T11:00:00.000Z"
const at = (minutes: number) => new Date(Date.parse(START) + minutes * 60_000).toISOString()

const remifentanil = (extra: Partial<LogEvent> = {}): LogEvent => ({
  id: "remi", ts: at(0), recordedAt: at(0), type: "infusion_start", infId: "i",
  name: "Remifentanil", rate: "0.1", unit: "mcg/kg/min", ...extra,
})

export const INTRAOP_ATTENTION_SCENARIOS: IntraopAttentionScenario[] = [
  {
    name: "a stop dragged ahead at 14:13 for 14:45, read at 14:50",
    log: [remifentanil(), { id: "stop", ts: at(45), recordedAt: at(13), type: "infusion_stop", infId: "i" }],
    context: { now: at(50) },
    expected: [{ key: "stop", kind: "unconfirmed_stop" }],
    resolutions: [
      { key: "stop", action: "stopped", updates: { stop: { stopConfirmed: true, ts: at(45) } } },
      { key: "stop", action: "still_running", removes: ["stop"] },
    ],
  },
  {
    name: "the same stop before its time: nothing to ask yet",
    log: [remifentanil(), { id: "stop", ts: at(45), recordedAt: at(13), type: "infusion_stop", infId: "i" }],
    context: { now: at(30) },
    expected: [],
    resolutions: [],
  },
  {
    name: "a planned stop at 14:45, case ended at 14:30",
    log: [remifentanil(), { id: "stop", ts: at(45), recordedAt: at(13), type: "infusion_stop", infId: "i" }],
    context: { now: at(30), endedAt: at(30) },
    expected: [{ key: "stop", kind: "after_end" }],
    resolutions: [
      { key: "stop", action: "happened", updates: { stop: { ts: at(30), endCaseStop: true } } },
      { key: "stop", action: "did_not_happen", removes: ["stop"] },
    ],
  },
  {
    name: "a planned rate change at 14:45, case ended at 14:30",
    log: [remifentanil(), { id: "rate", ts: at(45), recordedAt: at(13), type: "infusion_rate", infId: "i", rate: "0.2", unit: "mcg/kg/min" }],
    context: { now: at(30), endedAt: at(30) },
    expected: [{ key: "rate", kind: "after_end" }],
    resolutions: [
      { key: "rate", action: "happened", updates: { rate: { ts: at(30) } } },
      { key: "rate", action: "did_not_happen", removes: ["rate"] },
    ],
  },
  {
    name: "a planned infusion start after the end takes its change and stop with it",
    log: [
      remifentanil({ id: "late", ts: at(40), infId: "late" }),
      { id: "late-rate", ts: at(45), type: "infusion_rate", infId: "late", rate: "0.2", unit: "mcg/kg/min" },
      { id: "late-stop", ts: at(50), type: "infusion_stop", infId: "late" },
    ],
    context: { now: at(30), endedAt: at(30) },
    expected: [
      { key: "late", kind: "after_end" },
      { key: "late-rate", kind: "after_end" },
      { key: "late-stop", kind: "after_end" },
    ],
    resolutions: [{ key: "late", action: "did_not_happen", removes: ["late", "late-rate", "late-stop"] }],
  },
  {
    name: "an unconfirmed stop before the end is still asked about once the case ended",
    log: [remifentanil(), { id: "stop", ts: at(20), recordedAt: at(5), type: "infusion_stop", infId: "i" }],
    context: { now: at(40), endedAt: at(30) },
    expected: [{ key: "stop", kind: "unconfirmed_stop" }],
    resolutions: [{ key: "stop", action: "stopped", updates: { stop: { stopConfirmed: true } } }],
  },
  {
    name: "stops charted at or after their time, and pre-9.13.0 stops, are never asked about",
    log: [
      remifentanil(),
      { id: "fluid", ts: at(0), type: "fluid_start", fluidId: "f", name: "Ringer", category: "Crystalloids", fluidEntryMode: "VOLUME", volume: "500" },
      { id: "fluid-end", ts: at(20), recordedAt: at(25), type: "fluid_end", fluidId: "f" },
      { id: "stop", ts: at(22), type: "infusion_stop", infId: "i" },
    ],
    context: { now: at(40) },
    expected: [],
    resolutions: [],
  },
]
