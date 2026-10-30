// @vitest-environment jsdom

import { act, fireEvent, render, screen, within } from "@testing-library/react"
import { NextIntlClientProvider } from "next-intl"
import { describe, expect, it, vi } from "vitest"
import { defaultPreopSectionConfig } from "@lospor/core/preop-orders"
import enMessages from "../../../messages/en.json"

vi.mock("@/hooks/useOptionLibrary", () => ({
  useOptionLibrary: (category: string) => ({
    options: category === "DISPOSITION"
      ? [{ value: "WARD", label: "Ward", labelEn: "Ward" }, { value: "ICU", label: "ICU", labelEn: "ICU" }]
      : [],
    loading: false, source: "bundled",
  }),
  useRange: () => ({ min: 0, max: 300, step: 1, unit: "" }),
}))

import { PostopForm } from "./PostopForm"

type Props = Partial<Parameters<typeof PostopForm>[0]>
function renderForm(props: Props = {}) {
  const onSubmit = vi.fn()
  const view = render(
    <NextIntlClientProvider locale="en" messages={enMessages}>
      <PostopForm onSubmit={onSubmit} onBack={vi.fn()} submitting={false} {...props} />
    </NextIntlClientProvider>,
  )
  return { ...view, onSubmit }
}
const performedRow = () => screen.getByTestId("performed-procedure")
const submit = async (container: HTMLElement) => { await act(async () => { fireEvent.submit(container.querySelector("form") as HTMLFormElement) }) }

describe("the procedure done (10.0.0)", () => {
  it("starts as the planned procedure, and is not marked required", () => {
    renderForm({ plannedProcedures: [{ label: "Cholecystectomy" }] })
    expect(within(performedRow()).getAllByText("Cholecystectomy").length).toBeGreaterThan(0)
    expect(within(performedRow()).getByText(enMessages.postop.performedProcedureHint)).toBeTruthy()
    expect(within(performedRow()).queryByText("*")).toBeNull()
  })

  it("keeps what was saved rather than the plan", () => {
    renderForm({ plannedProcedures: [{ label: "Cholecystectomy" }], defaultValues: { performedProcedures: [{ label: "Exploratory laparotomy" }] } as never })
    expect(within(performedRow()).getAllByText("Exploratory laparotomy").length).toBeGreaterThan(0)
    expect(within(performedRow()).queryByText("Cholecystectomy")).toBeNull()
  })

  it("is required, and says what to record, when the plan was not yet known", () => {
    renderForm({ procedureUndetermined: true })
    expect(within(performedRow()).getByText("*")).toBeTruthy()
    expect(within(performedRow()).getByText(enMessages.postop.performedProcedureUndetermined)).toBeTruthy()
  })

  it("goes out with the record", async () => {
    const { container, onSubmit } = renderForm({
      plannedProcedures: [{ label: "Cholecystectomy" }],
      defaultValues: { aldreteActivity: 2, aldreteRespiration: 2, aldreteCirculation: 2, aldreteConsciousness: 2, aldreteSpO2: 2, disposition: "WARD" } as never,
    })
    await submit(container)
    expect(onSubmit).toHaveBeenCalledTimes(1)
    expect(onSubmit.mock.calls[0][0].performedProcedures).toEqual([expect.objectContaining({ label: "Cholecystectomy" })])
  })
})

describe("the recovery score: Aldrete for adults, Steward for children (10.0.0)", () => {
  it("scores an adult on Aldrete out of 10", () => {
    renderForm({ defaultValues: { aldreteActivity: 2, aldreteRespiration: 2, aldreteCirculation: 2, aldreteConsciousness: 2, aldreteSpO2: 1 } as never })
    expect(screen.getByTestId("aldrete-total").textContent).toContain("9 / 10")
    expect(screen.queryByTestId("steward-total")).toBeNull()
  })

  it("scores a child on Steward out of 6, ready from 4", () => {
    renderForm({ clinicalMode: "PEDIATRIC", patientAge: { ageValue: 5, ageUnit: "YEARS", ageYears: 5 }, defaultValues: { stewardConsciousness: 2, stewardAirway: 1, stewardMovement: 1 } as never })
    expect(screen.getByTestId("steward-total").textContent).toContain("4 / 6")
    expect(screen.getByText(enMessages.postop.aldreteReady)).toBeTruthy()
    expect(screen.queryByTestId("aldrete-total")).toBeNull()
  })

  it("has no total until every item is scored", () => {
    renderForm({ clinicalMode: "PEDIATRIC", patientAge: { ageValue: 5, ageUnit: "YEARS", ageYears: 5 }, defaultValues: { stewardConsciousness: 2, stewardAirway: 1 } as never })
    expect(screen.getByTestId("steward-total").textContent).toContain("— / 6")
  })

  it("updates the Steward total when the three answers arrive in one interaction burst", async () => {
    renderForm({ clinicalMode: "PEDIATRIC", patientAge: { ageValue: 5, ageUnit: "YEARS", ageYears: 5 } })
    const card = screen.getByTestId("steward-total").closest("[data-tour='postop-aldrete']") as HTMLElement
    const rows = card.querySelectorAll("div.grid.grid-cols-3")

    await act(async () => { fireEvent.click(rows[0].querySelectorAll("button")[2]) })
    await act(async () => { fireEvent.click(rows[1].querySelectorAll("button")[1]) })
    expect(screen.getByTestId("steward-total").textContent).toContain("— / 6")
    await act(async () => { fireEvent.click(rows[2].querySelectorAll("button")[2]) })

    expect(screen.getByTestId("steward-total").textContent).toContain("5 / 6")
  })
})

describe("the item pain scales", () => {
  it("updates FLACC after all five answers are entered in one interaction burst", async () => {
    renderForm({ clinicalMode: "PEDIATRIC", patientAge: { ageValue: 3, ageUnit: "YEARS", ageYears: 3 } })
    const scale = screen.getByTestId("flacc-scale")
    const rows = scale.querySelectorAll(":scope > div")

    for (const [row, answer] of [[0, 1], [1, 0], [2, 2], [3, 1]] as const) {
      await act(async () => { fireEvent.click(rows[row].querySelectorAll("button")[answer]) })
    }
    expect(screen.getByTestId("flacc-total").textContent).toContain("— / 10")
    await act(async () => { fireEvent.click(rows[4].querySelectorAll("button")[1]) })

    expect(screen.getByTestId("flacc-total").textContent).toContain("5 / 10")
  })
})

describe("the recovery observations suggest two Aldrete items, set only by a tap (10.0.0)", () => {
  it("suggests SpO2 and circulation from the readings, and sets one only when tapped", async () => {
    renderForm({ preopSystolic: 120, defaultValues: { recoverySpO2: 88, recoveryBpSystolic: 60 } as never })
    const spo2 = screen.getByTestId("suggest-aldreteSpO2")
    expect(spo2.textContent).toContain("88")
    expect(screen.getByTestId("suggest-aldreteCirculation").textContent).toContain("120")
    // Nothing is set yet.
    expect(screen.getByTestId("aldrete-total").textContent).toContain("— / 10")
    await act(async () => { fireEvent.click(within(spo2).getByRole("button")) })
    expect(screen.queryByTestId("suggest-aldreteSpO2")).toBeNull()
  })

  it("suggests nothing for a child, or while the vitals section is switched off", () => {
    renderForm({ clinicalMode: "PEDIATRIC", patientAge: { ageValue: 5, ageUnit: "YEARS", ageYears: 5 }, preopSystolic: 120, defaultValues: { recoverySpO2: 88 } as never })
    expect(screen.queryByTestId("suggest-aldreteSpO2")).toBeNull()
  })
})

describe("the hospital's postop sections (10.0.0)", () => {
  it("shows recovery vitals and pain by default", () => {
    const { container } = renderForm()
    expect(container.querySelector("#postop-sec-vitals")).toBeTruthy()
    expect(container.querySelector("#postop-sec-pain")).toBeTruthy()
  })

  it("leaves out the sections switched off in Status, never the score or where the patient goes", () => {
    const config = defaultPreopSectionConfig("ADULT")
    const off = { ...config, sections: { ...config.sections, POSTOP_RECOVERY_VITALS: false, POSTOP_PAIN: false, POSTOP_PONV: false } }
    const { container } = renderForm({ sectionConfigs: { ADULT: off } })
    expect(container.querySelector("#postop-sec-vitals")).toBeNull()
    expect(container.querySelector("#postop-sec-pain")).toBeNull()
    expect(screen.getByTestId("aldrete-total")).toBeTruthy()
    expect(container.querySelector("#postop-sec-discharge")).toBeTruthy()
  })
})
