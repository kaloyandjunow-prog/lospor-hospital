import { describe, expect, it } from "vitest"
import { ControlPlaneClientError, drugColorsShape } from "./control-plane.js"
import { drugColorUpdateFromForm, renderDrugColorsPage } from "./drug-colors-ui.js"
import { drugColorsFixture } from "./drug-colors.fixture.js"

describe("drug colours page (10.0.0)", () => {
  const view = drugColorsFixture()

  it("accepts the view the API sends, and not a broken one", () => {
    expect(drugColorsShape(view)).toBe(true)
    expect(drugColorsShape({ ...view, groups: [{ ...view.groups[0], color: "orange" }] })).toBe(false)
  })

  it("lists the groups, opening onto their drugs, in the colour each is drawn in", () => {
    const html = renderDrugColorsPage(view, "bg")
    expect(html).toContain("Опиоидни аналгетици")
    // Fentanyl follows its group's chosen colour; Remifentanil has its own.
    expect(html).toMatch(/background:#3b82f6"[^]*?Фентанил/)
    expect(html).toMatch(/background:#a1b2c3"[^]*?Ремифентанил/)
    expect(html).toContain("болус · инфузия")
    expect(html).not.toContain('data-testid="drug-color-editor"')
  })

  it("finds a drug across the groups", () => {
    const html = renderDrugColorsPage(view, "en", { q: "ondan" })
    expect(html).toContain('data-testid="drug-color-results"')
    expect(html).toContain("Ondansetron")
    expect(html).not.toContain("Fentanyl")
  })

  it("opens the editor for one drug, with its own colour chosen", () => {
    const html = renderDrugColorsPage(view, "en", { edit: "DRUG:Remifentanil" })
    expect(html).toContain('data-testid="drug-color-editor"')
    expect(html).toContain('name="name" value="Remifentanil"')
    // Not a palette colour: the free colour is the one chosen.
    expect(html).toContain('value="custom" checked')
    expect(html).toContain('name="custom" value="#a1b2c3"')
    expect(html).toContain("Follow the group's colour")
  })

  it("reads the editor's choice", () => {
    expect(drugColorUpdateFromForm(view, { scope: "GROUP", name: "Opioid analgesics", choice: "#EF4444" })).toEqual({ scope: "GROUP", name: "Opioid analgesics", color: "#ef4444" })
    expect(drugColorUpdateFromForm(view, { scope: "DRUG", name: "Fentanyl", choice: "custom", custom: "#123ABC" })).toEqual({ scope: "DRUG", name: "Fentanyl", color: "#123abc" })
    expect(drugColorUpdateFromForm(view, { scope: "DRUG", name: "Remifentanil", choice: "reset" })).toEqual({ scope: "DRUG", name: "Remifentanil", color: null })
    expect(() => drugColorUpdateFromForm(view, { scope: "DRUG", name: "Fentanyl", choice: "custom", custom: "red" })).toThrow(new ControlPlaneClientError("DRUG_COLOR_INVALID"))
    expect(() => drugColorUpdateFromForm(view, { scope: "DRUG", name: "Nonexistium", choice: "reset" })).toThrow(new ControlPlaneClientError("DRUG_COLOR_TARGET_NOT_FOUND"))
    expect(() => drugColorUpdateFromForm(null, { scope: "DRUG", name: "Fentanyl", choice: "reset" })).toThrow(new ControlPlaneClientError("DRUG_COLOR_TARGET_NOT_FOUND"))
  })

  it("says so when the API has no colours", () => {
    expect(renderDrugColorsPage(undefined, "en")).toContain("does not offer the drug colours yet")
  })
})
