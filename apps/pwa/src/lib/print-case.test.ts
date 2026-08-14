import { beforeEach, describe, expect, it, vi } from "vitest"

const { apiJson, openURL } = vi.hoisted(() => ({
  apiJson: vi.fn(),
  openURL: vi.fn(),
}))

vi.mock("@/lib/api", () => ({ apiJson }))
vi.mock("expo-linking", () => ({ openURL }))

import { openPrintCase } from "./print-case"

describe("openPrintCase", () => {
  beforeEach(() => {
    apiJson.mockReset()
    openURL.mockReset()
    openURL.mockResolvedValue(undefined)
  })

  it("requests a scoped HTML print link and opens it in the device browser", async () => {
    apiJson.mockResolvedValue({
      format: "html",
      action: "print",
      url: "https://hospital.example/cases/case-1/print?print_token=signed&lang=bg",
    })

    await expect(openPrintCase("case-1", "bg")).resolves.toBe(true)
    expect(apiJson).toHaveBeenCalledWith("/api/cases/case-1/print-token", {
      method: "POST",
      body: JSON.stringify({ lang: "bg" }),
    })
    expect(openURL).toHaveBeenCalledWith(
      "https://hospital.example/cases/case-1/print?print_token=signed&lang=bg",
    )
  })

  it("refuses a legacy PDF response instead of silently treating it as HTML", async () => {
    apiJson.mockResolvedValue({
      format: "pdf",
      action: "download",
      url: "https://hospital.example/api/cases/case-1/pdf",
    })

    await expect(openPrintCase("case-1", "en")).resolves.toBe(false)
    expect(openURL).not.toHaveBeenCalled()
  })

  it("does not open a non-HTTP URL returned by the server", async () => {
    apiJson.mockResolvedValue({ format: "html", action: "print", url: "file:///case.html" })

    await expect(openPrintCase("case-1", "en")).resolves.toBe(false)
    expect(openURL).not.toHaveBeenCalled()
  })
})
