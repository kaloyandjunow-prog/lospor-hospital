import { describe, expect, it } from "vitest"
import {
  ACCESS_KIND_OF_COMPLICATION,
  accessEventLabel,
  accessKindOf,
  failedLineCandidate,
  replaceFailedLine,
  vascularLineText,
  workingLinesOfKind,
  type VascularLine,
} from "./vascular-access-lines"

const peripheral = (id: string, size = "18"): VascularLine => ({ id, site: "VEN_PERIPHERAL", siteLabel: "Peripheral IV", size, sizeUnit: "G" })
const words = { failed: "failed", time: (iso: string) => iso.slice(11, 16) }

describe("failed vascular access lines", () => {
  it("reads a line's kind from its site", () => {
    expect(accessKindOf("VEN_PERIPHERAL")).toBe("VENOUS")
    expect(accessKindOf("ART_RADIAL")).toBe("ARTERIAL")
    expect(accessKindOf("CVK_IJV")).toBe("CENTRAL")
    expect(accessKindOf("PICC_BASILIC")).toBe("CENTRAL")
    expect(accessKindOf("SOMETHING")).toBeNull()
    expect(ACCESS_KIND_OF_COMPLICATION["CVK failure"]).toBe("CENTRAL")
  })

  it("charts each new line as its own event", () => {
    expect(accessEventLabel("VENOUS")).toBe("IV line in")
    expect(accessEventLabel("ARTERIAL")).toBe("Art line in")
    expect(accessEventLabel("CENTRAL", "CVK_IJV")).toBe("CVC in")
    expect(accessEventLabel("CENTRAL", "PICC_BASILIC")).toBe("PICC")
  })

  it("asks which line failed only when there are several of that kind", () => {
    const one = [peripheral("a"), { id: "r", site: "ART_RADIAL" }]
    expect(failedLineCandidate(one, "VENOUS")?.id).toBe("a")
    expect(failedLineCandidate([peripheral("a"), peripheral("b")], "VENOUS")).toBeNull()
    expect(failedLineCandidate([{ ...peripheral("a"), failed: true }], "VENOUS")).toBeNull()
  })

  it("keeps the failed line, marked with its time, beside the new one", () => {
    const lines = replaceFailedLine([peripheral("a"), peripheral("b", "20")], 0, "2026-11-02T10:42:00.000Z", peripheral("c", "16"))
    expect(lines).toHaveLength(3)
    expect(lines[0]).toMatchObject({ id: "a", failed: true, failedAt: "2026-11-02T10:42:00.000Z" })
    expect(lines[1]!.failed).toBeUndefined()
    expect(lines[2]).toMatchObject({ id: "c", insertedAt: "2026-11-02T10:42:00.000Z" })
    expect(workingLinesOfKind(lines, "VENOUS").map(line => line.id)).toEqual(["b", "c"])
    expect(vascularLineText(lines[0]!, words)).toBe("Peripheral IV 18G · failed 10:42")
    expect(vascularLineText(lines[2]!, words)).toBe("Peripheral IV 16G")
  })

  it("matches a line saved without an id by its position", () => {
    const lines = replaceFailedLine([{ site: "ART_RADIAL" }, { site: "ART_RADIAL" }], 1, "2026-11-02T11:00:00.000Z")
    expect(lines.map(line => !!line.failed)).toEqual([false, true])
  })
})
