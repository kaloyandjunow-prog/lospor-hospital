import { beforeEach, describe, expect, it, vi } from "vitest"
import { apiFetch } from "./api"
import {
  loadDeploymentSupport,
  parseDeploymentSupport,
  supportContactUrlWithReport,
} from "./deployment-support"

vi.mock("./api", () => ({ apiFetch: vi.fn() }))
const mockedApiFetch = vi.mocked(apiFetch)

beforeEach(() => {
  mockedApiFetch.mockReset()
})

describe("deployment support", () => {
  it.each([
    ["https://help.hospital.example/tickets", "https://help.hospital.example/tickets"],
    ["mailto:support@hospital.example", "mailto:support@hospital.example"],
  ])("accepts a safe configured destination", (contactUrl, expected) => {
    expect(parseDeploymentSupport({ support: { configured: true, contactUrl } }))
      .toEqual({ configured: true, contactUrl: expected })
  })

  it.each([
    null,
    {},
    { support: { configured: false, contactUrl: "https://help.example" } },
    { support: { configured: true, contactUrl: "http://help.example" } },
    { support: { configured: true, contactUrl: "javascript:alert(1)" } },
    { support: { configured: true, contactUrl: "https://user:secret@help.example" } },
    { support: { configured: true, contactUrl: "mailto:support@hospital.example#hidden" } },
    { support: { configured: true, contactUrl: "mailto:support@hospital.example%23hidden" } },
    { support: { configured: true, contactUrl: "mailto:.support@hospital.example" } },
    { support: { configured: true, contactUrl: "mailto:support@-hospital.example" } },
  ])("fails closed for missing or unsafe configuration", value => {
    expect(parseDeploymentSupport(value)).toEqual({ configured: false, contactUrl: null })
  })

  it("returns no destination when the capability request fails", async () => {
    mockedApiFetch.mockRejectedValue(new Error("offline"))
    await expect(loadDeploymentSupport()).resolves.toEqual({ configured: false, contactUrl: null })
  })

  it("adds a diagnostic report only to a deliberate mail action", () => {
    const url = supportContactUrlWithReport(
      "mailto:support@hospital.example",
      "safe diagnostic\nqueued: 2",
      "LOSPOR problem",
    )
    expect(url).toContain("subject=LOSPOR%20problem")
    expect(url).toContain("body=safe%20diagnostic%0Aqueued%3A%202")
    expect(supportContactUrlWithReport("https://help.example/ticket", "ignored", "ignored"))
      .toBe("https://help.example/ticket")
  })
})
