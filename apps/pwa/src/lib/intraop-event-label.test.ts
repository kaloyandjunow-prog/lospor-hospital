import { describe, expect, it } from "vitest"
import { buildEventLabel } from "./intraop-event-label"
import type { LogEvent } from "@/lib/intraop-log-event"

const ev = (e: Partial<LogEvent>): LogEvent => e as LogEvent
const colors = { drugColor: () => "#drug", clinicalEventColor: () => "#evt" }

describe("buildEventLabel", () => {
  it("drug uses the drug colour resolver when no explicit colour", () => {
    expect(buildEventLabel(ev({ type: "drug", name: "Propofol", dose: "100", unit: "mg" }), undefined, colors))
      .toEqual({ text: "Propofol 100 mg", color: "#drug", sub: undefined })
  })

  it("vital builds BP/HR with trend arrows vs the previous vital", () => {
    const out = buildEventLabel(
      ev({ type: "vital", systolic: 130, diastolic: 80, heartRate: 90 }),
      ev({ type: "vital", systolic: 120, heartRate: 90 }),
      colors,
    )
    expect(out.text).toContain("BP 130 ↑/80")
    expect(out.text).toContain("HR 90") // change < 5 -> no arrow
    expect(out.color).toBe("#22c55e")
  })

  it("clinical_event strips the qualifier before resolving colour", () => {
    expect(buildEventLabel(ev({ type: "clinical_event", label: "Hypotension (severe)" }), undefined, colors))
      .toEqual({ text: "Hypotension (severe)", color: "#evt" })
  })

  it("infusion rate change and stop", () => {
    expect(buildEventLabel(ev({ type: "infusion_rate", name: "Noradrenaline", rate: "8", unit: "mcg/min" }), undefined, colors))
      .toMatchObject({ text: "Noradrenaline → 8 mcg/min", sub: "Rate changed" })
    expect(buildEventLabel(ev({ type: "infusion_stop", name: "Noradrenaline" }), undefined, colors))
      .toMatchObject({ text: "Noradrenaline stopped", color: "#64748b" })
  })

  it("agent on/off and gas", () => {
    expect(buildEventLabel(ev({ type: "agent_start", name: "Sevoflurane", value: "2" }), undefined, colors))
      .toMatchObject({ text: "Sevoflurane 2%", sub: "Volatile" })
    expect(buildEventLabel(ev({ type: "gas_stop" }), undefined, colors))
      .toMatchObject({ text: "Gas settings stopped" })
  })
})
