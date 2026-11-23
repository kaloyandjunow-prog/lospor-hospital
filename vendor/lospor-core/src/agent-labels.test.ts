import { describe, expect, it } from "vitest"
import { inhalationalFiLabel } from "./agent-labels"

describe("inhalational agent label", () => {
  it("uses the monitor's short names", () => {
    expect(inhalationalFiLabel("Sevoflurane")).toBe("FiSev%")
    expect(inhalationalFiLabel("Desflurane")).toBe("FiDes%")
    expect(inhalationalFiLabel("Isoflurane")).toBe("FiIso%")
    expect(inhalationalFiLabel("sevo")).toBe("FiSev%")
  })

  it("keeps an unknown agent's own name", () => {
    expect(inhalationalFiLabel("Xenon")).toBe("FiXenon%")
  })
})
