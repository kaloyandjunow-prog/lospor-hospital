import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8")

describe("Hospital 1.0.0 printable-record contract", () => {
  it("has no server-side Chromium renderer dependency", () => {
    const packageJson = JSON.parse(read("../../package.json")) as {
      dependencies?: Record<string, string>
    }
    expect(packageJson.dependencies).not.toHaveProperty("puppeteer-core")
    expect(packageJson.dependencies).not.toHaveProperty("@sparticuz/chromium")
    expect(read("../../next.config.ts")).not.toMatch(/puppeteer|sparticuz|chromium/i)
  })

  it("publishes only an explicit retired JSON contract, never a PDF download", () => {
    for (const path of ["../generated/openapi.json", "../generated/openapi-internal.json"]) {
      const document = JSON.parse(read(path)) as {
        paths: Record<string, { get?: { responses?: Record<string, unknown> } }>
      }
      const retired = document.paths["/v1/cases/{id}/pdf"]?.get
      expect(retired?.responses).toHaveProperty("410")
      expect(retired?.responses).not.toHaveProperty("200")
      expect(JSON.stringify(document)).not.toContain("application/pdf")
    }
  })

  it("keeps the retired route explicit and free of redirect fallback", () => {
    const route = read("../app/v1/cases/[id]/pdf/route.ts")
    expect(route).toContain('code: "PRINTABLE_HTML_ONLY"')
    expect(route).toContain("status: 410")
    expect(route).not.toContain("NextResponse.redirect")
    expect(route).not.toContain("renderRecordPdf")
  })
})
