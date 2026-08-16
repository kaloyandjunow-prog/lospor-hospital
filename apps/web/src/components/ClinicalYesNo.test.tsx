// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { ClinicalYesNo } from "./ClinicalYesNo"

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) =>
    ({ "common.yes": "Yes", "common.no": "No", "common.notAsked": "not asked" })[key] ?? key,
}))

/**
 * The control exists because a checkbox could not say "nobody asked". These
 * hold the three states apart, because the failure they guard against is
 * silent: an unanswered question rendering as a confident No looks completely
 * normal on a form of forty.
 */
const base = { id: "smoking", label: "Smoking", onChange: () => {} }

describe("ClinicalYesNo", () => {
  it("says so when the question has not been asked", () => {
    render(<ClinicalYesNo {...base} value={null} />)
    expect(screen.getByText("not asked")).toBeTruthy()
  })

  it("stops saying so once either answer is given", () => {
    const { unmount } = render(<ClinicalYesNo {...base} value={true} />)
    expect(screen.queryByText("not asked")).toBeNull()
    unmount()
    render(<ClinicalYesNo {...base} value={false} />)
    expect(screen.queryByText("not asked")).toBeNull()
  })

  it("reports yes and no as different answers", () => {
    const onChange = vi.fn()
    const { unmount } = render(<ClinicalYesNo {...base} value={null} onChange={onChange} />)
    fireEvent.click(screen.getByLabelText("Smoking: Yes"))
    expect(onChange).toHaveBeenCalledWith(true)
    unmount()

    const second = vi.fn()
    render(<ClinicalYesNo {...base} value={null} onChange={second} />)
    fireEvent.click(screen.getByLabelText("Smoking: No"))
    expect(second).toHaveBeenCalledWith(false)
  })

  it("clears back to unanswered when the chosen side is tapped again", () => {
    // A mis-tap must be undoable. Without this the only way back from an
    // accidental answer is to record a different wrong one.
    const onChange = vi.fn()
    render(<ClinicalYesNo {...base} value={true} onChange={onChange} />)
    fireEvent.click(screen.getByLabelText("Smoking: Yes"))
    expect(onChange).toHaveBeenCalledWith(null)
  })

  it("does not answer the question merely by rendering", () => {
    const onChange = vi.fn()
    render(<ClinicalYesNo {...base} value={null} onChange={onChange} />)
    expect(onChange).not.toHaveBeenCalled()
  })

  it("marks a recorded finding, and marks it only when positive", () => {
    // latexAllergy and the family history pass tone="danger". A recorded "no
    // allergy" must not paint the row like an alarm, or the colour stops
    // meaning anything.
    const cls = (value: boolean | null) => {
      const { container, unmount } = render(
        <ClinicalYesNo {...base} value={value} tone="danger" />,
      )
      const html = container.innerHTML
      unmount()
      return html
    }
    expect(cls(true)).toContain("bg-destructive")
    expect(cls(false)).not.toContain("bg-destructive")
    expect(cls(null)).not.toContain("bg-destructive")
  })

  it("still renders the buttons when used as a bare drop-in for a checkbox", () => {
    // The mapped RCRI / Apfel / STOP-BANG groups own their own <Label>, so the
    // control is rendered without one. It must not lose the not-asked notice.
    render(<ClinicalYesNo id="rcriCHF" value={null} onChange={() => {}} />)
    expect(screen.getByLabelText("rcriCHF: Yes")).toBeTruthy()
    expect(screen.getByText("not asked")).toBeTruthy()
  })
})
