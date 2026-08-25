import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { LocaleProvider } from "./locale-provider"
import { LegalDocument } from "./legal-document"

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

function renderTerms() {
  return render(
    <LocaleProvider initialLocale="bg" authenticated={false}>
      <LegalDocument kind="TERMS" />
    </LocaleProvider>,
  )
}

describe("LegalDocument", () => {
  it("renders the exact active Bulgarian document and its evidence", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      documents: [{
        deployment: "LOCAL_HOSPITAL",
        kind: "TERMS",
        version: "1.2.0",
        effectiveDate: "2026-08-22",
        locale: "bg",
        content: JSON.stringify({
          title: "Условия за ползване",
          sections: [{ title: "Обхват", paragraphs: ["Точен текст."] }],
        }),
        contentSha256: "a".repeat(64),
      }],
    }), { status: 200 })))
    renderTerms()
    expect(await screen.findByRole("heading", { name: "Условия за ползване", level: 1 })).toBeTruthy()
    expect(screen.getByText("Точен текст.")).toBeTruthy()
    expect(screen.getByText("LOCAL_HOSPITAL")).toBeTruthy()
    expect(screen.getByText("a".repeat(64))).toBeTruthy()
  })

  it("fails closed when content is missing or not the reviewed document shape", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      documents: [{
        deployment: "LOCAL_HOSPITAL",
        kind: "TERMS",
        version: "1.2.0",
        effectiveDate: "2026-08-22",
        locale: "bg",
        content: "not reviewed JSON",
        contentSha256: "b".repeat(64),
      }],
    }), { status: 200 })))
    renderTerms()
    expect(await screen.findByRole("alert")).toBeTruthy()
    expect(screen.queryByText("not reviewed JSON")).toBeNull()
  })
})
