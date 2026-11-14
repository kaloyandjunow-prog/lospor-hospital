// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react"
import { useForm } from "react-hook-form"
import { describe, expect, it, vi } from "vitest"
import { PatientEgnField } from "./PatientEgnField"

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key, useLocale: () => "bg" }))

function Harness() {
  const { register, watch } = useForm<{ patientNationalId?: string }>()
  return <PatientEgnField registration={register("patientNationalId")} value={watch("patientNationalId")} />
}

describe("PatientEgnField", () => {
  it("shows a wrong ЕГН as it is typed, before the form is left", () => {
    render(<Harness />)
    const input = screen.getByLabelText("ЕГН")
    fireEvent.change(input, { target: { value: "2402459943" } })
    expect(screen.getByRole("alert").textContent).toBe("egnInvalid")
    expect(input.getAttribute("aria-invalid")).toBe("true")
  })

  it("waits for the field to be left before calling a short ЕГН unfinished", () => {
    render(<Harness />)
    const input = screen.getByLabelText("ЕГН")
    fireEvent.change(input, { target: { value: "750101" } })
    expect(screen.queryByRole("alert")).toBeNull()
    fireEvent.blur(input)
    expect(screen.getByRole("alert").textContent).toBe("egnIncomplete")
    fireEvent.change(input, { target: { value: "7501010010" } })
    expect(screen.queryByRole("alert")).toBeNull()
  })
})
