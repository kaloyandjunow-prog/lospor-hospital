import { describe, expect, it } from "vitest"
import { ControlPlaneClientError, indicatorsShape } from "./control-plane.js"
import { indicatorsUpdateFromForm, renderIndicatorsPage } from "./indicators-ui.js"
import { indicatorsFixture } from "./indicators.fixture.js"

const form = (overrides: Record<string, string> = {}) => ({
  map_INFANT: "", sbp_INFANT: "70", map_ADULT: "60", sbp_ADULT: "",
  spo2Below: "92", tempBelow: "35,5", painAbove: "4", paedAtLeast: "12", ...overrides,
})

describe("unit indicators page (10.0.0)", () => {
  it("accepts the view the API sends", () => {
    expect(indicatorsShape(indicatorsFixture())).toBe(true)
    expect(indicatorsShape({ config: {}, defaults: {} })).toBe(false)
  })

  it("shows each age band's thresholds beside the bundled ones, and the names switch off", () => {
    const html = renderIndicatorsPage(indicatorsFixture({ hypotensionBands: [] }), "bg")
    expect(html).toContain('data-testid="indicators-form"')
    const full = renderIndicatorsPage(indicatorsFixture(), "bg")
    expect(full).toContain('name="sbp_INFANT"')
    expect(full).toContain('name="map_ADULT" inputmode="decimal" value="65"')
    expect(full).toContain("вградено: САН &lt; 65")
    expect(full).not.toMatch(/data-testid="indicators-named" checked|value="true" checked data-testid="indicators-named"/)
  })

  it("reads the form, a comma as a decimal point and an empty value as not used", () => {
    expect(indicatorsUpdateFromForm(indicatorsFixture(), { ...form(), namedClinicians: "true" }, "Agreed at the department meeting")).toEqual({
      hypotensionBands: [{ key: "INFANT", mapBelow: null, sbpBelow: 70 }, { key: "ADULT", mapBelow: 60, sbpBelow: null }],
      spo2Below: 92, tempBelow: 35.5, painAbove: 4, paedAtLeast: 12, namedClinicians: true, reason: "Agreed at the department meeting",
    })
    expect(() => indicatorsUpdateFromForm(indicatorsFixture(), form({ spo2Below: "120" }), "x".repeat(10))).toThrow(ControlPlaneClientError)
    expect(() => indicatorsUpdateFromForm(indicatorsFixture(), form({ map_ADULT: "abc" }), "x".repeat(10))).toThrow(ControlPlaneClientError)
    // The ranges Core reads them in: MAP to 150, systolic from 20.
    expect(() => indicatorsUpdateFromForm(indicatorsFixture(), form({ map_ADULT: "160" }), "x".repeat(10))).toThrow(ControlPlaneClientError)
    expect(() => indicatorsUpdateFromForm(indicatorsFixture(), form({ sbp_INFANT: "15" }), "x".repeat(10))).toThrow(ControlPlaneClientError)
    expect(indicatorsUpdateFromForm(indicatorsFixture(), form({ map_ADULT: "150", sbp_INFANT: "20" }), "x".repeat(10)).hypotensionBands).toEqual([
      { key: "INFANT", mapBelow: null, sbpBelow: 20 }, { key: "ADULT", mapBelow: 150, sbpBelow: null },
    ])
  })
})
