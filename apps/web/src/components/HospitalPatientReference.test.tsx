// @vitest-environment jsdom
import { act, fireEvent, render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { HospitalPatientReference } from "./HospitalPatientReference"

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }))

describe("HospitalPatientReference", () => {
  beforeEach(() => vi.clearAllMocks())

  it("shows only the masked server identifier", () => {
    render(<HospitalPatientReference maskedIdentifier="00****45" onRelink={vi.fn()} />)
    expect(screen.getByTestId("masked-patient-identifier").textContent).toBe("00****45")
    expect(document.body.textContent).not.toContain("00012345")
  })

  it("requires a review and explicit confirmation before relinking", async () => {
    const onRelink = vi.fn(async () => ({ ok: true as const }))
    render(<HospitalPatientReference maskedIdentifier="00****45" onRelink={onRelink} />)

    fireEvent.click(screen.getByRole("button", { name: "correct" }))
    fireEvent.change(screen.getByLabelText("newNumber"), { target: { value: "NEW-00099" } })
    fireEvent.change(screen.getByLabelText("repeatNumber"), { target: { value: "NEW-00099" } })
    fireEvent.click(screen.getByRole("button", { name: "review" }))

    expect(onRelink).not.toHaveBeenCalled()
    expect(screen.getByRole("alertdialog")).toBeTruthy()
    // Confirmation deliberately does not echo the raw number.
    expect(screen.getByRole("alertdialog").textContent).not.toContain("NEW-00099")

    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "confirm" })) })
    expect(onRelink).toHaveBeenCalledWith("NEW-00099")
    expect(screen.queryByRole("alertdialog")).toBeNull()
  })

  it("keeps the correction available for retry when relinking fails", async () => {
    const onRelink = vi.fn(async () => ({ ok: false as const, error: "retry safely" }))
    render(<HospitalPatientReference maskedIdentifier="00****45" onRelink={onRelink} />)

    fireEvent.click(screen.getByRole("button", { name: "correct" }))
    fireEvent.change(screen.getByLabelText("newNumber"), { target: { value: "NEW-00099" } })
    fireEvent.change(screen.getByLabelText("repeatNumber"), { target: { value: "NEW-00099" } })
    fireEvent.click(screen.getByRole("button", { name: "review" }))
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "confirm" })) })

    expect(screen.getByRole("alert").textContent).toBe("retry safely")
    expect(screen.getByRole("alertdialog")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "back" }))
    expect((screen.getByLabelText("newNumber") as HTMLInputElement).value).toBe("NEW-00099")
  })

  it("does not offer confirmation or call PATCH when the two entries differ", () => {
    const onRelink = vi.fn()
    render(<HospitalPatientReference maskedIdentifier="00****45" onRelink={onRelink} />)
    fireEvent.click(screen.getByRole("button", { name: "correct" }))
    fireEvent.change(screen.getByLabelText("newNumber"), { target: { value: "NEW-00099" } })
    fireEvent.change(screen.getByLabelText("repeatNumber"), { target: { value: "NEW-00098" } })
    fireEvent.click(screen.getByRole("button", { name: "review" }))

    expect(screen.getByRole("alert").textContent).toBe("mismatch")
    expect(screen.queryByRole("alertdialog")).toBeNull()
    expect(onRelink).not.toHaveBeenCalled()
  })
})
