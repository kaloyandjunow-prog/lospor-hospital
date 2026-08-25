import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const worker = readFileSync(join(process.cwd(), "src/lib/hospital/delivery-worker.ts"), "utf8")
const reserve = readFileSync(join(process.cwd(), "src/lib/hospital/export-batch.ts"), "utf8")

describe("Central worker respects both Status locks", () => {
  it("cannot claim an old or new batch without transport evidence and active clinical approval", () => {
    for (const source of [worker, reserve]) {
      expect(source).toContain("transportConfigurationHash")
      expect(source).toContain("transportConfiguredAt")
      expect(source).toContain("transportConfiguredById")
    }
    expect(worker).toContain('policy."enabled" = true')
    expect(worker).toContain('policy."approvedAt" IS NOT NULL')
  })
})
