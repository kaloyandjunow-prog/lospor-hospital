import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const routes = [
  "src/app/v1/ai/advise/route.ts",
  "src/app/v1/cases/[id]/ai/read-labs/route.ts",
  "src/app/v1/cases/[id]/ai/advise/route.ts",
  "src/app/v1/cases/[id]/vitals-scan/route.ts",
  // Status's test scan (1.9.1) sends an image too.
  "src/app/v1/internal/hospital/control-plane/external-ai/lab-scan/test/route.ts",
]

describe("Hospital external AI egress gates", () => {
  it.each(routes)("checks persisted policy and sealed credential first: %s", path => {
    const source = readFileSync(join(process.cwd(), path), "utf8")
    const preflight = source.indexOf("await externalAiCapabilityState()")
    const credentialOpen = source.indexOf("await externalAiProviderAccess()")
    expect(preflight).toBeGreaterThan(-1)
    expect(credentialOpen).toBeGreaterThan(preflight)
    expect(source).not.toContain("process.env.MISTRAL_API_KEY")
    for (const sensitiveOperation of [
      "await req.text()",
      "await req.json()",
      "prisma.case.findUnique",
      "await boundedJson(",
    ]) {
      const position = source.indexOf(sensitiveOperation)
      if (position >= 0) expect(preflight).toBeLessThan(position)
    }
    // The egress: a direct provider call, or the shared lab scan (10.4.1).
    const egress = ["fetchMistralChatCompletions(apiKey", "await scanLabImage("]
      .map(call => source.indexOf(call)).filter(position => position >= 0)
    expect(egress.length).toBeGreaterThan(0)
    expect(credentialOpen).toBeLessThan(Math.min(...egress))
  })

  it("keeps the fresh-install credential CLI stdin-only and safe on empty input", () => {
    const source = readFileSync(join(
      process.cwd(),
      "scripts/configure-hospital-external-ai.ts",
    ), "utf8")
    expect(source).toContain("for await (const chunk of process.stdin)")
    expect(source).not.toContain("process.argv")
    expect(source).not.toContain("process.env.MISTRAL_API_KEY")
    expect(source).toContain("configured: false, skipped: true")
    expect(source).toContain("replaceExternalAiCredential")
  })
})
