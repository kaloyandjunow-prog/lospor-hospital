import { describe, expect, it } from "vitest"
import { intraopUiCopy } from "./ui-copy"

describe("intraoperative interface copy", () => {
  it("localizes irreversible Bulgarian actions without changing clinical names", () => {
    const copy = intraopUiCopy("bg")

    expect(copy.endCase.confirm).toBe("Потвърди приключването")
    expect(copy.timetable.confirmDiscontinue).toBe("Потвърди прекратяването")
    expect(copy.endCase.continuePostop).toBe("Продължи следоперативно")
    expect(copy.endCase.actualVolumeAria("Propofol")).toContain("Propofol")
    expect(copy.endCase.calculatedVolume).toContain("помпата")
  })

  it("keeps the English and Bulgarian shortcut tables structurally aligned", () => {
    const en = intraopUiCopy("en")
    const bg = intraopUiCopy("bg-BG")

    expect(bg.hotkeys.rows).toHaveLength(en.hotkeys.rows.length)
    expect(bg.hotkeys.rows.every(row => row.length === 2)).toBe(true)
  })

  it("falls back to English for unsupported locale identifiers", () => {
    expect(intraopUiCopy("de").endCase.confirm).toBe("Confirm End Case")
  })
})
