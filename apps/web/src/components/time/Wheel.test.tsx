// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"
import { Wheel } from "./Wheel"

describe("the wheel with a mouse", () => {
  const values = [1, 2, 3, 4, 5]
  it("steps one value for a notch of the mouse wheel, down and up, and loops", () => {
    const onChange = vi.fn()
    const { rerender } = render(<Wheel values={values} value={5} onChange={onChange} label="Day" testId="wheel" />)
    const wheel = screen.getByTestId("wheel")
    fireEvent.wheel(wheel, { deltaY: 100 })
    expect(onChange).toHaveBeenLastCalledWith(1)
    rerender(<Wheel values={values} value={1} onChange={onChange} label="Day" testId="wheel" />)
    fireEvent.wheel(wheel, { deltaY: -100 })
    expect(onChange).toHaveBeenLastCalledWith(5)
  })
  it("goes on from the last step when several notches come before the screen has redrawn", () => {
    const onChange = vi.fn()
    render(<Wheel values={values} value={2} onChange={onChange} label="Day" testId="wheel" />)
    const wheel = screen.getByTestId("wheel")
    fireEvent.wheel(wheel, { deltaY: 100 })
    fireEvent.wheel(wheel, { deltaY: 100 })
    expect(onChange.mock.calls.map(call => call[0])).toEqual([3, 4])
  })
  it("ignores a tiny trackpad movement until it adds up to a notch", () => {
    const onChange = vi.fn()
    render(<Wheel values={values} value={2} onChange={onChange} label="Day" testId="wheel" />)
    const wheel = screen.getByTestId("wheel")
    fireEvent.wheel(wheel, { deltaY: 10 })
    expect(onChange).not.toHaveBeenCalled()
    fireEvent.wheel(wheel, { deltaY: 40 })
    expect(onChange).toHaveBeenCalledWith(3)
  })
})
