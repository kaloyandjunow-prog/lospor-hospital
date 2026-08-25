import { describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

import { clinicalAiCapabilitiesFromState } from "@/lib/hospital/ai-boundary"

describe("clinical AI capability projection", () => {
  it("enables every currently shared provider surface only for a usable policy", () => {
    expect(clinicalAiCapabilitiesFromState({
      enabled: true,
      reason: null,
      provider: "MISTRAL",
      policyEnabled: true,
      credentialStored: true,
      providerConfigured: true,
    })).toEqual({
      clinicalAdvice: { enabled: true, reason: "ENABLED" },
      labImageExtraction: { enabled: true, reason: "ENABLED" },
      monitorOcr: { enabled: true, reason: "ENABLED" },
    })
  })

  it.each(["DISABLED_BY_DEPLOYMENT", "PROVIDER_NOT_CONFIGURED"] as const)(
    "preserves the safe client-facing refusal reason %s",
    reason => {
      const capabilities = clinicalAiCapabilitiesFromState({
        enabled: false,
        reason,
        provider: "MISTRAL",
        policyEnabled: reason !== "DISABLED_BY_DEPLOYMENT",
        credentialStored: false,
        providerConfigured: false,
      })
      expect(Object.values(capabilities)).toEqual([
        { enabled: false, reason },
        { enabled: false, reason },
        { enabled: false, reason },
      ])
    },
  )
})
