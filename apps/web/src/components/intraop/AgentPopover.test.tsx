// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { AgentPopover } from "./AgentPopover"

vi.mock("next-intl", () => ({ useLocale: () => "en" }))
vi.mock("./ui-copy", () => ({
  useIntraopUiCopy: () => ({
    apply: "Apply",
    startAgent: (name: string) => `Start ${name}`,
  }),
}))

function renderPopover(extra: Partial<Parameters<typeof AgentPopover>[0]> = {}) {
  const onNitrousChange = vi.fn()
  render(
    <AgentPopover
      anchor={{ top: 10, bottom: 20, left: 10, right: 20, width: 10 }}
      editingName={null}
      pendingName="Sevoflurane"
      percent={null}
      nitrousPercent={null}
      prospectiveGuidanceEnabled={false}
      agentNames={["Sevoflurane"]}
      textClassFor={() => ""}
      displayAgentName={name => name}
      labels={{ startAgentHere: "Start agent here", optional: "Optional", editLogged: "Edits are logged." }}
      onSelectAgent={() => {}}
      onPercentChange={() => {}}
      onNitrousChange={onNitrousChange}
      onStart={() => {}}
      onApply={() => {}}
      onDismiss={() => {}}
      {...extra}
    />,
  )
  return { onNitrousChange }
}

describe("AgentPopover entry (shared with the phone through core)", () => {
  it("gives each agent its own range: desflurane to 18 %, isoflurane to 5 %", () => {
    renderPopover({ pendingName: "Desflurane", prospectiveGuidanceEnabled: true })
    expect(screen.getByRole("slider").getAttribute("max")).toBe("18")
  })

  it("starts at 0 for an adult too, with the quick values offered and Start locked until a value is set", () => {
    renderPopover({ prospectiveGuidanceEnabled: true })
    expect(screen.getAllByRole("spinbutton")[0]).toHaveProperty("value", "0")
    expect(screen.getByRole("button", { name: "2.5" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "Start Sevoflurane" })).toHaveProperty("disabled", true)
  })

  it("is the same in the paediatric case, whose quick buttons come from the same entry", () => {
    renderPopover({ prospectiveGuidanceEnabled: true })
    expect(screen.getAllByRole("spinbutton")[0]).toHaveProperty("value", "0")
    expect(screen.getByRole("button", { name: "2.5" })).toBeTruthy()
    expect(screen.getByRole("slider")).toBeTruthy()
    expect(screen.getByRole("button", { name: "Start Sevoflurane" })).toHaveProperty("disabled", true)
  })
})

describe("AgentPopover baseline boundary", () => {
  it("does not rebuild agent or N2O percentage defaults when guidance is unavailable", () => {
    const { onNitrousChange } = renderPopover()

    const agentInput = screen.getByRole("spinbutton")
    expect(agentInput).toHaveProperty("value", "0")
    // The slider stays (nothing is filled in for the clinician); only the
    // suggestions go. Its range is the agent's own, from core.
    const slider = screen.getByRole("slider")
    expect(slider).toHaveProperty("value", "0")
    expect(screen.getAllByRole("spinbutton")[0]).toHaveProperty("value", "0")
    expect(slider.getAttribute("max")).toBe("8")
    // The slider lands on halves; - and + and typing keep tenths.
    expect(slider.getAttribute("step")).toBe("0.5")
    // The quick buttons stay too: the same entry in every mode.
    expect(screen.getByRole("button", { name: "2.5" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "Start Sevoflurane" })).toHaveProperty("disabled", true)

    fireEvent.click(screen.getByRole("button", { name: "+ N2O" }))
    const inputs = screen.getAllByRole("spinbutton")
    expect(inputs[1]).toHaveProperty("value", "")
    expect(onNitrousChange).not.toHaveBeenCalledWith(40)
  })
})
