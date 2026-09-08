import { describe, expect, it, vi } from "vitest"
import { CLOUD_DEMO_LEGAL_DOCUMENTS } from "@lospor/core/legal"
import {
  loadRegistrationLegalDocuments,
  parseRegistrationLegalDocuments,
} from "./legal-documents"

function cloudDemoManifest(locale: "bg" | "en") {
  return {
    locale,
    documents: CLOUD_DEMO_LEGAL_DOCUMENTS
      .filter(document => document.locale === locale)
      .map(document => ({ ...document, content: "served by the API" })),
  }
}

function hospitalManifest(locale: "bg" | "en") {
  const hash = (digit: string) => digit.repeat(64)
  return {
    locale,
    documents: [
      {
        deployment: "LOCAL_HOSPITAL", kind: "TERMS", version: "1.2.0",
        effectiveDate: "2026-08-22", locale, contentSha256: hash("a"), content: "Displayed terms",
      },
      {
        deployment: "LOCAL_HOSPITAL", kind: "PRIVACY", version: "1.2.0",
        effectiveDate: "2026-08-22", locale, contentSha256: hash("b"), content: "Displayed privacy notice",
      },
    ],
  }
}

describe("registration legal-document contract", () => {
  it("accepts the exact bundled cloud-demo documents and strips their content", () => {
    const expected = CLOUD_DEMO_LEGAL_DOCUMENTS.filter(document => document.locale === "bg")
    expect(parseRegistrationLegalDocuments(cloudDemoManifest("bg"), "bg")).toEqual(expected)
    expect(parseRegistrationLegalDocuments(cloudDemoManifest("bg"), "bg")?.[0]).not.toHaveProperty("content")
  })

  /**
   * This is the check this app lacked before it read the parser from core: a
   * cloud-demo document that is otherwise well-formed but does not match the
   * bundled hash meant the server was not serving the reviewed text, and this
   * app accepted it anyway while the web app refused it.
   */
  it("refuses a cloud-demo document whose hash does not match the bundled copy", () => {
    const tampered = cloudDemoManifest("bg")
    tampered.documents = tampered.documents.map(document => document.kind === "TERMS"
      ? { ...document, contentSha256: "0".repeat(64) }
      : document)
    expect(parseRegistrationLegalDocuments(tampered, "bg")).toBeNull()
  })

  // A hospital's text is set by its own operator and cannot be known in
  // advance, so a well-formed manifest is accepted as it always was.
  it("accepts a well-formed hospital manifest without a known fingerprint", () => {
    expect(parseRegistrationLegalDocuments(hospitalManifest("bg"), "bg")).toEqual([
      expect.objectContaining({ kind: "TERMS", deployment: "LOCAL_HOSPITAL" }),
      expect.objectContaining({ kind: "PRIVACY", deployment: "LOCAL_HOSPITAL" }),
    ])
  })

  it.each([
    { ...hospitalManifest("bg"), locale: "en" },
    { locale: "bg", documents: [hospitalManifest("bg").documents[0]] },
    { locale: "bg", documents: hospitalManifest("bg").documents.map(item => ({ ...item, kind: "TERMS" })) },
    { locale: "bg", documents: hospitalManifest("bg").documents.map(item => ({ ...item, contentSha256: "bad" })) },
    { locale: "bg", documents: hospitalManifest("bg").documents.map(item => ({ ...item, deployment: "UNKNOWN" })) },
  ])("rejects incomplete, mismatched, or unauthenticated manifests", invalid => {
    expect(parseRegistrationLegalDocuments(invalid, "bg")).toBeNull()
  })

  it("loads the Bulgarian manifest from the public API", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => hospitalManifest("bg"),
    } as Response))
    await expect(loadRegistrationLegalDocuments("bg", fetchImpl)).resolves.toHaveLength(2)
    expect(fetchImpl).toHaveBeenCalledWith(
      expect.stringContaining("/v1/legal/documents?locale=bg"),
      expect.objectContaining({ headers: { Accept: "application/json" } }),
    )
  })
})
