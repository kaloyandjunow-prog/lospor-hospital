import { describe, expect, it } from "vitest"
import { computeFluidRows } from "./timetable-fluid-rows"
import type { TimetableFluid } from "@/types/timetable"

const groups = [{ cat: "Crystalloids", fluids: [{ name: "Ringer" }] }]
const fluid = (over: Partial<TimetableFluid>): TimetableFluid => ({ id: "f1", name: "Ringer", startCol: 0, endCol: 4, ...over } as TimetableFluid)

describe("fluid lanes", () => {
  // Found in the touch audit (2026-11-21): Ringer sat on an "UNKNOWN fluid" lane.
  it("puts a fluid with an empty category on its library group's lane", () => {
    expect(computeFluidRows([fluid({ category: "" } as never)], groups)[0]!.label).toBe("Crystalloids")
  })

  it("matches the library name whatever the case and spaces", () => {
    expect(computeFluidRows([fluid({ name: " ringer " })], groups)[0]!.label).toBe("Crystalloids")
  })

  it("keeps a category that was given", () => {
    expect(computeFluidRows([fluid({ category: "Colloids" } as never)], groups)[0]!.label).toBe("Colloids")
  })
})
