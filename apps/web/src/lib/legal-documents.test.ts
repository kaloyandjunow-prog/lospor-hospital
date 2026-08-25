import { createHash } from "node:crypto"
import { execFileSync } from "node:child_process"
import { describe, expect, it } from "vitest"
import en from "../../messages/en.json"
import bg from "../../messages/bg.json"
import {
  LEGAL_DOCUMENT_DESCRIPTORS,
  legalAcceptanceReferences,
  legalDocumentDescriptor,
  parseCloudLegalAcceptances,
  type LegalKind,
} from "./legal-documents"

describe("legal document descriptors", () => {
  it("ships a separate exact descriptor for every kind and locale", () => {
    expect(LEGAL_DOCUMENT_DESCRIPTORS).toHaveLength(4)
    for (const kind of ["TERMS", "PRIVACY"] as const) {
      for (const locale of ["bg", "en"] as const) {
        expect(legalDocumentDescriptor(kind, locale)).toEqual(expect.objectContaining({
          kind,
          locale,
          deployment: "CLOUD_DEMO",
        }))
      }
    }
  })

  it("binds each descriptor hash to its exact localized content", () => {
    const bundles = { en, bg }
    for (const descriptor of LEGAL_DOCUMENT_DESCRIPTORS) {
      const key = descriptor.kind.toLowerCase() as Lowercase<LegalKind>
      const content = bundles[descriptor.locale].legal[key]
      const hash = createHash("sha256").update(JSON.stringify(content)).digest("hex")
      expect(hash).toBe(descriptor.contentSha256)
    }
  })

  it("accepts only an API manifest matching the exact displayed documents", () => {
    const references = legalAcceptanceReferences("bg")
    expect(parseCloudLegalAcceptances({
      locale: "bg",
      documents: references.map(document => ({ ...document, content: "served by API" })),
    }, "bg")).toEqual(references)

    expect(parseCloudLegalAcceptances({
      locale: "bg",
      documents: references.map((document, index) => index
        ? document
        : { ...document, contentSha256: "0".repeat(64) }),
    }, "bg")).toBeNull()
    expect(parseCloudLegalAcceptances({ locale: "en", documents: references }, "bg")).toBeNull()
  })

  it("generates the exact API deployment manifest from displayed copy", () => {
    const manifest = JSON.parse(execFileSync(
      process.execPath,
      ["scripts/generate-cloud-legal-manifest.mjs"],
      { cwd: process.cwd(), encoding: "utf8" },
    )) as {
      deployment: string
      documents: Array<{
        kind: LegalKind
        locale: "bg" | "en"
        contentSha256: string
        content: string
      }>
    }
    expect(manifest.deployment).toBe("CLOUD_DEMO")
    expect(manifest.documents).toHaveLength(4)
    for (const descriptor of LEGAL_DOCUMENT_DESCRIPTORS) {
      const generated = manifest.documents.find(document =>
        document.kind === descriptor.kind && document.locale === descriptor.locale)
      expect(generated).toMatchObject({ contentSha256: descriptor.contentSha256 })
      if (!generated) throw new Error(`Missing ${descriptor.kind}/${descriptor.locale}`)
      expect(createHash("sha256").update(generated.content).digest("hex"))
        .toBe(descriptor.contentSha256)
    }
  })
})
