// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll } from "vitest"
import { render, fireEvent, screen } from "@testing-library/react"
import { NumberStepper } from "./NumberStepper"

beforeAll(() => {
  // jsdom doesn't implement Pointer Capture, which the +/- buttons call.
  const proto = HTMLElement.prototype as unknown as Record<string, unknown>
  if (!proto.setPointerCapture) proto.setPointerCapture = () => {}
  if (!proto.releasePointerCapture) proto.releasePointerCapture = () => {}
})

describe("NumberStepper", () => {
  it("clamps typed values to the max", () => {
    const onChange = vi.fn()
    render(<NumberStepper value={50} onChange={onChange} min={0} max={100} />)
    fireEvent.change(screen.getByRole("spinbutton"), { target: { value: "120" } })
    expect(onChange).toHaveBeenLastCalledWith(100)
  })

  it("reports undefined when cleared", () => {
    const onChange = vi.fn()
    render(<NumberStepper value={50} onChange={onChange} min={0} max={100} />)
    fireEvent.change(screen.getByRole("spinbutton"), { target: { value: "" } })
    expect(onChange).toHaveBeenLastCalledWith(undefined)
  })

  it("steps up and down by the step within range", () => {
    const onChange = vi.fn()
    render(<NumberStepper value={50} onChange={onChange} min={0} max={100} step={5} />)
    const [minus, plus] = screen.getAllByRole("button")
    fireEvent.pointerDown(plus); fireEvent.pointerUp(plus)
    expect(onChange).toHaveBeenLastCalledWith(55)
    fireEvent.pointerDown(minus); fireEvent.pointerUp(minus)
    expect(onChange).toHaveBeenLastCalledWith(45)
  })
})
