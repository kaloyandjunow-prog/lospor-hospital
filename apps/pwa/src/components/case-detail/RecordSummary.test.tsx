import TestRenderer, { act } from "react-test-renderer"
import { Text } from "react-native"
import { describe, expect, it, vi } from "vitest"

vi.mock("@/lib/preferences-context", () => ({ usePreferences: () => ({ language: "en", theme: "dark", tc: (key: string) => key }) }))
vi.mock("@/components/case-detail/record-palettes", () => ({
  PALETTES: { dark: { card: "#000", grid: "#111", title: "#222", muted: "#333", ink: "#444", sbp: "#f00", faint: "#555", lbl: "#666" }, light: {} },
}))
vi.mock("react-native-svg", () => ({ __esModule: true, default: "Svg", Line: "Line", Path: "Path", Rect: "Rect", Text: "SvgText" }))

import { RecordEpisodes, RecordEventLog, RecordVitalsTable } from "./RecordSummary"

const keyEvents = {
  vitals: [{ systolic: 120, diastolic: 70, heartRate: 70 }, { systolic: 80, diastolic: 45, heartRate: 90 }],
  log: [
    { id: "e1", ts: "2026-11-07T08:05:00.000Z", type: "clinical_event", label: "Induction" },
    { id: "c1", ts: "2026-11-07T08:08:00.000Z", endTs: "2026-11-07T08:20:00.000Z", type: "complication", label: "Hypotension" },
    { id: "d1", ts: "2026-11-07T08:10:00.000Z", type: "drug", name: "Ephedrine", dose: "10", unit: "mg", suggestion: "card:Hypotension:ephedrine" },
    { id: "v", ts: "2026-11-07T08:01:00.000Z", type: "vital", systolic: 120 },
  ],
}
const deleted = [{ id: "x1", ts: "2026-11-07T08:12:00.000Z", type: "drug", name: "Fentanyl", dose: "1000", unit: "mcg", deletedAt: "2026-11-07T08:13:00.000Z" }]
const texts = (tree: TestRenderer.ReactTestRenderer) => tree.root.findAllByType(Text).map(node => [node.props.children].flat().join(""))

function render(node: React.ReactElement) {
  let tree!: TestRenderer.ReactTestRenderer
  act(() => { tree = TestRenderer.create(node) })
  return tree
}

describe("the record on the phone", () => {
  it("lists every charted entry in order, the card named, a deleted entry struck through with when it was deleted", () => {
    const tree = render(<RecordEventLog keyEvents={keyEvents} deletedEvents={deleted} timeZone="UTC" />)
    const all = texts(tree)
    expect(all).toEqual(expect.arrayContaining(["08:05", "Induction", "Ephedrine 10 mg", "★ Hypotension", "Fentanyl 1000 mcg", "Deleted 08:13"]))
    expect(all).not.toContain("Not now")
    const gone = tree.root.findAll(node => node.props.testID === "record-log-deleted")
    expect(new Set(gone.map(node => node.props.children))).toHaveProperty("size", 1)
    const struck = tree.root.findAllByType(Text).filter(node => JSON.stringify(node.props.style).includes("line-through"))
    expect(struck.length).toBeGreaterThan(0)
  })

  it("shows nothing for a case without events", () => {
    expect(render(<RecordEventLog keyEvents={{ log: [] }} />).toJSON()).toBeNull()
  })

  it("keeps the vitals shut behind a button until it is pressed", () => {
    const tree = render(<RecordVitalsTable keyEvents={keyEvents} clock={{ startedAt: "2026-11-07T08:00:00.000Z", timezone: "UTC" }} />)
    expect(texts(tree).join(" ")).toContain("View table · 2 readings")
    expect(texts(tree)).not.toContain("120/70")
    act(() => { tree.root.findByProps({ testID: "record-vitals-toggle" }).props.onPress() })
    expect(texts(tree)).toEqual(expect.arrayContaining(["120/70", "80/45"]))
  })

  it("gives an episode what was given while it lasted", () => {
    const all = texts(render(<RecordEpisodes keyEvents={keyEvents} timeZone="UTC" />)).join(" | ")
    expect(all).toContain("08:08–08:20 · Hypotension")
    expect(all).toContain("Ephedrine 10 mg 08:10")
  })
});
