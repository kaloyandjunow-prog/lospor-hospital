import React from "react"
import { act } from "react-test-renderer"
import { describe, expect, it, vi } from "vitest"

const prefs = vi.hoisted(() => ({ language: "en" }))
vi.mock("@/lib/preferences-context", () => ({ usePreferences: () => ({ tc: (key: string) => key, language: prefs.language }) }))
vi.mock("@/theme/shade", () => ({ useShade: () => (hex: string) => hex }))
vi.mock("./Sheet", () => ({ Sheet: ({ children }: { children: React.ReactNode }) => <>{children}</> }))
vi.mock("./FeedbackPressable", () => ({ FeedbackPressable: ({ children }: { children: React.ReactNode }) => <>{children}</> }))

// The quick complications as the option library serves them, codes included.
const QUICK = [
  { cat: "Surgical", color: "#ef4444", events: [{ code: "SURGICAL_INCISION", label: "Incision", labelBg: "Оперативен разрез", color: "#ef4444" }] },
  { cat: "Complications", color: "#ef4444", isComplication: true, events: [
    { code: "COMPLICATIONS_HYPOTENSION", label: "Hypotension", labelBg: "Хипотенсия", color: "#ef4444" },
    { code: "COMPLICATIONS_DRUG_ERROR", label: "Drug error", labelBg: "Медикаментозна грешка", color: "#ef4444" },
    { code: "COMPLICATIONS_LAST", label: "LAST", labelBg: "Системна токсичност на локалните анестетици (LAST)", color: "#ef4444" },
  ] },
]
import { render } from "@/test/render"
import { SlotActionSheet } from "./SlotActionSheet"

/**
 * The slot sheet's events (10.2.0): one quiet list with the categories closed, complications named as the complications
 * list names them and saved under the catalogue's name, and the rest of them under the catalogue's headings (their
 * systems) inside the Complications category rather than as one long run.
 */
function sheet(search = "", likelyEvents: Parameters<typeof SlotActionSheet>[0]["likelyEvents"] = [], onDismissLikely = vi.fn(), over: { eventsScreen?: "smart" | "legacy"; expanded?: boolean } = {}) {
  const onSelectEvent = vi.fn()
  const tree = render(
    <SlotActionSheet
      visible title="12:45" eventSearch={search} complicationExpanded={over.expanded ?? false} eventsScreen={over.eventsScreen}
      eventCategories={QUICK}
      isGACase={false} activeAgents={[]} activeGas={null as never}
      likelyEvents={likelyEvents} onDismissLikely={onDismissLikely}
      onClose={() => {}} onEventSearchChange={() => {}} onToggleComplications={() => {}}
      onSelectEvent={onSelectEvent} onBrowseDrugs={() => {}}
      onStopAgent={() => {}} onOpenAgent={() => {}} onStopGas={() => {}} onOpenGas={() => {}}
    />,
  )
  const texts = () => tree.root.findAll(node => typeof node.type === "string" && typeof node.props.children === "string").map(node => node.props.children as string)
  const byId = (id: string) => tree.root.findAll(node => node.props?.testID === id)[0]
  const pressId = (id: string) => act(() => { byId(id)!.props.onPress() })
  const pressText = (text: string) => {
    const label = tree.root.findAll(node => typeof node.type === "string" && node.props.children === text)[0]!
    let node = label.parent
    while (node && typeof node.props.onPress !== "function") node = node.parent
    act(() => { node!.props.onPress() })
  }
  return { texts, byId, pressId, pressText, onSelectEvent, onDismissLikely }
}

describe("the event list in the slot sheet", () => {
  it("opens with the categories closed and shows no event yet", () => {
    const { texts, byId } = sheet()
    expect(byId("event-category-Surgical")).toBeDefined()
    expect(byId("event-category-Complications")).toBeDefined()
    expect(texts()).not.toContain("Hypotension")
    expect(byId("event-likely")).toBeUndefined()
  })

  it("names complications as the complications list names them", () => {
    const { texts, pressId } = sheet()
    pressId("event-category-Complications")
    expect(texts()).toContain("Medication error")
    expect(texts()).toContain("Local anaesthetic systemic toxicity (LAST)")
    expect(texts()).not.toContain("Drug error")
  })

  it("saves a complication under the catalogue's name", () => {
    const { pressId, pressText, onSelectEvent } = sheet()
    pressId("event-category-Complications")
    pressText("Local anaesthetic systemic toxicity (LAST)")
    expect(onSelectEvent).toHaveBeenCalledWith(expect.objectContaining({ label: "Local anaesthetic systemic toxicity (LAST)" }), true)
  })

  it("shows the rest under the catalogue's headings, one heading open at a time", () => {
    const { texts, pressId, byId } = sheet()
    pressId("event-category-Complications")
    for (const heading of ["Cardiovascular", "Respiratory", "Drug / Pharmacological", "Surgical"]) expect(texts()).toContain(heading)
    expect(texts()).not.toContain("Ventricular fibrillation")
    pressId("event-system-complications:cardiovascular")
    expect(texts()).toContain("Ventricular fibrillation")
    pressId("event-system-complications:respiratory")
    expect(texts()).not.toContain("Ventricular fibrillation")
    expect(byId("event-system-complications:respiratory")).toBeDefined()
  })

  it("only one category is open at a time", () => {
    const { texts, pressId } = sheet()
    pressId("event-category-Complications")
    expect(texts()).toContain("Medication error")
    pressId("event-category-Surgical")
    expect(texts()).not.toContain("Medication error")
    expect(texts()).toContain("Incision")
  })

  it("searches every group at once, by the reader's name, and says when nothing matches", () => {
    expect(sheet("ventricular").texts()).toContain("Ventricular fibrillation")
    expect(sheet("ventricular").texts()).not.toContain("Hypotension")
    expect(sheet("zzzz").byId("event-none")).toBeDefined()
  })

  it("reads in Bulgarian, headings included", () => {
    prefs.language = "bg"
    try {
      const { texts, pressId } = sheet()
      pressId("event-category-Complications")
      expect(texts()).toContain("Лекарствена грешка")
      expect(texts().some(text => text.startsWith("Медикаментозни"))).toBe(true)
    } finally {
      prefs.language = "en"
    }
  })
})

describe("likely now in the slot sheet (10.2.0)", () => {
  const LIKELY = [{ event: "Incision", from: "Positioned", probability: 0.9, gapMinutes: 5, minutesSince: 7 }]

  it("shows the likely events above the categories, with why, and logs one in a tap", () => {
    const { byId, pressId, onSelectEvent } = sheet("", LIKELY)
    expect(byId("event-likely")).toBeDefined()
    pressId("likely-log-Incision")
    expect(onSelectEvent).toHaveBeenCalledWith(expect.objectContaining({ label: "Incision" }), false, "succession:Positioned>Incision")
  })

  it("sets one aside with the cross", () => {
    const { pressId, onDismissLikely } = sheet("", LIKELY)
    pressId("likely-dismiss-Incision")
    expect(onDismissLikely).toHaveBeenCalledWith("succession:Positioned>Incision")
  })

  it("leaves the likely events out while searching, and ignores one that is not in the list", () => {
    expect(sheet("inc", LIKELY).byId("event-likely")).toBeUndefined()
    expect(sheet("", [{ ...LIKELY[0]!, event: "Not an event" }]).byId("event-likely")).toBeUndefined()
  })
})

describe("searching by the words colleagues use (10.2.0)", () => {
  it("finds an event by a phrase, a shorthand and a Bulgarian word", () => {
    expect(sheet("low bp").texts()).toContain("Hypotension")
    expect(sheet("hypotens").texts()).toContain("Hypotension")
    expect(sheet("ниско налягане").texts()).toContain("Hypotension")
    expect(sheet("wrong drug").texts()).toContain("Medication error")
  })

  it("puts the best match first", () => {
    const { texts } = sheet("incision")
    expect(texts().indexOf("Incision")).toBeGreaterThanOrEqual(0)
  })
})

describe("the Legacy event selector (Settings)", () => {
  it("is the coloured buttons: every category open at once, nothing wrapped into a list", () => {
    const { texts, byId } = sheet("", [], vi.fn(), { eventsScreen: "legacy" })
    expect(byId("event-list")).toBeUndefined()
    expect(texts()).toContain("Incision")
    expect(texts()).toContain("Hypotension")
  })

  it("keeps the rest of the complications behind Show, as it was, and searches by the same words", () => {
    expect(sheet("", [], vi.fn(), { eventsScreen: "legacy" }).texts()).not.toContain("Ventricular fibrillation")
    expect(sheet("", [], vi.fn(), { eventsScreen: "legacy", expanded: true }).texts()).toContain("Ventricular fibrillation")
    expect(sheet("low bp", [], vi.fn(), { eventsScreen: "legacy" }).texts()).toContain("Hypotension")
  })

  it("shows no likely events", () => {
    const likely = [{ event: "Incision", from: "Positioned", probability: 0.9, gapMinutes: 5, minutesSince: 7 }]
    expect(sheet("", likely, vi.fn(), { eventsScreen: "legacy" }).byId("event-likely")).toBeUndefined()
  })
})
