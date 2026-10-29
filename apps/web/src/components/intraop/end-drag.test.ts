import { describe, expect, it } from "vitest"
import { resolveEndDrop } from "./end-drag"

const run = { stopped: false, startCol: 2, endCol: 5, nowCol: 5 }
const stopped = { stopped: true, startCol: 2, endCol: 4, nowCol: 8 }

describe("resolveEndDrop", () => {
  it("asks before stopping a running bar dragged back", () => {
    expect(resolveEndDrop({ ...run, dropCol: 3 })).toEqual({ kind: "confirm-stop", col: 3 })
  })
  it("never stops a running bar dragged to or past now", () => {
    expect(resolveEndDrop({ ...run, dropCol: 5 })).toEqual({ kind: "none" })
    expect(resolveEndDrop({ ...run, dropCol: 9 })).toEqual({ kind: "none" })
  })
  it("cannot stop a bar before it began", () => {
    expect(resolveEndDrop({ ...run, dropCol: 0 })).toEqual({ kind: "confirm-stop", col: 2 })
  })
  it("moves the stop of a stopped bar without asking", () => {
    expect(resolveEndDrop({ ...stopped, dropCol: 6 })).toEqual({ kind: "move-stop", col: 6 })
    expect(resolveEndDrop({ ...stopped, dropCol: 3 })).toEqual({ kind: "move-stop", col: 3 })
  })
  it("treats a drop on the stop's own column as nothing", () => {
    expect(resolveEndDrop({ ...stopped, dropCol: 4 })).toEqual({ kind: "none" })
  })
  it("takes the stop away when a stopped bar is dragged past now", () => {
    expect(resolveEndDrop({ ...stopped, dropCol: 9 })).toEqual({ kind: "resume" })
  })
  it("falls back to asking when the clock is unknown", () => {
    expect(resolveEndDrop({ ...run, nowCol: null, dropCol: 4 })).toEqual({ kind: "confirm-stop", col: 4 })
  })
})
