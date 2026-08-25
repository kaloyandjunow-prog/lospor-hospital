import { describe, expect, it, vi } from "vitest"
import {
  loadRegistrationLegalDocuments,
  parseRegistrationLegalDocuments,
} from "./legal-documents"

const hash = (digit: string) => digit.repeat(64)

function manifest(locale: "bg" | "en") {
  return {
    locale,
    documents: [
      {
        deployment: "CLOUD_DEMO",
        kind: "TERMS",
        version: "1.2.0",
        effectiveDate: "2026-08-22",
        locale,
        contentSha256: hash("a"),
        content: "Displayed terms",
      },
      {
        deployment: "CLOUD_DEMO",
        kind: "PRIVACY",
        version: "1.2.0",
        effectiveDate: "2026-08-22",
        locale,
        contentSha256: hash("b"),
        content: "Displayed privacy notice",
      },
    ],
  }
}

describe("registration legal-document contract", () => {
  it("accepts both exact active documents and strips their content", () => {
    expect(parseRegistrationLegalDocuments(manifest("bg"), "bg")).toEqual([
      expect.objectContaining({ kind: "TERMS", locale: "bg", contentSha256: hash("a") }),
      expect.objectContaining({ kind: "PRIVACY", locale: "bg", contentSha256: hash("b") }),
    ])
    expect(parseRegistrationLegalDocuments(manifest("bg"), "bg")?.[0]).not.toHaveProperty("content")
  })

  it.each([
    { ...manifest("bg"), locale: "en" },
    { locale: "bg", documents: [manifest("bg").documents[0]] },
    { locale: "bg", documents: manifest("bg").documents.map(item => ({ ...item, kind: "TERMS" })) },
    { locale: "bg", documents: manifest("bg").documents.map(item => ({ ...item, contentSha256: "bad" })) },
    { locale: "bg", documents: manifest("bg").documents.map(item => ({ ...item, deployment: "UNKNOWN" })) },
  ])("rejects incomplete, mismatched, or unauthenticated manifests", invalid => {
    expect(parseRegistrationLegalDocuments(invalid, "bg")).toBeNull()
  })

  it("loads the Bulgarian manifest from the public API", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => manifest("bg"),
    } as Response))
    await expect(loadRegistrationLegalDocuments("bg", fetchImpl)).resolves.toHaveLength(2)
    expect(fetchImpl).toHaveBeenCalledWith(
      expect.stringContaining("/v1/legal/documents?locale=bg"),
      expect.objectContaining({ headers: { Accept: "application/json" } }),
    )
  })
})
