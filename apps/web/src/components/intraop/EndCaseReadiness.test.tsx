// @vitest-environment jsdom
import { act, fireEvent, render, renderHook, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { caseReadiness } from "@lospor/core/case-readiness"
import { EndCaseReadiness, useEndCaseCheck } from "./EndCaseReadiness"

describe("the check at End case", () => {
  it("names what the intraoperative record still lacks and goes straight to it", () => {
    const readiness = caseReadiness(
      { clinicalMode: "ADULT", preop: {}, intraop: { startedAt: "2026-10-04T08:00:00Z", endedAt: "2026-10-04T09:00:00Z" }, postop: null },
      { omitPostop: true },
    )
    const onGo = vi.fn()
    render(<EndCaseReadiness readiness={readiness} locale="en" onGo={onGo} onDismiss={() => {}} />)

    fireEvent.click(screen.getByRole("button", { name: /Anaesthetic technique/ }))
    expect(onGo).toHaveBeenCalledWith("technique")
    // Recovery has not happened yet: nothing postoperative is asked for here.
    expect(screen.queryByText(/postoperative record/)).toBeNull()
  })

  it("can be put off without losing the case", () => {
    const onDismiss = vi.fn()
    render(
      <EndCaseReadiness
        readiness={{ ready: false, blockers: [{ kind: "missing_technique", severity: "blocker", target: { stage: "intraop", area: "technique" } }], warnings: [] }}
        locale="bg" onGo={() => {}} onDismiss={onDismiss}
      />,
    )
    fireEvent.click(screen.getByRole("button", { name: "По-късно" }))
    expect(onDismiss).toHaveBeenCalled()
  })
})

const DONE = {
  startedAt: "2026-10-04T08:00:00Z", techniques: ["GA"], airwayDevices: ["ETT"], positions: ["SUPINE"],
  ecg: true, vascularAccesses: ["PIV"], vitals: [{ hr: 70 }], drugs: [{ drugId: "propofol" }],
  fluids: [{ type: "RL" }], complications: "None",
}

describe("the check before ending the case, as on the phone", () => {
  it("keeps the case running while something blocks, and lists it", () => {
    const { result } = renderHook(() => useEndCaseCheck({ record: () => ({ ...DONE, techniques: [] }), locale: "en", onGo: () => {} }))
    let allowed = true
    act(() => { allowed = result.current.before() })
    expect(allowed).toBe(false)
    render(<>{result.current.panel}</>)
    expect(screen.getByText(/Anaesthetic technique/)).toBeTruthy()
  })

  it("asks once about warnings and follows the answer", () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false)
    const { result } = renderHook(() => useEndCaseCheck({ record: () => ({ ...DONE, complications: "" }), locale: "en", onGo: () => {} }))
    let allowed = true
    act(() => { allowed = result.current.before() })
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining("Complications"))
    expect(allowed).toBe(false)
    confirm.mockRestore()
  })

  it("ends straight away when the record is complete", () => {
    const { result } = renderHook(() => useEndCaseCheck({ record: () => DONE, locale: "en", onGo: () => {} }))
    let allowed = false
    act(() => { allowed = result.current.before() })
    expect(allowed).toBe(true)
  })
})
