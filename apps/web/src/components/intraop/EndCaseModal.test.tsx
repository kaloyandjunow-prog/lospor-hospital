// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { EndCaseModal, type EndCaseModalProps } from "./EndCaseModal"

vi.mock("next-intl", () => ({ useLocale: () => "en" }))

function rateFluid(id: string, rate: number): EndCaseModalProps["fluids"][number] {
  return {
    id,
    name: "Plasma-Lyte",
    category: "Crystalloids",
    color: "#06b6d4",
    startCol: 0,
    endCol: 12,
    volume: "0",
    fluidEntryMode: "RATE",
    rate,
    unit: "mL/h",
    startTs: "2026-08-02T08:00:00.000Z",
  }
}

describe("EndCaseModal fluid completion", () => {
  it("allows pump-volume overrides and stamps all stopped fluids with one end time", () => {
    const onConfirm = vi.fn<EndCaseModalProps["onConfirm"]>()
    render(
      <EndCaseModal
        agents={[]}
        infusions={[]}
        fluids={[rateFluid("fluid-1", 60), rateFluid("fluid-2", 120)]}
        weightBasis={{}}
        onDismiss={vi.fn()}
        onConfirm={onConfirm}
      />,
    )

    fireEvent.click(screen.getAllByRole("button", { name: "Discontinue" })[0])
    fireEvent.click(screen.getAllByRole("button", { name: "Continue postop" })[1])
    fireEvent.change(screen.getAllByRole("spinbutton", { name: "Actual delivered volume for Plasma-Lyte" })[0], {
      target: { value: "123" },
    })
    fireEvent.click(screen.getByRole("button", { name: "Confirm End Case" }))

    const result = onConfirm.mock.calls[0]?.[0]
    expect(result?.finalizedFluidWithAmounts).toHaveLength(2)
    expect(result?.finalizedFluidWithAmounts[0]?.amount).toBe(123)
    expect(result?.finalizedFluidWithAmounts[0]?.endTs)
      .toBe(result?.finalizedFluidWithAmounts[1]?.endTs)
    expect(result?.continuedItems).toEqual(["Plasma-Lyte (fluid at 120 mL/h)"])
  })

  it("requires an explicit full or partial bag choice before ending the case", () => {
    const onConfirm = vi.fn<EndCaseModalProps["onConfirm"]>()
    render(
      <EndCaseModal
        agents={[]}
        infusions={[]}
        fluids={[{
          id: "bag-1",
          name: "Saline",
          category: "Crystalloids",
          color: "#06b6d4",
          startCol: 0,
          endCol: 1,
          volume: "500",
          fluidEntryMode: "VOLUME",
          bagVolumeMl: 500,
        }]}
        weightBasis={{}}
        onDismiss={vi.fn()}
        onConfirm={onConfirm}
      />,
    )

    fireEvent.click(screen.getByRole("button", { name: "Discontinue" }))
    const confirm = screen.getByRole("button", { name: "Confirm End Case" }) as HTMLButtonElement
    expect(confirm.disabled).toBe(true)
    fireEvent.click(confirm)
    expect(onConfirm).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole("button", { name: /partial/i }))
    expect(confirm.disabled).toBe(false)
    fireEvent.click(confirm)

    expect(onConfirm.mock.calls[0]?.[0].finalizedFluidWithAmounts[0]?.amount).toBe(0)
  })
})
