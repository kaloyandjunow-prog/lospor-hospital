import { describe, expect, it } from "vitest"
import { ControlPlaneClientError, intraopReadingsShape } from "./control-plane.js"
import { intraopFixture } from "./intraop.fixture.js"
import { readingsFixture } from "./readings.fixture.js"
import { renderReadingsPage, readingsUpdateFromForm, readingsStrings, renderIntraopTabs } from "./readings-ui.js"
import { UNUSUAL_READINGS_SCRIPT, readingsMath } from "./readings-script.js"

describe("the Unusual readings arithmetic (10.2.0)", () => {
  const histogram = { min: 60, counts: [1, 2, 4, 2, 1] } // 60:1 61:2 62:4 63:2 64:1, ten readings

  it("finds a percentile as Core does: the reading at that rank", () => {
    expect(readingsMath.percentile(histogram, 0)).toBe(60)
    expect(readingsMath.percentile(histogram, 50)).toBe(62)
    expect(readingsMath.percentile(histogram, 99.9)).toBe(64)
    expect(readingsMath.percentile({ min: 0, counts: [0, 0] }, 50)).toBeNull()
  })

  it("gives the limits at a tail setting, and the share past a value", () => {
    expect(readingsMath.limitsOf(histogram, 10, 10)).toEqual({ low: 61, high: 64 })
    expect(readingsMath.limitsOf(undefined, 0.5, 0.5)).toEqual({ low: null, high: null })
    expect(readingsMath.shareOf(histogram, 62, "below")).toBeCloseTo(30)
    expect(readingsMath.shareOf(histogram, 62, "above")).toBeCloseTo(30)
    expect(readingsMath.meanSd(histogram)!.mean).toBeCloseTo(62)
  })

  it("counts the cases a set of limits would ask about, and the fixed rules beside them", () => {
    const rows: Array<Array<number | null>> = [
      [55, 90, 100, 60, 75], // heart rate 55: under the statistical 60, not under the fixed 50
      [70, 120, 60, 50, 60], // DBP 50 under the statistical 55; MAP 60 under the fixed 65; heart rate max 120 over the fixed 100
      [80, 130, 110, 70, 85], // heart rate max 130: over the statistical 125 and the fixed 100
      [null, null, null, null, null], // a case without readings counts, and asks nothing
    ]
    const limits = { hr: { low: 60, high: 125 }, sbp: { low: 50 }, dbp: { low: 55 }, map: { low: 62 } }
    const fixed = { tachycardiaAbove: 100, bradycardiaBelow: 50, hypotension: { sign: "map", from: 65, to: 65 } }
    const out = readingsMath.impactOf(rows, limits, fixed)
    expect(out.cases).toBe(4)
    expect(out.bradycardia).toBeCloseTo(25) // the first case, 55 < 60
    expect(out.hypotension).toBeCloseTo(25) // the second: DBP 50 < 55
    expect(out.tachycardia).toBeCloseTo(25) // the third: 130 > 125
    expect(out.any).toBeCloseTo(75)
    expect(out.fixedHypotensionTo).toBeCloseTo(25) // MAP 60 < 65 in the second
    expect(out.fixedBradycardia).toBeCloseTo(0)
    expect(out.fixedTachycardia).toBeCloseTo(50) // 120 and 130 are above 100; 90 is not
    expect(out.anyWithFixed).toBeCloseTo(75)
    expect(readingsMath.impactOf([], limits, fixed).any).toBeNull()
  })
})

describe("the Unusual readings page (10.2.0)", () => {
  it("accepts the view the API sends, and refuses one whose case rows do not match its columns", () => {
    expect(intraopReadingsShape(readingsFixture())).toBe(true)
    const broken = readingsFixture()
    broken.cases.ADULT![0] = [1, 2, 3]
    expect(intraopReadingsShape(broken)).toBe(false)
    expect(intraopReadingsShape({ ...readingsFixture(), history: "nope" })).toBe(false)
  })

  it("is a tab of the SPS page, in both languages, with its limits as plain fields and its data as a data block", () => {
    const en = renderReadingsPage(readingsFixture(), "en")
    expect(en).toContain('href="/status/control/intraop"')
    expect(en).toMatch(/<a href="\/status\/control\/intraop\/readings" aria-current="page">Unusual readings<\/a>/)
    expect(en).toContain('data-testid="readings-form"')
    expect(en).toContain('name="tail_ADULT_hr_low"')
    expect(en).toContain('name="tail_INFANT_map_high"')
    expect(en).toContain('name="minCases"')
    expect(en).toContain('src="/status/unusual-readings.js"')
    // No inline script runs: the one script block is data.
    expect(en).toContain('<script type="application/json" id="ur-data">')
    expect(en.match(/<script(?![^>]*\bsrc=)(?![^>]*application\/json)/g)).toBeNull()
    // The sentence about hypertension: a high pressure limit asks nothing.
    expect(en).toContain("data-asks-nothing")
    const bg = renderReadingsPage(readingsFixture(), "bg")
    expect(bg).toContain("Необичайни показания")
    expect(bg).toContain("Възрастова група")
    expect(bg).toContain("Запазване на границите")
    expect(renderReadingsPage(null, "en")).toContain("does not report the readings yet")
  })

  it("keeps the data block from ever closing its own script element", () => {
    const hostile = readingsFixture()
    hostile.bands[0]!.labelEn = "</script><script>alert(1)</script>"
    const html = renderReadingsPage(hostile, "en")
    expect(html).not.toContain("</script><script>alert")
    expect(JSON.parse(html.match(/<script type="application\/json" id="ur-data">([\s\S]*?)<\/script>/)![1]!).bands[0].labelEn).toBe("</script><script>alert(1)</script>")
  })

  it("names the tabs the same way on the Switches page", () => {
    expect(renderIntraopTabs("switches", "en")).toMatch(/<a href="\/status\/control\/intraop" aria-current="page">Switches<\/a>/)
    expect(renderIntraopTabs("switches", "bg")).toContain("Превключватели")
  })

  it("has every word the script writes, in both languages", () => {
    const en = readingsStrings("en"), bg = readingsStrings("bg")
    expect(Object.keys(bg).sort()).toEqual(Object.keys(en).sort())
    for (const key of Object.keys(en)) expect(bg[key]!.length).toBeGreaterThan(0)
    expect(bg.hypotension).toBe("Хипотенсия")
    expect(bg.tachycardia).toBe("Тахикардия")
  })
})

describe("saving the limits (10.2.0)", () => {
  const reason = "Agreed at the department meeting"
  const spsView = intraopFixture()
  const fields = (over: Record<string, string> = {}) => ({
    minCases: "150",
    tail_INFANT_hr_low: "1", tail_INFANT_hr_high: "0.5", tail_INFANT_sbp_low: "2", tail_INFANT_sbp_high: "0.5",
    tail_ADULT_hr_low: "0,25", tail_ADULT_hr_high: "5", tail_ADULT_sbp_low: "0.5", tail_ADULT_sbp_high: "2.5",
    ...over,
  })

  it("changes the limits and the minimum, and nothing else that is switched on the SPS page", () => {
    const update = readingsUpdateFromForm(spsView, fields(), reason)
    expect(update.vitalQuestions.minCases).toBe(150)
    expect(update.vitalQuestions.tails.INFANT!.hr).toEqual({ low: 1, high: 0.5 })
    expect(update.vitalQuestions.tails.ADULT!.hr).toEqual({ low: 0.25, high: 5 })
    // Everything else is what was in force: a group left unticked here is not switched off by omission.
    expect(update.enabled).toBe(spsView.config.enabled)
    expect(update.groups).toEqual(spsView.config.groups)
    expect(update.disabled).toEqual(spsView.config.disabled)
    expect(update.dantroleneVialsMg).toEqual(spsView.config.dantroleneVialsMg)
    expect(update.vitalQuestions.enabled).toBe(spsView.config.vitalQuestions.enabled)
    expect(update.reason).toBe(reason)
  })

  it("refuses a step the API did not offer, and a minimum outside its range", () => {
    expect(() => readingsUpdateFromForm(spsView, fields({ tail_ADULT_hr_low: "3" }), reason)).toThrow(ControlPlaneClientError)
    expect(() => readingsUpdateFromForm(spsView, fields({ tail_ADULT_hr_low: "" }), reason)).toThrow(ControlPlaneClientError)
    expect(() => readingsUpdateFromForm(spsView, fields({ minCases: "19" }), reason)).toThrow(ControlPlaneClientError)
    expect(() => readingsUpdateFromForm(spsView, fields({ minCases: "10001" }), reason)).toThrow(ControlPlaneClientError)
    expect(() => readingsUpdateFromForm(spsView, fields({ minCases: "" }), reason)).toThrow(ControlPlaneClientError)
    const withoutAll: Record<string, string> = { minCases: "150" }
    expect(() => readingsUpdateFromForm(spsView, withoutAll, reason)).toThrow(ControlPlaneClientError)
  })
})

/** The smallest DOM the page's script needs: elements by id, form fields as plain objects. */
function fakeDocument(html: string) {
  const data = html.match(/<script type="application\/json" id="ur-data">([\s\S]*?)<\/script>/)![1]!
  const parsed = JSON.parse(data)
  const nodes = new Map<string, Record<string, unknown>>()
  const node = (id: string) => {
    let current = nodes.get(id)
    if (!current) {
      current = { id, innerHTML: "", textContent: "", className: "", value: "0", hidden: false, disabled: false, attrs: {} as Record<string, string>,
        setAttribute(name: string, value: string) { (this.attrs as Record<string, string>)[name] = value },
        getAttribute(name: string) { return (this.attrs as Record<string, string>)[name] ?? null },
        querySelectorAll: () => [], addEventListener: () => undefined }
      nodes.set(id, current)
    }
    return current
  }
  const fields = new Map<string, { value: string }>()
  const elements = new Proxy({} as Record<string, { value: string; addEventListener: () => void }>, {
    get(_target, name: string) {
      let field = fields.get(name)
      if (!field) {
        const match = /^tail_(.+)_(hr|sbp|dbp|map)_(low|high)$/.exec(name)
        field = { value: match ? "0.5" : "100" }
        fields.set(name, field)
      }
      return Object.assign(field, { addEventListener: () => undefined })
    },
  })
  const form = { elements }
  const document = {
    getElementById: (id: string) => id === "ur-data" ? { textContent: data } : id === "ur-form" ? form : node(id),
  }
  return { document, node, fields, parsed }
}

describe("the Unusual readings script (10.2.0)", () => {
  it("is valid JavaScript that draws the chart, the impact table, the preview and the history", () => {
    const html = renderReadingsPage(readingsFixture(), "en")
    const { document, node } = fakeDocument(html)
    new Function("document", UNUSUAL_READINGS_SCRIPT)(document)
    const chart = String(node("ur-chart").innerHTML)
    expect(chart).toContain('class="ur-bar')
    expect(chart).toContain("ur-limit")
    expect(chart).toContain("ur-fixed")
    expect(String(node("ur-impact").innerHTML)).toContain("Hypotension")
    expect(String(node("ur-impact").innerHTML)).toContain("Judged on the patient's own baseline")
    expect(String(node("ur-any").textContent)).toMatch(/%$/)
    expect(String(node("ur-pv-title").textContent)).toMatch(/^HR \d+: log tachycardia\?$/)
    expect(String(node("ur-hist").innerHTML)).toContain("<polyline")
    expect(String(node("ur-state").innerHTML)).toContain("Statistics active")
    expect(String(node("ur").className)).toContain("ur-js")
  })

  it("redraws when a slider moves, and writes the step into the field the form posts", () => {
    const html = renderReadingsPage(readingsFixture(), "en")
    const { document, node, fields } = fakeDocument(html)
    new Function("document", UNUSUAL_READINGS_SCRIPT)(document)
    const before = String(node("ur-chart").innerHTML)
    const lo = node("ur-lo") as { value: string; oninput: (this: unknown) => void }
    lo.value = "6" // 5 %
    lo.oninput.call(lo)
    expect(fields.get("tail_ADULT_hr_low")!.value).toBe("5")
    expect(String(node("ur-chart").innerHTML)).not.toBe(before)
  })

  it("speaks Bulgarian with the chart's own names", () => {
    const html = renderReadingsPage(readingsFixture(), "bg")
    const { document, node } = fakeDocument(html)
    new Function("document", UNUSUAL_READINGS_SCRIPT)(document)
    expect(String(node("ur-pv-title").textContent)).toMatch(/^СЧ \d+: Тахикардия\?$/)
    expect(String(node("ur-impact").innerHTML)).toContain("Хипотенсия")
    expect(String(node("ur-state").innerHTML)).toContain("Статистиката е активна")
  })
})
