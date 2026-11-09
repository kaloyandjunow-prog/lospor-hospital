// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }))

import { TourniquetPicker } from "./TourniquetPicker"

const running = { site: "RIGHT_THIGH", onEventId: "t1", since: "2026-11-02T08:00:00.000Z", minutes: 95, running: true }

describe("the tourniquet body picker on the web (10.2.0)", () => {
  it("Tourniquet on saves the limb tapped, and a limb already on cannot be chosen again", () => {
    const onSave = vi.fn()
    render(<TourniquetPicker band="adultMale" mode="on" statuses={[running]} warnAtMinutes={90} timeOf={iso => iso.slice(11, 16)} locale="en" onSave={onSave} onCancel={vi.fn()} />)
    expect((screen.getByTestId("tourniquet-spot-RIGHT_THIGH") as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByTestId("tourniquet-save") as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(screen.getByTestId("tourniquet-spot-LEFT_UPPER_ARM"))
    fireEvent.click(screen.getByTestId("tourniquet-save"))
    expect(onSave).toHaveBeenCalledWith("LEFT_UPPER_ARM")
  })

  it("Tourniquet off offers only the cuffs that are on, with their time", () => {
    const onSave = vi.fn()
    render(<TourniquetPicker band="child" mode="off" statuses={[running]} warnAtMinutes={60} timeOf={iso => iso.slice(11, 16)} locale="en" onSave={onSave} onCancel={vi.fn()} />)
    expect((screen.getByTestId("tourniquet-spot-LEFT_THIGH") as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByTestId("tourniquet-picker").textContent).toContain("Right thigh")
    fireEvent.click(screen.getByTestId("tourniquet-spot-RIGHT_THIGH"))
    fireEvent.click(screen.getByTestId("tourniquet-save"))
    expect(onSave).toHaveBeenCalledWith("RIGHT_THIGH")
  })
})
