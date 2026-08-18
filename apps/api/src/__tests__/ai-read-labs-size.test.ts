import { describe, expect, it, vi } from "vitest"

// Appliance overlay. These routes refuse outright on a hospital deployment,
// before auth, before the body is read, before any provider call -- and CI
// runs with LOSPOR_DEPLOYMENT_MODE=hospital. The assertions below are about
// the vendored upstream logic underneath that refusal, which still has to be
// correct, so the refusal is stood down here and asserted on its own in
// ai-boundary.test.ts.
vi.mock("@/lib/hospital/ai-boundary", () => ({ refuseAiOnAppliance: () => null }))
vi.mock("@/lib/labs", () => ({ LAB_LIBRARY: [{ name: "Glucose", unit: "mmol/L" }] }))
vi.mock("@/lib/mobile-auth", () => ({ getAuthUser: vi.fn(async () => ({ id: "user-1" })) }))
vi.mock("@/lib/rate-limit", () => ({ rateLimit: vi.fn(async () => ({ allowed: true })) }))

describe("AI lab reading upload size guard", () => {
  it("rejects oversized base64 payloads even without Content-Length", async () => {
    vi.stubEnv("MISTRAL_API_KEY", "test")
    const { POST } = await import("@/app/v1/ai/read-labs/route")

    const req = new Request("https://app.lospor.org/api/ai/read-labs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        imageBase64: "a".repeat(Math.ceil(10_485_760 * 4 / 3) + 1),
        mimeType: "image/jpeg",
      }),
    })

    const res = await POST(req as never)
    expect(res.status).toBe(413)
    expect(await res.json()).toEqual({ error: "Image too large" })
  })
})
