import { describe, expect, it } from "vitest"
import { accountLinkQrSvg } from "./account-qr.js"

describe("one-time account QR", () => {
  it("renders the complete fragment URL locally as a print-safe SVG", async () => {
    const url = `https://clinical.hospital.test/reset-password#hospitalToken=${"A".repeat(43)}`
    const svg = await accountLinkQrSvg(url)
    expect(svg).toMatch(/^<svg/)
    expect(svg).toContain("<path")
    expect(svg).not.toContain("<script")
    expect(svg).not.toContain(url)
  })

  it("refuses unbounded input", async () => {
    await expect(accountLinkQrSvg("short")).resolves.toBeNull()
    await expect(accountLinkQrSvg("x".repeat(4097))).resolves.toBeNull()
  })
})
