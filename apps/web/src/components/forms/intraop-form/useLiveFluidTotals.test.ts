// @vitest-environment jsdom
import { renderHook } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import type { TimetableData } from "@/components/IntraopTimetable"
import { useLiveFluidTotals } from "./useLiveFluidTotals"

const fluid = { id: "f1", name: "Ringer lactate", category: "Crystalloids", volume: "500", color: "#000", startCol: 0, endCol: 3, fluidEntryMode: "BAG", bagVolumeMl: 500 }
const chart = (fluids: unknown[]) => ({ vitals: [], drugs: [], fluids, agents: [], infusions: [] }) as unknown as TimetableData

describe("the live fluid totals", () => {
  it("sums the delivered volume by category", () => {
    const { result } = renderHook(() => useLiveFluidTotals(chart([fluid]), null))
    expect(result.current).toMatchObject({ crystalloidsMl: 500, colloidsMl: null, bloodMl: null })
  })

  it("keeps the same object when the form re-renders with new arrays holding the same fluids", () => {
    const { result, rerender } = renderHook(({ fluids }) => useLiveFluidTotals(chart(fluids), null), { initialProps: { fluids: [fluid] } })
    const first = result.current
    expect(first).not.toBeNull()
    // The effect runs again for new array identities. A fresh totals object each time re-rendered the whole intraop
    // form on every pass, about five times a second on a case left open (11.0).
    rerender({ fluids: [{ ...fluid }] })
    rerender({ fluids: [{ ...fluid }] })
    expect(result.current).toBe(first)
  })

  it("gives a new object when a total really changes", () => {
    const { result, rerender } = renderHook(({ fluids }) => useLiveFluidTotals(chart(fluids), null), { initialProps: { fluids: [fluid] } })
    const first = result.current
    rerender({ fluids: [fluid, { ...fluid, id: "f2", bagVolumeMl: 250, volume: "250" }] })
    expect(result.current).not.toBe(first)
    expect(result.current?.crystalloidsMl).toBe(750)
  })

  it("counts its renders: re-rendering with equal fluids does not cause another round", () => {
    let renders = 0
    const { rerender } = renderHook(({ fluids }) => { renders += 1; return useLiveFluidTotals(chart(fluids), null) }, { initialProps: { fluids: [fluid] } })
    const settled = renders
    rerender({ fluids: [{ ...fluid }] })
    // one render for the rerender itself; no extra render from the effect's state update
    expect(renders).toBe(settled + 1)
  })
})
