import { describe, expect, it } from "vitest"
import { infusionLaneColor } from "./infusion-lane-color"

const configs = { Propofol: { color: "#eab308", group: "Hypnotics" }, Etomidate: { color: "#eab308", group: "Hypnotics" }, Fentanyl: { color: "#38bdf8", group: "Opioids" } }
const run = (id: string, name: string, startCol: number, endCol: number, stopped = false) => ({ id, name, startCol, endCol, stopped })

describe("the colour of an infusion's row", () => {
  it("is the drug's own colour when it runs alone", () => {
    expect(infusionLaneColor([run("a", "Propofol", 2, 6)], run("a", "Propofol", 2, 6), configs)).toBe("#eab308")
  })
  it("tells a second infusion of the same group, running beside the first, by a lighter shade", () => {
    const all = [run("a", "Propofol", 2, 8), run("b", "Propofol", 4, 8)]
    expect(infusionLaneColor(all, all[0], configs)).toBe("#eab308")
    expect(infusionLaneColor(all, all[1], configs)).not.toBe("#eab308")
    const other = [run("a", "Propofol", 2, 8), run("b", "Etomidate", 4, 8)]
    expect(infusionLaneColor(other, other[1], configs)).not.toBe("#eab308")
  })
  it("leaves another group and a later start after a stop in the drug's colour", () => {
    const all = [run("a", "Propofol", 2, 8), run("c", "Fentanyl", 3, 8), run("b", "Propofol", 10, 14)]
    expect(infusionLaneColor(all, all[1], configs)).toBe("#38bdf8")
    const stopped = [run("a", "Propofol", 2, 8, true), run("b", "Propofol", 10, 14)]
    expect(infusionLaneColor(stopped, stopped[1], configs)).toBe("#eab308")
  })
  it("keeps the colour of an infusion restarted with Resume: its runs share the id", () => {
    const resumed = [run("a", "Propofol", 2, 4, true), run("a", "Propofol", 8, 12)]
    expect(infusionLaneColor(resumed, resumed[1], configs)).toBe("#eab308")
  })
})

describe("a colour that is not #rrggbb", () => {
  it("is used as it is for a second lane, not turned into an invalid colour", () => {
    const configs = { Propofol: { color: "rgb(10, 20, 30)", group: "Hypnotics" } }
    const all = [{ id: "a", name: "Propofol", startCol: 2, endCol: 8 }, { id: "b", name: "Propofol", startCol: 4, endCol: 8 }]
    expect(infusionLaneColor(all, all[1], configs)).toBe("rgb(10, 20, 30)")
    const short = { Propofol: { color: "#fff", group: "Hypnotics" } }
    expect(infusionLaneColor(all, all[1], short)).toMatch(/^#[0-9a-f]{6}$/)
  })
})
