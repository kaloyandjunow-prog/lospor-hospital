import { describe, expect, it } from "vitest"
import { ControlPlaneClientError, operatingTheatresShape } from "./control-plane.js"
import { renderOperatingTheatresPage, theatreListChangeFromForm } from "./operating-theatres-ui.js"

const view = {
  enabled: true,
  theatres: [
    { id: "t2", name: "Зала 2", active: true, sortOrder: 1, caseCount: 0 },
    { id: "t1", name: "Зала 1", active: true, sortOrder: 0, caseCount: 3 },
    { id: "t9", name: "Стара зала", active: false, sortOrder: 2, caseCount: 12 },
  ],
}

describe("operating theatres page (10.0.0)", () => {
  it("accepts the view the API sends, and not a broken one", () => {
    expect(operatingTheatresShape(view)).toBe(true)
    expect(operatingTheatresShape({ enabled: "yes", theatres: [] })).toBe(false)
  })

  it("lists the active theatres in order, and the retired ones apart", () => {
    const html = renderOperatingTheatresPage(view, "bg")
    expect(html.indexOf('value="Зала 1"')).toBeLessThan(html.indexOf('value="Зала 2"'))
    expect(html).toContain('data-testid="theatres-retired"')
    expect(html).toContain("Стара зала")
    expect(html).toContain('name="enabled" value="true" checked')
    // The first can only go down, the last only up.
    expect(html.match(/name="direction" value="up"/g)).toHaveLength(1)
  })

  it("says it is off and nothing is bundled", () => {
    const html = renderOperatingTheatresPage({ enabled: false, theatres: [] }, "en")
    expect(html).toContain("Off: the apps show no theatre anywhere")
    expect(html).toContain("No theatres yet")
  })

  it("reads each list form", () => {
    expect(theatreListChangeFromForm({ action: "add", name: " Зала 3 " })).toEqual({ action: "add", name: "Зала 3" })
    expect(theatreListChangeFromForm({ action: "rename", id: "t1", name: "Зала 1А" })).toEqual({ action: "rename", id: "t1", name: "Зала 1А" })
    expect(theatreListChangeFromForm({ action: "move", id: "t1", direction: "down" })).toEqual({ action: "move", id: "t1", direction: "down" })
    expect(() => theatreListChangeFromForm({ action: "policy", enabled: "true" })).toThrow(ControlPlaneClientError)
    expect(() => theatreListChangeFromForm({ action: "add", name: "" })).toThrow(ControlPlaneClientError)
  })
})
