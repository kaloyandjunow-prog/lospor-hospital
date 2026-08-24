// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { DoseSelector, type DoseSelectorProps } from "./DoseSelector"

vi.mock("next-intl", () => ({ useLocale: () => "en" }))

const baseProps: DoseSelectorProps = {
  value: "1",
  onValueChange: vi.fn(),
  min: 0,
  max: 10,
  step: 0.1,
}

describe("DoseSelector", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callback(0)
      return 1
    })
  })

  it("shows equal-size dose pages of five and navigates overflow", () => {
    render(<DoseSelector {...baseProps} quickValues={[1, 2, 3, 4, 5, 6, 7]} />)

    expect(screen.getByRole("button", { name: "5" })).toBeTruthy()
    expect(screen.queryByRole("button", { name: "6" })).toBeNull()

    fireEvent.click(screen.getByRole("button", { name: "Next quick doses page" }))

    expect(screen.getByRole("button", { name: "6" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "7" })).toBeTruthy()
    expect(screen.queryByRole("button", { name: "5" })).toBeNull()
  })

  it("keeps Other pinned while concentration presets page by four", () => {
    render(
      <DoseSelector
        {...baseProps}
        concentrationOptions={["0.1%", "0.2%", "0.25%", "0.5%", "1%"]}
        onConcentrationChange={vi.fn()}
        onCustomConcentrationChange={vi.fn()}
      />,
    )

    expect(screen.getByRole("button", { name: "Other" })).toBeTruthy()
    expect(screen.queryByRole("button", { name: "1%" })).toBeNull()

    fireEvent.click(screen.getByRole("button", { name: "Next concentration presets page" }))

    expect(screen.getByRole("button", { name: "1%" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "Other" })).toBeTruthy()
  })

  it("exposes canonical formulation pills independently from concentration", () => {
    const onFormulationChange = vi.fn()
    render(
      <DoseSelector
        {...baseProps}
        formulationOptions={["HYPOBARIC", "ISOBARIC", "HYPERBARIC"]}
        formulation="HYPERBARIC"
        onFormulationChange={onFormulationChange}
      />,
    )

    expect(screen.getByRole("button", { name: "Hyperbaric" }).getAttribute("aria-pressed")).toBe("true")
    fireEvent.click(screen.getByRole("button", { name: "Isobaric" }))
    expect(onFormulationChange).toHaveBeenCalledWith("ISOBARIC")
  })

  it("uses the configured canonical unit for a custom concentration", () => {
    const onConcentrationChange = vi.fn()
    render(
      <DoseSelector
        {...baseProps}
        concentrationOptions={["1mg/mL"]}
        concentrationUnit="MG_PER_ML"
        onConcentrationChange={onConcentrationChange}
        onCustomConcentrationChange={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole("button", { name: "Other" }))
    fireEvent.change(screen.getByRole("spinbutton", { name: "Custom concentration mg/mL" }), {
      target: { value: "2.5" },
    })

    expect(onConcentrationChange).toHaveBeenLastCalledWith("2.5mg/mL")
  })

  it("keeps manual numeric entry independent from the slider maximum", () => {
    const onValueChange = vi.fn()
    render(
      <DoseSelector
        {...baseProps}
        value="200"
        onValueChange={onValueChange}
        min={1}
        max={200}
        step={1}
        valuePlaceholder="Rate"
      />,
    )

    const slider = screen.getByRole("slider")
    expect(slider.getAttribute("min")).toBe("1")
    expect(slider.getAttribute("max")).toBe("200")
    fireEvent.change(screen.getByRole("spinbutton"), { target: { value: "350" } })
    expect(onValueChange).toHaveBeenLastCalledWith("350")
  })

  it("keeps a calculated prefill but hides recommendation UI when guidance is off", () => {
    render(
      <DoseSelector
        {...baseProps}
        value="140"
        hint="1–2 mg/kg from source"
        extraHint="Suggested by the configured rule"
        quickValues={[70, 140, 210]}
        showGuidance={false}
      />,
    )

    expect(screen.getByRole("spinbutton")).toHaveProperty("value", "140")
    expect(screen.queryByText(/1–2 mg\/kg/)).toBeNull()
    expect(screen.queryByText(/Suggested by/)).toBeNull()
    expect(screen.queryByRole("button", { name: "140" })).toBeNull()
    expect(screen.queryByRole("slider")).toBeNull()
  })

  it("realigns pages and custom mode when the route surface changes atomically", () => {
    const { rerender } = render(
      <DoseSelector
        {...baseProps}
        route="INTRATHECAL"
        quickValues={[1, 2, 3, 4, 5, 6]}
        concentrationOptions={["0.25%", "0.5%"]}
        concentration="0.5%"
        onConcentrationChange={vi.fn()}
        onCustomConcentrationChange={vi.fn()}
      />,
    )
    fireEvent.click(screen.getByRole("button", { name: "Next quick doses page" }))
    fireEvent.click(screen.getByRole("button", { name: "Other" }))

    rerender(
      <DoseSelector
        {...baseProps}
        value="6"
        route="IV"
        quickValues={[1, 2, 3, 4, 5, 6, 7]}
        concentrationOptions={["1mg/mL", "2mg/mL"]}
        concentration="1mg/mL"
        concentrationUnit="MG_PER_ML"
        onConcentrationChange={vi.fn()}
        onCustomConcentrationChange={vi.fn()}
      />,
    )

    expect(screen.getByRole("button", { name: "6" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "1mg/mL" }).getAttribute("aria-pressed")).toBe("true")
    expect(screen.getByRole("button", { name: "Other" }).getAttribute("aria-pressed")).toBe("false")
    expect(screen.queryByRole("spinbutton", { name: /Custom concentration/ })).toBeNull()
  })
})
