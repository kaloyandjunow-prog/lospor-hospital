import { describe, expect, it } from "vitest"
import { resolveOptionDoseSurface, resolveOptionRoutes } from "./option-surface"

/**
 * These are the cases the two apps used to answer differently. None of them is
 * exercised by the shipped catalogue, so none of them was ever seen going
 * wrong — which is exactly why they belong in a test rather than in two
 * separate readers nobody was comparing.
 */

describe("a route's own entry beats the drug's base entry", () => {
  const metadata = {
    unit: "mg",
    min: 0,
    max: 100,
    step: 5,
    quickValues: [10, 20],
    routes: ["IV", "IN"],
    routeModes: {
      IN: { unit: "mcg", min: 0, max: 200, step: 10, quickValues: [50] },
    },
  }

  it("takes the route's numbers when it declares them", () => {
    expect(resolveOptionDoseSurface({ metadata, route: "IN" })).toMatchObject({
      unit: "mcg", min: 0, max: 200, step: 10, quickValues: [50],
    })
  })

  it("falls back to the drug's numbers for a route that declares none", () => {
    expect(resolveOptionDoseSurface({ metadata, route: "IV" })).toMatchObject({
      unit: "mg", max: 100, step: 5, quickValues: [10, 20],
    })
  })

  it("treats an omitted list as 'as the drug says', not as an empty list", () => {
    // The IN entry declares no concentrations at all, so the drug's stand.
    const withConcentrations = {
      ...metadata,
      concentrationOptions: ["1%", "2%"],
      routeModes: { IN: { unit: "mcg" } },
    }
    expect(resolveOptionDoseSurface({ metadata: withConcentrations, route: "IN" })?.concentrationOptions)
      .toEqual(["1%", "2%"])
  })

  it("honours an authored empty list as a deliberate 'none for this route'", () => {
    const withConcentrations = {
      ...metadata,
      concentrationOptions: ["1%", "2%"],
      routeModes: { IN: { unit: "mcg", concentrationOptions: [] } },
    }
    expect(resolveOptionDoseSurface({ metadata: withConcentrations, route: "IN" })?.concentrationOptions)
      .toEqual([])
  })
})

describe("default beats suggested", () => {
  it("prefers defaultConcentration when a page states both", () => {
    // The web app read it this way and the phone read it the other way round,
    // so a page carrying both would have preselected different strengths.
    const surface = resolveOptionDoseSurface({
      metadata: {
        unit: "mg",
        concentrationOptions: ["0.25%", "0.5%"],
        defaultConcentration: "0.5%",
        suggestedConcentration: "0.25%",
      },
    })
    expect(surface?.concentration).toBe("0.5%")
  })

  it("prefers defaultFormulation when a page states both", () => {
    const surface = resolveOptionDoseSurface({
      metadata: {
        unit: "mg",
        formulationOptions: ["ISOBARIC", "HYPERBARIC"],
        defaultFormulation: "HYPERBARIC",
        suggestedFormulation: "ISOBARIC",
      },
    })
    expect(surface?.formulation).toBe("HYPERBARIC")
  })

  it("still uses suggested when that is all a page states", () => {
    const surface = resolveOptionDoseSurface({
      metadata: {
        unit: "mg",
        concentrationOptions: ["0.25%", "0.5%"],
        suggestedConcentration: "0.25%",
      },
    })
    expect(surface?.concentration).toBe("0.25%")
  })

  it("falls back to the first option when a page states neither", () => {
    const surface = resolveOptionDoseSurface({
      metadata: { unit: "mg", concentrationOptions: ["0.25%", "0.5%"] },
    })
    expect(surface?.concentration).toBe("0.25%")
  })

  it("ignores a declared strength that is not among the options", () => {
    const surface = resolveOptionDoseSurface({
      metadata: {
        unit: "mg",
        formulationOptions: ["ISOBARIC"],
        defaultFormulation: "HYPERBARIC",
      },
    })
    // Offering a formulation the drug does not come in would be worse than
    // offering the one it does.
    expect(surface?.formulation).toBe("ISOBARIC")
  })
})

describe("routes are matched on the canonical form, not the spelling", () => {
  it("finds a route mode authored under a different spelling", () => {
    const surface = resolveOptionDoseSurface({
      metadata: {
        unit: "mg",
        routes: ["IV"],
        routeModes: { intravenous: { unit: "mcg" } },
      },
      route: "IV",
    })
    expect(surface?.unit).toBe("mcg")
  })

  it("derives the route list from the route modes when none is declared", () => {
    expect(resolveOptionRoutes({ routeModes: { IV: {}, IM: {} } }).routes).toEqual(["IV", "IM"])
  })

  it("falls back to IV when a page declares no routes at all", () => {
    expect(resolveOptionRoutes({ unit: "mg" })).toEqual({ routes: ["IV"], defaultRoute: "IV" })
  })

  it("ignores a declared default the drug cannot be given by", () => {
    // An authoring mistake: the default must still be a route on the list.
    expect(resolveOptionRoutes({ routes: ["IV", "IM"], defaultRoute: "PO" }).defaultRoute).toBe("IV")
  })

  it("uses the declared default when it is a real route", () => {
    expect(resolveOptionRoutes({ routes: ["IV", "IM"], defaultRoute: "IM" }).defaultRoute).toBe("IM")
  })

  it("deduplicates routes that differ only in spelling", () => {
    expect(resolveOptionRoutes({ routes: ["IV", "intravenous"] }).routes).toEqual(["IV"])
  })
})

describe("a variable-step ladder", () => {
  it("takes the first rung that declares a step", () => {
    // Trusting rung zero blindly would fall through to a default of 1, which is
    // the wrong granularity for most drugs.
    const surface = resolveOptionDoseSurface({
      metadata: { unit: "mg", variableStep: [{ upTo: 10 }, { step: 0.5 }] },
    })
    expect(surface?.step).toBe(0.5)
  })

  it("prefers an explicit step over the ladder", () => {
    const surface = resolveOptionDoseSurface({
      metadata: { unit: "mg", step: 5, variableStep: [{ step: 0.5 }] },
    })
    expect(surface?.step).toBe(5)
  })
})

describe("missing is missing", () => {
  it("returns nothing at all for an option with no metadata", () => {
    expect(resolveOptionDoseSurface({ metadata: null })).toBeNull()
  })

  it("leaves an unauthored field undefined rather than inventing a number", () => {
    const surface = resolveOptionDoseSurface({ metadata: { routes: ["IV"] } })
    expect(surface?.unit).toBeUndefined()
    expect(surface?.min).toBeUndefined()
    expect(surface?.max).toBeUndefined()
    expect(surface?.step).toBeUndefined()
    expect(surface?.quickValues).toEqual([])
  })
})

describe("the single pre-filled amount", () => {
  it("prefers the route's own suggestion over the drug's", () => {
    const surface = resolveOptionDoseSurface({
      metadata: {
        unit: "mL",
        suggestedVolume: 500,
        routes: ["IV", "PO"],
        routeModes: { PO: { suggestedVolume: 50 } },
      },
      route: "PO",
    })
    expect(surface?.suggestedValue).toBe(50)
  })

  it("reads a per-route volume table", () => {
    const surface = resolveOptionDoseSurface({
      metadata: {
        unit: "mL",
        routes: ["IV", "PO"],
        suggestedVolumeByRoute: { intravenous: 250, PO: 50 },
      },
      route: "IV",
    })
    expect(surface?.suggestedValue).toBe(250)
    expect(surface?.suggestedVolumeByRoute).toEqual({ IV: 250, PO: 50 })
  })
})
