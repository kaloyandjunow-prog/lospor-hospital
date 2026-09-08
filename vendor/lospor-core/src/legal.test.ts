import { describe, expect, it } from "vitest"
import {
  CLOUD_DEMO_LEGAL_DOCUMENTS,
  LegalDocumentConfigurationError,
  parseLegalAcceptanceManifest,
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

/**
 * The one parser both clients now share. Web previously ran this exact
 * fingerprint check on its own bundled table and mobile ran only the
 * well-formedness half -- so a tampered or stale cloud-demo manifest would
 * have been accepted on the phone and refused on the web, for the deployment
 * whose text is supposed to be identical everywhere.
 */
describe("reading a legal manifest as a client would", () => {
  function cloudDemoManifest(locale: "bg" | "en") {
    return {
      locale,
      documents: CLOUD_DEMO_LEGAL_DOCUMENTS
        .filter(document => document.locale === locale)
        .map(document => ({ ...document, content: "served by the API" })),
    }
  }

  it("accepts the cloud demo manifest exactly as bundled", () => {
    const expected = CLOUD_DEMO_LEGAL_DOCUMENTS.filter(document => document.locale === "bg")
    expect(parseLegalAcceptanceManifest(cloudDemoManifest("bg"), "bg")).toEqual(expected)
  })

  /**
   * This is the check mobile lacked. A cloud-demo document that is otherwise
   * well-formed but does not match the bundled hash is not a formatting
   * problem -- it means the server is not serving the reviewed text, and
   * registration must stop rather than bind someone to text nobody has read.
   */
  it("refuses a cloud-demo document whose hash does not match the bundled copy", () => {
    const tampered = cloudDemoManifest("bg")
    tampered.documents = tampered.documents.map(document => document.kind === "TERMS"
      ? { ...document, contentSha256: "0".repeat(64) }
      : document)
    expect(parseLegalAcceptanceManifest(tampered, "bg")).toBeNull()
  })

  it("refuses a cloud-demo document with a stale version or date", () => {
    const stale = cloudDemoManifest("en")
    stale.documents = stale.documents.map(document => document.kind === "PRIVACY"
      ? { ...document, effectiveDate: "2020-01-01" }
      : document)
    expect(parseLegalAcceptanceManifest(stale, "en")).toBeNull()
  })

  /**
   * A hospital's text is set by its own operator and cannot be known in
   * advance by any client, so this is the most that can be verified: exactly
   * one TERMS and one PRIVACY, in the right locale, from the same deployment,
   * each carrying a plausible version, date and hash.
   */
  it("accepts a well-formed hospital manifest without a known fingerprint", () => {
    const hospital = {
      locale: "bg" as const,
      documents: [
        {
          deployment: "LOCAL_HOSPITAL", kind: "TERMS", version: "1.0", locale: "bg",
          effectiveDate: "2026-08-22", contentSha256: "a".repeat(64), content: "Условия",
        },
        {
          deployment: "LOCAL_HOSPITAL", kind: "PRIVACY", version: "1.0", locale: "bg",
          effectiveDate: "2026-08-22", contentSha256: "b".repeat(64), content: "Поверителност",
        },
      ],
    }
    expect(parseLegalAcceptanceManifest(hospital, "bg")).toEqual([
      expect.objectContaining({ kind: "TERMS", deployment: "LOCAL_HOSPITAL", contentSha256: "a".repeat(64) }),
      expect.objectContaining({ kind: "PRIVACY", deployment: "LOCAL_HOSPITAL", contentSha256: "b".repeat(64) }),
    ])
  })

  it.each([
    ["the wrong locale", { locale: "en", documents: cloudDemoManifest("bg").documents }],
    ["one document short", { locale: "bg", documents: [cloudDemoManifest("bg").documents[0]] }],
    ["two documents of the same kind", {
      locale: "bg",
      documents: cloudDemoManifest("bg").documents.map(document => ({ ...document, kind: "TERMS" })),
    }],
    ["an unrecognised deployment id", {
      locale: "bg",
      documents: cloudDemoManifest("bg").documents.map(document => ({ ...document, deployment: "SOMETHING_ELSE" })),
    }],
    ["a hash that is not 64 hex characters", {
      locale: "bg",
      documents: cloudDemoManifest("bg").documents.map(document => ({ ...document, contentSha256: "not-a-hash" })),
    }],
    ["an impossible calendar date", {
      locale: "bg",
      documents: cloudDemoManifest("bg").documents.map(document => ({ ...document, effectiveDate: "2026-02-31" })),
    }],
    ["the two documents from different deployments", {
      locale: "bg",
      documents: cloudDemoManifest("bg").documents.map((document, index) => index === 0
        ? { ...document, deployment: "LOCAL_HOSPITAL", contentSha256: "c".repeat(64) }
        : document),
    }],
    ["not an object", null],
    ["documents missing entirely", { locale: "bg" }],
  ])("refuses a manifest with %s", (_name, value) => {
    expect(parseLegalAcceptanceManifest(value, "bg")).toBeNull()
  })
})
