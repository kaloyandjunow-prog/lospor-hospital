// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import type { VascularLine } from "@lospor/core/vascular-access-lines"

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key, useLocale: () => "en" }))

import { VascularSmart } from "./VascularSmart"

const START = "2026-11-02T09:30:00.000Z"
const NOW = "2026-11-02T09:55:00.000Z"

function setup(overrides: Partial<Parameters<typeof VascularSmart>[0]> = {}) {
  const onChange = vi.fn()
  render(
    <VascularSmart lines={[]} onChange={onChange} patient={{ clinicalMode: "ADULT", ageYears: 45 }} techniques={["GENERAL_TIVA"]} startedAt={START}
      now={() => NOW} timeZone="UTC" siteLabel={code => code} timeOf={iso => iso.slice(11, 16)} {...overrides} />,
  )
  return { onChange }
}
const saved = (onChange: ReturnType<typeof vi.fn>) => onChange.mock.calls[0]![0] as VascularLine[]

describe("Smart selection, the Vascular access tab (10.2.0)", () => {
  it("leads with all three kinds for general anaesthesia, and with a peripheral line for anything else", () => {
    setup()
    for (const type of ["PERIPHERAL", "ARTERIAL", "CENTRAL"]) expect(screen.getByTestId(`vascular-smart-card-${type}`)).toBeTruthy()
    expect(screen.getByTestId("vascular-smart-empty")).toBeTruthy()
  })

  it("keeps the other kinds behind More types for a regional case", () => {
    setup({ techniques: ["REGIONAL_SPINAL"] })
    expect(screen.queryByTestId("vascular-smart-card-ARTERIAL")).toBeNull()
    fireEvent.click(screen.getByTestId("vascular-smart-more"))
    expect(screen.getByTestId("vascular-smart-other-ARTERIAL")).toBeTruthy()
    expect(screen.getByTestId("vascular-smart-other-CENTRAL")).toBeTruthy()
  })

  it("opens the complete legacy site catalogue and carries a selected site into the panel", () => {
    setup({ techniques: ["REGIONAL_SPINAL"] })
    fireEvent.click(screen.getByTestId("vascular-smart-catalog"))
    expect(screen.getByTestId("vascular-smart-catalog-ART_ULNAR")).toBeTruthy()
    expect(screen.getByTestId("vascular-smart-catalog-CVK_EJV")).toBeTruthy()
    fireEvent.click(screen.getByTestId("vascular-smart-catalog-CVK_EJV"))
    expect(screen.getByTestId("vascular-smart-site-CVK_EJV").className).toContain("violet")
  })

  it("adds a peripheral line at the start of anaesthesia with the suggested size, no site asked", () => {
    const { onChange } = setup()
    fireEvent.click(screen.getByTestId("vascular-smart-card-PERIPHERAL"))
    expect(screen.queryByTestId("vascular-smart-site-VEN_PERIPHERAL")).toBeNull()
    fireEvent.click(screen.getByTestId("vascular-smart-add"))
    expect(saved(onChange)[0]).toMatchObject({ site: "VEN_PERIPHERAL", size: "18", sizeUnit: "G", insertedAt: START })
    expect(saved(onChange)[0]!.preexisting).toBeUndefined()
  })

  it("offers 24G and 26G, and takes the size picked and the time now", () => {
    const { onChange } = setup()
    fireEvent.click(screen.getByTestId("vascular-smart-card-PERIPHERAL"))
    expect(screen.getByTestId("vascular-smart-size-26")).toBeTruthy()
    fireEvent.click(screen.getByTestId("vascular-smart-size-24"))
    fireEvent.click(screen.getByTestId("vascular-smart-time-now"))
    fireEvent.click(screen.getByTestId("vascular-smart-add"))
    expect(saved(onChange)[0]).toMatchObject({ size: "24", insertedAt: NOW })
  })

  it("starts a child on a smaller cannula", () => {
    const { onChange } = setup({ patient: { clinicalMode: "PEDIATRIC", ageYears: 3 } })
    fireEvent.click(screen.getByTestId("vascular-smart-card-PERIPHERAL"))
    fireEvent.click(screen.getByTestId("vascular-smart-add"))
    expect(saved(onChange)[0]).toMatchObject({ size: "22" })
  })

  it("marks a line that arrived with the patient, told apart, with no time of ours", () => {
    const { onChange } = setup()
    fireEvent.click(screen.getByTestId("vascular-smart-ward"))
    expect(screen.getByTestId("vascular-smart-time-arrived")).toBeTruthy()
    fireEvent.click(screen.getByTestId("vascular-smart-add"))
    expect(saved(onChange)[0]).toMatchObject({ preexisting: true, insertedAt: null })
  })

  it("adds a central line with its type, lumens, depth and size in Fr", () => {
    const { onChange } = setup()
    fireEvent.click(screen.getByTestId("vascular-smart-card-CENTRAL"))
    fireEvent.click(screen.getByTestId("vascular-smart-lumens-2"))
    fireEvent.click(screen.getByTestId("vascular-smart-depth-14"))
    fireEvent.click(screen.getByTestId("vascular-smart-size-8"))
    fireEvent.click(screen.getByTestId("vascular-smart-add"))
    expect(saved(onChange)[0]).toMatchObject({ site: "CVK_IJV", sizeUnit: "Fr", size: "8", lumens: "2", depthCm: "14" })
  })

  it("collapses a selected kind when clicked again and charts CVC in on confirmation", () => {
    const onEvent = vi.fn()
    const { onChange } = setup({ onEvent })
    fireEvent.click(screen.getByTestId("vascular-smart-card-CENTRAL"))
    expect(screen.getByTestId("vascular-smart-panel")).toBeTruthy()
    fireEvent.click(screen.getByTestId("vascular-smart-card-CENTRAL"))
    expect(screen.queryByTestId("vascular-smart-panel")).toBeNull()
    fireEvent.click(screen.getByTestId("vascular-smart-card-CENTRAL"))
    fireEvent.click(screen.getByTestId("vascular-smart-add"))
    const event = onEvent.mock.calls[0]![0]
    expect(event).toMatchObject({ label: "CVC in", ts: START, intraopPatch: expect.objectContaining({ vascularAccesses: expect.any(Array) }) })
    expect(saved(onChange)[0]!.sourceEventId).toBe(event.id)
    expect(event.id).toEqual(expect.any(String))
  })

  it("adds more than one line, and Failed keeps both: the first struck through, the second in place", () => {
    const first: VascularLine = { id: "v1", site: "VEN_PERIPHERAL", siteLabel: "Venous › Peripheral IV", size: "18", sizeUnit: "G", insertedAt: START }
    const { onChange } = setup({ lines: [first] })
    fireEvent.click(screen.getByTestId("vascular-smart-card-PERIPHERAL"))
    fireEvent.click(screen.getByTestId("vascular-smart-add"))
    expect(saved(onChange)).toHaveLength(2)
    onChange.mockClear()
    fireEvent.click(screen.getByTestId("vascular-smart-fail-0"))
    fireEvent.click(screen.getByTestId("vascular-smart-add"))
    const next = saved(onChange)
    expect(next.map(line => [line.id, line.failed ?? false])).toEqual([["v1", true], [expect.stringMatching(/^vascular-/), false]])
    expect(next[0]!.failedAt).toBe(NOW)
  })

  it("shows what is in place first, who placed each line, and a failed line struck through", () => {
    const lines: VascularLine[] = [
      { id: "a", site: "VEN_PERIPHERAL", siteLabel: "x", size: "20", sizeUnit: "G", preexisting: true, insertedAt: null },
      { id: "b", site: "VEN_PERIPHERAL", siteLabel: "x", size: "18", sizeUnit: "G", insertedAt: START, failed: true, failedAt: NOW },
      { id: "c", site: "ART_RADIAL", siteLabel: "x", size: "20", sizeUnit: "G", insertedAt: START },
    ]
    setup({ lines })
    expect(screen.queryByTestId("vascular-smart-empty")).toBeNull()
    expect(screen.getByTestId("vascular-smart-line-0").textContent).toContain("alreadyInPlace")
    expect(screen.getByTestId("vascular-smart-line-1").textContent).toContain("failed")
    expect(screen.getByTestId("vascular-smart-line-2").textContent).toContain("placedHere")
    expect(screen.queryByTestId("vascular-smart-fail-1")).toBeNull()
  })
})
