// @vitest-environment jsdom
import { act, fireEvent, render, renderHook, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { parseIntraopAutomation } from "@lospor/core/intraop-automation"
import { dantroleneVialsView, type SuggestionContext } from "@lospor/core/intraop-suggestions"
import type { LogEvent } from "@lospor/core/intraop-types"

vi.mock("next-intl", () => ({ useTranslations: () => (key: string, values?: Record<string, unknown>) => (values ? `${key} ${JSON.stringify(values)}` : key), useLocale: () => "en" }))

import { useIntraopAttention } from "@/lib/use-intraop-attention"
import { DantroleneVials } from "./DantroleneVials"
import { SuggestionHost, type SuggestionSheets } from "./SuggestionHost"

const viewFor = (stocked: number[], givenDosesMg: number[] = []) => (perKg: number) => dantroleneVialsView({ weightKg: 140, perKg, givenDosesMg, stocked })

describe("the dantrolene vials on the web card (10.2.0)", () => {
  it("draws the plan for the dose, and stepping the dose redraws and re-plans", () => {
    render(<DantroleneVials viewFor={viewFor([20, 250])} initialPerKg={2} onGive={vi.fn()} />)
    expect(screen.getByTestId("vials-dose").textContent).toBe("280 mg")
    expect(screen.getByTestId("vials-plan").textContent).toBe("1 × 250 mg  +  2 × 20 mg")
    expect(screen.getAllByTestId("dantrolene-vial")).toHaveLength(3)
    fireEvent.click(screen.getByTestId("vials-inc"))
    expect(screen.getByTestId("vials-dose").textContent).toBe("350 mg")
    expect(screen.getByTestId("vials-plan").textContent).toBe("1 × 250 mg  +  5 × 20 mg")
    expect(screen.getAllByTestId("dantrolene-vial")).toHaveLength(6)
    fireEvent.click(screen.getByTestId("vials-dec"))
    fireEvent.click(screen.getByTestId("vials-dec"))
    // 1.5 mg/kg is 210 mg: a 250 would leave 40 mg, more than a whole 20 mg vial, so eleven 20s.
    expect(screen.getByTestId("vials-dose").textContent).toBe("210 mg")
    expect(screen.getByTestId("vials-plan").textContent).toBe("11 × 20 mg")
  })

  it("counts the vials already opened, and notes the 10 mg/kg threshold from the total", () => {
    render(<DantroleneVials viewFor={viewFor([20, 120, 250], [700, 700])} initialPerKg={1} onGive={vi.fn()} />)
    expect(screen.getByTestId("vials-so-far").textContent).toContain("\"mg\":1400")
    expect(screen.getByTestId("vials-total").textContent).toBe("vialsNote")
  })

  it("keeps the dose between 0.5 and 10 mg/kg, and Give passes the dose on", () => {
    const onGive = vi.fn()
    render(<DantroleneVials viewFor={viewFor([20])} initialPerKg={0.5} onGive={onGive} />)
    fireEvent.click(screen.getByTestId("vials-dec"))
    expect(screen.getByTestId("vials-per-kg").textContent).toBe("0.5")
    fireEvent.click(screen.getByTestId("vials-give"))
    expect(onGive).toHaveBeenCalledWith(70, expect.anything())
  })

  it("draws nothing without a weight", () => {
    const { container } = render(<DantroleneVials viewFor={() => null} initialPerKg={2.5} onGive={vi.fn()} />)
    expect(container.firstChild).toBeNull()
  })
})

describe("the MH card", () => {
  const NOW = new Date("2026-11-02T10:30:00.000Z")
  const context: Omit<SuggestionContext, "now"> = {
    settings: { ...parseIntraopAutomation({ enabled: true, groups: { treatmentSuggestions: true, timers: true } }), dantroleneVialsMg: [20, 250] },
    user: {}, patient: { ageDays: 40 * 365, weightKg: 140 }, preop: {}, tofMonitor: false, keepLogging: true, labs: [],
  }
  const mh: LogEvent = { id: "c1", ts: new Date(NOW.getTime() - 60_000).toISOString(), type: "complication", label: "Malignant hyperthermia", recordedAt: new Date(NOW.getTime() - 60_000).toISOString() }

  it("shows the vials under the dantrolene row, and Give opens the dantrolene sheet with the planned dose", () => {
    vi.useFakeTimers({ now: NOW })
    try {
      const hook = renderHook(() => useIntraopAttention({ log: [mh], onEventOps: vi.fn(), suggestions: context }))
      act(() => hook.result.current.open("card:c1"))
      const openDrug = vi.fn()
      const sheets = { nowIso: () => NOW.toISOString(), timeOf: (iso: string) => iso.slice(11, 16), openDrug, openFluid: vi.fn(), openShock: vi.fn(), openLab: vi.fn(), openGas: vi.fn(), deepenTargets: () => [], stop: vi.fn(), displayName: () => "" } as unknown as SuggestionSheets
      render(<SuggestionHost attention={hook.result.current} sheets={sheets} />)
      expect(screen.getByTestId("vials-dose").textContent).toBe("350 mg") // 2.5 mg/kg of 140 kg, the first dose
      fireEvent.click(screen.getByTestId("vials-give"))
      expect(openDrug).toHaveBeenCalledWith(expect.objectContaining({ name: "Dantrolene", amount: 350, unit: "mg", suggestion: "card:Malignant hyperthermia:dantrolene" }))
    } finally {
      vi.useRealTimers()
    }
  })
})

describe("the vials already opened", () => {
  it("says so when none have been", () => {
    render(<DantroleneVials viewFor={viewFor([20])} initialPerKg={2} onGive={vi.fn()} />)
    expect(screen.getByTestId("vials-so-far").textContent).toBe("vialsSoFarNone")
  })
})
