import React, { useState } from "react"
import { act } from "react-test-renderer"
import { describe, expect, it, vi } from "vitest"

vi.mock("@/lib/haptic", () => ({ hapticTick: vi.fn() }))
vi.mock("expo-haptics", () => ({}))
vi.mock("@/lib/preferences-context", () => ({
  usePreferences: () => ({
    language: "en",
    t: (key: string) => key,
    tc: (key: string) => key,
  }),
}))
vi.mock("@/lib/clinical-display", () => ({
  displayClinicalCode: (
    _category: string,
    value: string,
    _language: string,
    fallback?: { label?: string },
  ) => fallback?.label ?? value,
}))

import { pressByText, queryByText, render } from "@/test/render"
import { InfusionSheet } from "./InfusionSheet"
import { DoseSelector } from "./DoseSelector"
import type { PediatricInfusionProfileRule } from "@lospor/core/clinical-rules"
import type { SearchOnlyMedicationOption } from "@/lib/hidden-clinical-options"
import type { InfusionRuleSelection } from "@/lib/use-infusion-entry"

/**
 * A ruleset can withdraw one route of an infusion rather than the whole drug.
 * The chart dropped those from the route list; this sheet offered them, and
 * picking one left an empty box with no stated reason, because nothing resolves
 * for a withdrawn route.
 */

function renderSheet(element: React.ReactElement) {
  return render(element)
}

const rule = (
  routeDispositions: Record<string, "AUTO" | "MANUAL" | "HIDDEN">,
  over: Partial<PediatricInfusionProfileRule> = {},
): PediatricInfusionProfileRule => ({
  ruleKey: "ped.inf.test",
  ruleVersion: "1",
  itemKey: "Testamine",
  labelEn: "Testamine",
  labelBg: null,
  category: null,
  disposition: "AUTO",
  routeDispositions,
  manualEntryOnly: false,
  routeManualEntryOnly: {},
  minimumAgeDays: 0,
  maximumAgeDaysExclusive: 18 * 366,
  minimumWeightKg: null,
  minimumWeightInclusive: true,
  maximumWeightKg: null,
  maximumWeightInclusive: false,
  routineSuggestion: false,
  advisory: null,
  profile: {
    kind: "infusion",
    mode: "rate",
    rounding: "nearest_step",
    quickValues: [1],
    routes: Object.keys(routeDispositions),
    defaultRoute: "IV",
    weightBasis: "TBW",
    unit: "mcg/kg/min",
    min: 0,
    max: 10,
    step: 0.1,
  },
  unit: null,
  routeUnits: {},
  manualUnit: null,
  sourceIds: [],
  origin: "PLATFORM",
  presetId: "preset",
  ...over,
})

const TESTAMINE = { name: "Testamine", unit: "mcg/kg/min", color: "#3b82f6" }

const common = {
  visible: true,
  onClose: () => {},
  infDrugs: [TESTAMINE],
  favouriteNames: [],
  scenarios: [],
  ratePresets: {},
  infRate: "",
  setInfRate: () => {},
  onConfirm: () => {},
  setInfDrug: () => {},
  pediatricMode: true,
  patientAge: { value: 5, unit: "YEARS" as const },
  patientWeightKg: 18,
}

describe("InfusionSheet route visibility", () => {
  it("keeps the configured advisory and quick values visible by default", () => {
    const tree = renderSheet(
      <InfusionSheet
        {...common}
        infDrug={TESTAMINE}
        infRate="1"
        infRoute="IV"
        infRule={{ key: "ped.inf.test", version: "1", sourceIds: ["hidden-source"] }}
        pediatricInfusionProfiles={[
          rule(
            { IV: "AUTO" },
            { advisory: "Use the recommended 1–2 mcg/kg/min range from hidden-source" },
          ),
        ]}
      />,
    )
    const rendered = JSON.stringify(tree.toJSON())

    expect(rendered).toContain("1 mcg/kg/min")
    expect(rendered).toContain("recommended 1–2")
    expect(rendered).toContain("hidden-source")
    expect(tree.root.findByType(DoseSelector).props.quickValues).toEqual([1])
    expect(tree.root.findAllByProps({ testID: "dose-selector-dose-pills" }).length).toBeGreaterThan(0)
  })

  it("does not offer a route the ruleset has withdrawn", () => {
    const tree = renderSheet(
      <InfusionSheet
        {...common}
        infDrug={TESTAMINE}
        pediatricInfusionProfiles={[rule({ IV: "AUTO", IM: "AUTO", INTRAOSSEOUS: "HIDDEN" })]}
      />,
    )
    const rendered = JSON.stringify(tree.toJSON())

    // Two routes survive, so the selector is still drawn.
    expect(rendered).toContain("IM")
    expect(rendered, "a withdrawn route was still offered").not.toContain("INTRAOSSEOUS")
  })

  it("still offers a route that is merely manual", () => {
    // MANUAL means "type the rate yourself", not "not available".
    const tree = renderSheet(
      <InfusionSheet
        {...common}
        infDrug={TESTAMINE}
        pediatricInfusionProfiles={[rule({ IV: "AUTO", INTRAOSSEOUS: "MANUAL" })]}
      />,
    )
    const rendered = JSON.stringify(tree.toJSON())

    expect(rendered).toContain("INTRAOSSEOUS")
  })
})

/**
 * Whether the drug is offered at all was decided by asking for its default
 * route and nothing else. A withdrawn default therefore withdrew the whole
 * infusion, even where another route was fully available — the phone simply had
 * no row for a drug the ruleset permits.
 */
describe("InfusionSheet drug availability", () => {
  function openFavourite(profiles: PediatricInfusionProfileRule[], props: Record<string, unknown> = {}) {
    const tree = renderSheet(
      <InfusionSheet
        {...common}
        {...props}
        infDrug={null}
        favouriteNames={["Testamine"]}
        pediatricInfusionProfiles={profiles}
      />,
    )
    pressByText(tree, "dsFavourites")
    return tree
  }

  it("offers an infusion whose default route was withdrawn, on the route that survived", () => {
    const setInfDrug = vi.fn()
    const setInfRoute = vi.fn()
    const tree = openFavourite([rule({ IV: "HIDDEN", IM: "AUTO" })], { setInfDrug, setInfRoute })

    expect(queryByText(tree, "Testamine"), "a usable infusion had no row at all").not.toBeNull()

    pressByText(tree, "Testamine")

    expect(setInfDrug).toHaveBeenCalled()
    expect(setInfRoute, "opened on the withdrawn default route").toHaveBeenCalledWith("IM")
  })

  it("opens on a merely manual route when the automatic default was withdrawn", () => {
    const setInfRoute = vi.fn()
    const tree = openFavourite([rule({ IV: "HIDDEN", INTRAOSSEOUS: "MANUAL" })], { setInfRoute })

    expect(queryByText(tree, "Testamine")).not.toBeNull()

    pressByText(tree, "Testamine")

    expect(setInfRoute).toHaveBeenCalledWith("INTRAOSSEOUS")
  })

  it("drops an infusion whose every route was withdrawn", () => {
    const tree = openFavourite([rule({ IV: "HIDDEN", IM: "HIDDEN" })])

    expect(queryByText(tree, "Testamine"), "an unusable infusion was still offered").toBeNull()
  })
})

/**
 * Two rules claiming the same child is an authoring mistake, and core returns
 * no profile plus a conflict flag. Reading only the profile turned that into a
 * visible row that did nothing at all when tapped.
 */
describe("InfusionSheet with overlapping pediatric rules", () => {
  const OVERLAPPING = [
    rule({ IV: "AUTO" }, { ruleKey: "ped.inf.a", minimumAgeDays: 0 }),
    rule({ IV: "AUTO" }, { ruleKey: "ped.inf.b", minimumAgeDays: 365 }),
  ]

  function Harness() {
    const [drug, setDrug] = useState<typeof TESTAMINE | null>(null)
    return (
      <InfusionSheet
        {...common}
        infDrug={drug}
        setInfDrug={setDrug}
        favouriteNames={["Testamine"]}
        pediatricInfusionProfiles={OVERLAPPING}
      />
    )
  }

  it("keeps the row live and says why nothing can be started", () => {
    const tree = renderSheet(<Harness />)
    pressByText(tree, "dsFavourites")

    expect(queryByText(tree, "Testamine"), "the conflicted infusion was hidden instead of explained").not.toBeNull()

    pressByText(tree, "Testamine")

    const alerts = tree.root.findAllByProps({ testID: "infusion-profile-conflict" })
    expect(alerts.length, "tapping the row did nothing and said nothing").toBeGreaterThan(0)
    expect(alerts[0].props.accessibilityRole).toBe("alert")
    expect(
      tree.root.findAllByProps({ testID: "dose-selector-volume-presets" }),
      "a rate could be entered against rules that conflict",
    ).toHaveLength(0)
  })
})

describe("InfusionSheet search-only hidden medication", () => {
  const hidden: SearchOnlyMedicationOption = {
    name: "Hideamine",
    unit: "mcg/kg/min",
    color: "#ef4444",
    category: "Hidden infusions",
    routes: ["IV", "IM"],
    rule: {
      key: "institution.inf.hideamine",
      version: "8",
      sourceIds: ["source-hidden"],
      presetId: "institution-preset",
      presetVersion: 5,
      presetScope: "INSTITUTION",
    },
  }

  function Harness({ onSave }: { onSave: (value: {
    drug: typeof TESTAMINE | null
    rate: string
    route?: string
    rule?: InfusionRuleSelection
  }) => void }) {
    const [drug, setDrug] = useState<typeof TESTAMINE | null>(null)
    const [rate, setRate] = useState("")
    const [route, setRoute] = useState<string | undefined>()
    const [ruleSelection, setRuleSelection] = useState<InfusionRuleSelection | undefined>()
    return (
      <InfusionSheet
        {...common}
        infDrugs={[{ name: hidden.name, unit: hidden.unit, color: hidden.color }]}
        searchOnlyInfusions={[hidden]}
        favouriteNames={[hidden.name]}
        scenarios={[{
          key: "hidden-infusion-scenario",
          label: "Hidden infusion scenario",
          color: hidden.color,
          items: [{ label: hidden.name, canonical: hidden.name }],
        }]}
        infDrug={drug}
        setInfDrug={setDrug}
        infRate={rate}
        setInfRate={setRate}
        infRoute={route}
        setInfRoute={setRoute}
        infRule={ruleSelection}
        setInfRule={setRuleSelection}
        routeProfiles={{
          Hideamine: {
            IM: {
              mode: "concentration-rate",
              min: 1,
              max: 2,
              step: 1,
              quickValues: [1, 2],
              unit: "mcg/kg/min",
              concentrationOptions: ["forbidden concentration"],
              suggestedRate: 2,
              suggestedConcentration: "forbidden concentration",
            },
          },
        }}
        suggestedRates={{ Hideamine: "99" }}
        ratePresets={{ Hideamine: ["50", "99"] }}
        onConfirm={() => onSave({ drug, rate, route, rule: ruleSelection })}
      />
    )
  }

  it("keeps routine paths empty and records an explicitly searched infusion without guidance", () => {
    const onSave = vi.fn()
    const tree = renderSheet(<Harness onSave={onSave} />)

    expect(queryByText(tree, "Hideamine")).toBeNull()
    expect(queryByText(tree, "Hidden infusion scenario")).toBeNull()
    pressByText(tree, "dsFavourites")
    expect(queryByText(tree, "Hideamine")).toBeNull()
    pressByText(tree, "back")
    pressByText(tree, "dsBrowseAllInfusions")
    expect(queryByText(tree, "Hideamine")).toBeNull()

    act(() => tree.root.findByProps({ placeholder: "dsSearchInfusions" }).props.onChangeText("Hide"))
    expect(queryByText(tree, "Hideamine")).not.toBeNull()
    expect(JSON.stringify(tree.toJSON())).toContain("dsSearchOnlyManualBadge")
    pressByText(tree, "Hideamine")

    expect(tree.root.findAllByProps({ testID: "infusion-search-only-manual-notice" }).length).toBeGreaterThan(0)
    expect(tree.root.findAllByProps({ testID: "dose-manual-input" }).length).toBeGreaterThan(0)
    expect(tree.root.findAllByProps({ testID: "concentration-pill-0" })).toHaveLength(0)
    expect(JSON.stringify(tree.toJSON())).not.toContain("forbidden concentration")
    expect(JSON.stringify(tree.toJSON())).not.toContain("99")

    act(() => tree.root.findByProps({ testID: "dose-route-IM" }).props.onPress())
    act(() => tree.root.findByProps({ testID: "dose-manual-input" }).props.onChangeText("3"))
    pressByText(tree, "dsStart Hideamine 3 mcg/kg/min")

    expect(onSave).toHaveBeenCalledWith({
      drug: { name: "Hideamine", unit: "mcg/kg/min", color: "#ef4444" },
      rate: "3",
      route: "IM",
      rule: {
        key: "institution.inf.hideamine",
        version: "8",
        sourceIds: ["source-hidden"],
        presetId: "institution-preset",
        presetVersion: 5,
        presetScope: "INSTITUTION",
      },
    })
  })
})
