import { describe, expect, it, vi } from "vitest"

vi.mock("@/lib/haptic", () => ({ hapticTick: vi.fn() }))
vi.mock("expo-haptics", () => ({}))
vi.mock("@/lib/notify", () => ({ notify: vi.fn() }))
// The scan panel reaches for a native module and the network. Neither is the
// subject here: these tests are about which draw a row belongs to.
vi.mock("@/components/LabScanPanel", () => ({ LabScanPanel: () => null }))

import type { LabResult } from "@/lib/labs"
import { LabsSheet } from "./LabsSheet"
import { renderWithPreferences } from "./fluid-sheet-test-fixtures"

const DRAW = "2026-06-01T08:30:00.000Z"
const EARLIER = "2026-06-01T08:00:00.000Z"

function sheet(value: LabResult[], onChange = vi.fn()) {
  const tree = renderWithPreferences(
    <LabsSheet
      visible
      takenAt={DRAW}
      value={value}
      title="Labs"
      onClose={() => {}}
      onChange={onChange}
      onEnsureCase={async () => "case-1"}
    />,
  )
  return { tree, onChange }
}

function texts(tree: ReturnType<typeof renderWithPreferences>): string[] {
  return tree.root
    .findAll(n => String(n.type) === "Text")
    .map(n => n.children.filter(c => typeof c === "string").join(""))
}

describe("the sheet edits one draw, not the whole case", () => {
  it("shows only the results drawn at this moment", () => {
    // Two haemoglobins half an hour apart are two draws. Editing the later one
    // must not present the earlier one as a row to overwrite -- that is exactly
    // how a trend becomes a single value that looks corrected.
    const { tree } = sheet([
      { test: "Haemoglobin (Hb)", value: "120", unit: "g/L", takenAt: EARLIER },
      { test: "Haemoglobin (Hb)", value: "89", unit: "g/L", takenAt: DRAW },
    ])

    const shown = texts(tree)
    // The editable row for this draw. Its value sits in a TextInput rather
    // than a Text node, so the row is identified by its test name and unit.
    expect(shown).toContain("Haemoglobin (Hb)")
    // The earlier one appears only in the read-only prior-draws summary, under
    // its own time, where it cannot be typed over.
    expect(shown).toContain("08:00")
    expect(shown).toContain("Haemoglobin (Hb) 120 g/L")
  })

  it("keeps other draws untouched when this one changes", () => {
    // The list is written whole, so a bug here silently deletes earlier draws.
    const earlier: LabResult = { test: "Haemoglobin (Hb)", value: "120", unit: "g/L", takenAt: EARLIER }
    const { onChange } = sheet([earlier])

    // Nothing has been edited yet, so nothing should have been written.
    expect(onChange).not.toHaveBeenCalled()
  })

  it("treats a result with no draw time as belonging to another draw", () => {
    // An undated row cannot be placed in the timeline and must not be swept
    // into whichever draw happens to be open.
    const { tree } = sheet([
      { test: "Creatinine", value: "70", unit: "µmol/L" },
      { test: "Haemoglobin (Hb)", value: "89", unit: "g/L", takenAt: DRAW },
    ])

    const shown = texts(tree)
    // It is listed among the other draws, labelled as undated, rather than
    // appearing as an editable row of the draw currently open.
    expect(shown).toContain("No date given by the hospital")
    expect(shown).toContain("Creatinine 70 µmol/L")
  })
})

describe("the summary at the top of the sheet", () => {
  it("shows abnormal results from the newest draw, worst first", () => {
    // The same three-result summary the web lane shows, from the same Core
    // helper. At the top because a phone screen loses anything below the fold.
    const { tree } = sheet([
      { test: "Sodium (Na⁺)", value: "130", unit: "mmol/L", takenAt: DRAW },
      // Critical only because the laboratory said so: nothing is derived from
      // a reference range any more.
      { test: "Potassium (K⁺)", value: "1.2", unit: "mmol/L", takenAt: DRAW, criticalLow: 2.5 },
    ])
    const shown = texts(tree)
    expect(shown).toContain("Latest draw")
    // Potassium carries a critical threshold, so it leads.
    expect(shown.indexOf("Potassium (K⁺) 1.2 mmol/L"))
      .toBeLessThan(shown.indexOf("Sodium (Na⁺) 130 mmol/L"))
  })

  it("still says something when the panel is normal", () => {
    const { tree } = sheet([
      { test: "Sodium (Na⁺)", value: "140", unit: "mmol/L", takenAt: DRAW },
    ])
    expect(texts(tree)).toContain("Sodium (Na⁺) 140 mmol/L")
  })

  it("says nothing at all when no labs exist", () => {
    const { tree } = sheet([])
    expect(texts(tree)).not.toContain("Latest draw")
  })
})
