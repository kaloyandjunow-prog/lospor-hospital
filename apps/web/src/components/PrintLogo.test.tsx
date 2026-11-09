// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { PrintLogo, hospitalLogoOf } from "./PrintLogo"

const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="

afterEach(cleanup)

describe("the hospital logo on paper (1.8.0)", () => {
  it("is drawn from a PNG or JPEG data URL, for print only", () => {
    render(<PrintLogo institution={{ name: "H", logoDataUrl: PNG }} />)
    expect(screen.getByTestId("print-logo").getAttribute("src")).toBe(PNG)
    expect(document.querySelector("style")?.textContent).toContain("@media print")
    expect(document.querySelector("style")?.textContent).toContain("position:fixed")
  })

  it("prints nothing without a logo, or with anything that is not a PNG or JPEG data URL", () => {
    for (const institution of [null, {}, { logoDataUrl: null }, { logoDataUrl: "https://example.org/x.png" }, { logoDataUrl: "data:image/svg+xml;base64,PHN2Zy8+" }, { logoDataUrl: "javascript:alert(1)" }]) {
      const { container, unmount } = render(<PrintLogo institution={institution} />)
      expect(container.querySelector("img")).toBeNull()
      expect(hospitalLogoOf(institution)).toBeNull()
      unmount()
    }
  })
})
