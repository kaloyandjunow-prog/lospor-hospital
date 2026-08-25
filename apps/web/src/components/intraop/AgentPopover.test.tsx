// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { AgentPopover } from "./AgentPopover"

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
      quickPercentsFor={() => [0.5, 1, 2]}
      textClassFor={() => ""}
      displayAgentName={name => name}
      labels={{ startAgentHere: "Start agent here", optional: "Optional" }}
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

describe("AgentPopover baseline boundary", () => {
  it("does not rebuild agent or N2O percentage defaults when guidance is unavailable", () => {
    const { onNitrousChange } = renderPopover()

    const agentInput = screen.getByRole("spinbutton")
    expect(agentInput).toHaveProperty("value", "")
    expect(screen.queryByRole("slider")).toBeNull()
    expect(screen.getByRole("button", { name: "Start Sevoflurane" })).toHaveProperty("disabled", true)

    fireEvent.click(screen.getByRole("button", { name: "+ N2O" }))
    const inputs = screen.getAllByRole("spinbutton")
    expect(inputs[1]).toHaveProperty("value", "")
    expect(onNitrousChange).not.toHaveBeenCalledWith(40)
  })
})
