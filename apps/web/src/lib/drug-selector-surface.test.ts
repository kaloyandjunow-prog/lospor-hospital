import { describe, expect, it } from "vitest"
import type { LibraryOption } from "@lospor/core/option-library"
import {
  drugSelectorAtomicState,
  resolveAdultDrugSelectorSurface,
} from "./drug-selector-surface"

function option(metadata: LibraryOption["metadata"]): Pick<LibraryOption, "metadata"> {
  return { metadata }
}

describe("resolveAdultDrugSelectorSurface", () => {
  it("preselects an explicit default route and all of its dependent fields", () => {
    const surface = resolveAdultDrugSelectorSurface(option({
      routes: ["IV", "IT"],
      defaultRoute: "IT",
      routeModes: {
        IV: { min: 0, max: 100, step: 1, unit: "mg", quickValues: [10, 20] },
        IT: {
          min: 0,
          max: 5,
          step: 0.1,
          unit: "mL",
          quickValues: [1, 1.2],
          concentrationOptions: ["0.25%", "0.5%"],
          defaultConcentration: "0.5%",
          formulationOptions: ["ISOBARIC", "HYPERBARIC"],
          defaultFormulation: "HYPERBARIC",
          suggestedVolume: 1.2,
        },
      },
    }))

    expect(surface).toMatchObject({
      route: "INTRATHECAL",
      routes: ["IV", "INTRATHECAL"],
      unit: "mL",
      min: 0,
      max: 5,
      step: 0.1,
      quickValues: [1, 1.2],
      concentrationOptions: ["0.25%", "0.5%"],
      concentration: "0.5%",
      formulationOptions: ["ISOBARIC", "HYPERBARIC"],
      formulation: "HYPERBARIC",
      suggestedValue: 1.2,
    })
  })

  it("changes route atomically across aliases", () => {
    const entry = option({
      routes: ["IV", "Local infiltration"],
      defaultRoute: "IV",
      routeModes: {
        IV: { min: 0, max: 500, step: 10, unit: "mg", quickValues: [50, 100] },
        "Local infiltration": {
          min: 0,
          max: 50,
          step: 1,
          unit: "mL",
          quickValues: [2, 5],
          concentrationOptions: ["0.5%", "1%"],
          suggestedVolume: 5,
        },
      },
    })

    expect(resolveAdultDrugSelectorSurface(entry, "IV")).toMatchObject({
      route: "IV",
      unit: "mg",
      max: 500,
      quickValues: [50, 100],
      concentrationOptions: [],
    })
    expect(resolveAdultDrugSelectorSurface(entry, "INFILTRATION")).toMatchObject({
      route: "INFILTRATION",
      unit: "mL",
      max: 50,
      quickValues: [2, 5],
      concentrationOptions: ["0.5%", "1%"],
      concentration: "0.5%",
      suggestedValue: 5,
    })
  })

  it("keeps legacy flat local-anaesthetic profiles usable", () => {
    const surface = resolveAdultDrugSelectorSurface(option({
      mode: "concentration",
      min: 0,
      max: 60,
      variableStep: [{ upTo: 5, step: 0.1 }],
      quickValues: [1, 2, 5],
      unit: "mL",
      concentrationOptions: ["0.125%", "0.25%"],
      routes: ["Local infiltration", "IT"],
      suggestedVolume: 5,
      suggestedVolumeByRoute: { IT: 2 },
    }), "INTRATHECAL")

    expect(surface).toMatchObject({
      route: "INTRATHECAL",
      step: 0.1,
      quickValues: [1, 2, 5],
      concentration: "0.125%",
      suggestedValue: 2,
    })
  })
})

describe("drugSelectorAtomicState", () => {
  it("replaces every route-dependent selector field and clears custom concentration", () => {
    const next = drugSelectorAtomicState({
      route: "IV",
      routes: ["IV", "INTRATHECAL"],
      mode: "dose",
      min: 0,
      max: 100,
      step: 1,
      quickValues: [10, 20],
      unit: "mg",
      dose: "20",
      concentrationOptions: [],
      concentration: "",
      formulationOptions: [],
    })

    expect(next).toEqual({
      route: "IV",
      routes: ["IV", "INTRATHECAL"],
      dose: "20",
      unit: "mg",
      quickDoses: [10, 20],
      concentration: undefined,
      concentrationUnitHint: undefined,
      customConc: "",
      formulation: undefined,
      calculationUnavailableReason: undefined,
    })
  })
})
