import { describe, expect, it } from "vitest"

import { adultPremedForRoute } from "./premed-route-dose"
import type { PremDrug } from "./intraop-types"

const midazolam: PremDrug = {
  name: "Midazolam", dose: 7.5, unit: "mg", min: 3, max: 15, step: 1,
  routes: ["PO", "IM", "IV"], defaultRoute: "PO", hint: "",
}

describe("adult premedication by route", () => {
  it("replaces the dose on a route change: midazolam 7.5 mg PO becomes 1 mg IV", () => {
    const iv = adultPremedForRoute(midazolam, "IV")
    expect(iv.dose).toBe("1")
    expect(iv.drug).toMatchObject({ unit: "mg", min: 0, max: 2.5, step: 0.1 })
  })

  it("records adult ketamine in calculated mg and leaves home medicines empty", () => {
    const ketamine = { ...midazolam, name: "Ketamine", unit: "mg/kg", routes: ["PO", "IV", "IM"] }
    expect(adultPremedForRoute(ketamine, "PO", 80)).toMatchObject({ dose: "80", drug: { unit: "mg" } })
    expect(adultPremedForRoute(ketamine, "PO", null).dose).toBe("")
    expect(adultPremedForRoute({ ...midazolam, name: "Warfarin" }, "PO").dose).toBe("")
  })
})
