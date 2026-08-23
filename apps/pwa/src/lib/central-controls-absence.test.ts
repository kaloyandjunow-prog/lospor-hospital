import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

describe("Hospital PWA Central boundary", () => {
  it("contains no Central withdraw, resend, or per-case governance route", () => {
    const root = join(process.cwd(), "app")
    const files = [
      "(app)/cases/intraop/[id].tsx",
      "(app)/cases/new.tsx",
      "(app)/audit-logs.tsx",
    ].map(path => readFileSync(join(root, path), "utf8")).join("\n")
    expect(files).not.toMatch(/export-control|central-delivery|CLINICIAN_WITHDRAWAL|CLINICIAN_RESEND/)
  })
})
