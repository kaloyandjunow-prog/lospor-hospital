// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react"
import { NextIntlClientProvider } from "next-intl"
import { describe, expect, it, vi } from "vitest"

import enMessages from "../../../messages/en.json"
import { VitalsPopover } from "./VitalsPopover"

function renderPopover(overrides: Partial<React.ComponentProps<typeof VitalsPopover>> = {}) {
  const props: React.ComponentProps<typeof VitalsPopover> = {
    anchor: { top: 0, bottom: 10, left: 0, right: 10, width: 10 },
    label: "BIS",
    unit: "",
    color: "#fff",
    vitalKey: "bis",
    converts: null,
    value: 50,
    fallbackValue: 50,
    min: 0,
    max: 100,
    step: 1,
    onChange: vi.fn(),
    onCommit: vi.fn(),
    ...overrides,
  }
  render(
    <NextIntlClientProvider locale="en" messages={enMessages}>
      <VitalsPopover {...props} />
    </NextIntlClientProvider>,
  )
  return props
}

describe("VitalsPopover validation", () => {
  it("opens on the hard-invalid grid draft instead of the prior stored value", () => {
    renderPopover({ value: 50, inputDraft: "101" })

    expect((screen.getByRole("spinbutton") as HTMLInputElement).value).toBe("101")
    expect(screen.getByRole("alert").textContent).toBe("BIS must be a whole number from 0 to 100.")
    expect((screen.getByRole("button", { name: "Done" }) as HTMLButtonElement).disabled).toBe(true)
  })

  it("shows an invalid BIS value without committing it", () => {
    const props = renderPopover()
    fireEvent.change(screen.getByRole("spinbutton"), { target: { value: "101" } })

    expect(screen.getByRole("alert").textContent).toBe("BIS must be a whole number from 0 to 100.")
    expect((screen.getByRole("button", { name: "Done" }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(screen.getByRole("button", { name: "Done" }))
    expect(props.onCommit).not.toHaveBeenCalled()
  })

  it("keeps a warning-range pressure committable", () => {
    const props = renderPopover({
      label: "BP Sys",
      vitalKey: "systolic",
      value: 300,
      fallbackValue: 120,
      max: 300,
    })
    fireEvent.change(screen.getByRole("spinbutton"), { target: { value: "301" } })

    expect(screen.getByText("Unusually high systolic pressure (>300 mmHg). Verify the reading.")).toBeTruthy()
    expect((screen.getByRole("button", { name: "Done" }) as HTMLButtonElement).disabled).toBe(false)
    fireEvent.click(screen.getByRole("button", { name: "Done" }))
    expect(props.onCommit).toHaveBeenCalledOnce()
  })
})
