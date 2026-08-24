import { describe, expect, it } from "vitest"
import {
  LegalDocumentConfigurationError,
  requiredLegalDocuments,
  validateLegalAcceptances,
  type LegalDocumentManifest,
} from "./legal"

const manifest: LegalDocumentManifest = {
  deployment: "public-demo",
  documents: [
    { deployment: "public-demo", kind: "TERMS", version: "5", effectiveDate: "2026-09-01", locale: "bg", contentSha256: "bg-terms", content: "Условия" },
    { deployment: "public-demo", kind: "PRIVACY", version: "3", effectiveDate: "2026-09-01", locale: "bg", contentSha256: "bg-privacy", content: "Поверителност" },
    { deployment: "public-demo", kind: "TERMS", version: "5", effectiveDate: "2026-09-01", locale: "en", contentSha256: "en-terms", content: "Terms" },
    { deployment: "public-demo", kind: "PRIVACY", version: "3", effectiveDate: "2026-09-01", locale: "en", contentSha256: "en-privacy", content: "Privacy" },
  ],
}

describe("legal document contracts", () => {
  it("returns both exact documents for the requested locale", () => {
    expect(requiredLegalDocuments(manifest, "bg").map(document => document.kind))
      .toEqual(["TERMS", "PRIVACY"])
  })

  it("never silently falls back to another locale", () => {
    const incomplete = {
      ...manifest,
      documents: manifest.documents.filter(document => document.locale === "en"),
    }
    expect(() => requiredLegalDocuments(incomplete, "bg")).toThrowError(
      expect.objectContaining<Partial<LegalDocumentConfigurationError>>({ code: "LEGAL_DOCUMENT_MISSING" }),
    )
  })

  it("rejects a document from a different deployment", () => {
    const mismatched = {
      ...manifest,
      documents: manifest.documents.map(document => document.kind === "TERMS" && document.locale === "bg"
        ? { ...document, deployment: "hospital-other" }
        : document),
    }
    expect(() => requiredLegalDocuments(mismatched, "bg")).toThrowError(
      expect.objectContaining<Partial<LegalDocumentConfigurationError>>({ code: "LEGAL_DEPLOYMENT_MISMATCH" }),
    )
  })

  it("requires exact metadata and rejects substituted hashes or extras", () => {
    const documents = requiredLegalDocuments(manifest, "en")
    const exact = documents.map(({ content: _content, ...reference }) => reference)
    expect(validateLegalAcceptances(documents, exact)).toEqual({ ok: true })
    expect(validateLegalAcceptances(documents, [
      { ...exact[0], contentSha256: "substituted" },
      exact[1],
    ])).toEqual({ ok: false, missingKinds: ["TERMS"], unexpected: 1 })
  })
})
