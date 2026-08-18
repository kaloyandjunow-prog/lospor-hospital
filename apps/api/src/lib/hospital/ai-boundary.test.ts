import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

import { refuseAiOnAppliance } from "@/lib/hospital/ai-boundary"

/**
 * No clinical data leaves a hospital appliance for an AI provider.
 *
 * The appliance was previously safe only by omission: compose.yaml passes no
 * MISTRAL_API_KEY, so the container never saw one and every AI route answered
 * 503 for want of configuration. That is a real boundary but an absent one, and
 * one line in an environment block away from not being true.
 *
 * The route-level tests stand this refusal down so they can exercise the
 * vendored upstream logic underneath it. This is where the refusal itself is
 * asserted.
 */
describe("refusing AI on an appliance", () => {
  const original = process.env.LOSPOR_DEPLOYMENT_MODE

  afterEach(() => {
    if (original === undefined) delete process.env.LOSPOR_DEPLOYMENT_MODE
    else process.env.LOSPOR_DEPLOYMENT_MODE = original
  })

  it("refuses on a hospital deployment", async () => {
    process.env.LOSPOR_DEPLOYMENT_MODE = "hospital"
    const response = refuseAiOnAppliance()
    expect(response).not.toBeNull()
    expect(response!.status).toBe(503)
    expect(await response!.json()).toMatchObject({ code: "AI_DISABLED_ON_APPLIANCE" })
  })

  it("refuses whatever the provider configuration says", () => {
    // The point of the guard: setting a key must not turn the feature on.
    process.env.LOSPOR_DEPLOYMENT_MODE = "hospital"
    const previous = process.env.MISTRAL_API_KEY
    process.env.MISTRAL_API_KEY = "a-key-somebody-added"
    try {
      expect(refuseAiOnAppliance()).not.toBeNull()
    } finally {
      if (previous === undefined) delete process.env.MISTRAL_API_KEY
      else process.env.MISTRAL_API_KEY = previous
    }
  })

  it("stands aside anywhere else", () => {
    // The same vendored routes run on the serverless deployment, where the
    // feature is legitimate and this must not interfere.
    process.env.LOSPOR_DEPLOYMENT_MODE = "serverless"
    expect(refuseAiOnAppliance()).toBeNull()
  })
})
