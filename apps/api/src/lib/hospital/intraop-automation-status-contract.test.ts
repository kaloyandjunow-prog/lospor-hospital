import { expect, it, vi } from "vitest"
import { parseIntraopAutomation } from "@lospor/core/intraop-automation"
vi.mock("server-only", () => ({}))
vi.mock("@/lib/intraop-automation", () => ({
  readIntraopAutomation: async () => parseIntraopAutomation(undefined),
  suggestionAcceptance: async () => ({ days: 90, cases: 3, byId: { "card:Anaphylaxis": { accepted: 2, dismissed: 1 } } }),
  successionOverviewForStatus: async () => [],
}))
it("sends Status a view that passes the shape check Status applies to it", async () => {
  const { intraopAutomationControlView } = await import("./intraop-automation-control")
  const { intraopAutomationShape } = await import("../../../../status/src/control-plane.js")
  const view = await intraopAutomationControlView({} as never)
  expect(intraopAutomationShape(JSON.parse(JSON.stringify(view)))).toBe(true)
})
