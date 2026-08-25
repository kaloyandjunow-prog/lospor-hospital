import {
  externalAiCapabilityState,
  type ExternalAiCapabilityState,
} from "@/lib/hospital/external-ai-policy"

export type ClinicalAiCapability = {
  enabled: boolean
  reason: "ENABLED" | "DISABLED_BY_DEPLOYMENT" | "PROVIDER_NOT_CONFIGURED"
}

export type ClinicalAiCapabilities = {
  clinicalAdvice: ClinicalAiCapability
  labImageExtraction: ClinicalAiCapability
  monitorOcr: ClinicalAiCapability
}

/**
 * All three current clinical-AI surfaces use the same Mistral provider policy
 * and sealed credential. Keep the public capability contract explicit per
 * surface so clients can hide each input independently and future releases can
 * split them without changing the response shape.
 */
export function clinicalAiCapabilitiesFromState(
  state: ExternalAiCapabilityState,
): ClinicalAiCapabilities {
  const capability: ClinicalAiCapability = {
    enabled: state.enabled,
    reason: state.enabled ? "ENABLED" : state.reason ?? "PROVIDER_NOT_CONFIGURED",
  }
  return {
    clinicalAdvice: { ...capability },
    labImageExtraction: { ...capability },
    monitorOcr: { ...capability },
  }
}

export async function clinicalAiCapabilities(): Promise<ClinicalAiCapabilities> {
  return clinicalAiCapabilitiesFromState(await externalAiCapabilityState())
}
