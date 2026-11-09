// @vitest-environment jsdom
import { renderHook } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import type { TimetableData } from "@/types/timetable"
import { useVitalsHandlers } from "./useVitalsHandlers"

describe("useVitalsHandlers", () => {
  it("makes a typed value the clinician's: the column is no longer auto-filled", () => {
    const data = { vitals: [{ eventId: "v1", etco2: 35, temp: 36.5, autoFilled: true }] } as unknown as TimetableData
    const onChange = vi.fn()
    const { result } = renderHook(() => useVitalsHandlers({ current: data }, { current: onChange }))
    result.current.setVital(0, "systolic", "70")
    const written = onChange.mock.calls[0][0] as TimetableData
    expect(written.vitals[0]).toMatchObject({ eventId: "v1", systolic: 70, etco2: 35 })
    expect(written.vitals[0].autoFilled).toBeUndefined()
  })
})
