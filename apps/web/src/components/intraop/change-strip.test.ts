import { describe, expect, it } from "vitest"
import { agentEditMode, agentPercentAt } from "@/hooks/useAgentHandlers"
import { stretchAt, stripStretches } from "./TimetableChangeStrip"
import type { AgentSegment } from "@/types/timetable"

// What the strip above a bar shows, and what editing an agent at a column means (10.0.0).

const sevo: AgentSegment = {
  name: "Sevoflurane", startCol: 2, endCol: 12, percent: 2,
  percentChanges: [{ col: 5, percent: 1.5, eventId: "c1" }, { col: 15, percent: 1, planned: true, eventId: "c2" }],
}

describe("the change strip", () => {
  it("has a stretch for the start and each applied change, but not for one still planned", () => {
    const stretches = stripStretches(2, "2%", sevo.percentChanges!.map(c => ({ col: c.col, label: `${c.percent}%`, planned: c.planned })))
    expect(stretches).toEqual([{ col: 2, label: "2%" }, { col: 5, label: "1.5%" }])
    expect(stretchAt(stretches, 4)?.label).toBe("2%")
    expect(stretchAt(stretches, 9)?.label).toBe("1.5%")
    expect(stretchAt(stretches, 1)).toBeNull()
  })
})

describe("the agent editor at a column", () => {
  it("corrects the start on the first column, corrects a change on its own column, and adds one anywhere else", () => {
    expect(agentEditMode(sevo, 2)).toBe("start")
    expect(agentEditMode(sevo, 5)).toBe("change")
    expect(agentEditMode(sevo, 15)).toBe("change")
    expect(agentEditMode(sevo, 8)).toBe("new")
  })

  it("starts from the percent in force there; a planned one only on its own column", () => {
    expect(agentPercentAt(sevo, 3)).toBe(2)
    expect(agentPercentAt(sevo, 8)).toBe(1.5)
    expect(agentPercentAt(sevo, 16)).toBe(1.5)
    expect(agentPercentAt(sevo, 15)).toBe(1)
  })
})
