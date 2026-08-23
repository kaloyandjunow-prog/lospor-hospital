import { NextRequest, NextResponse } from "next/server"
import {
  APAGBI_FASTING_POLICY_2023,
  PEDIATRIC_PRODUCTION_READY,
  PEDIATRIC_RULESET_VERSION,
  PEDIATRIC_SOURCE_REFERENCES,
} from "@lospor/core/pediatric"
import { createPediatricRuleManifest } from "@lospor/core/pediatric-dose"
import {
  pediatricDoseProfilesFromRules,
  pediatricDrugProfilesFromRules,
  pediatricFluidProfilesFromRules,
  pediatricInfusionProfilesFromRules,
} from "@lospor/core/clinical-rules"
import { getAuthUser } from "@/lib/mobile-auth"
import { pediatricCapabilities } from "@/lib/pediatric-mode"
import { effectiveClinicalRulesForUser } from "@/lib/clinical-rules/service"
import { currentGuidancePolicy } from "@/lib/hospital/control-plane"
import { assessSelectedHospitalClinicalBaseline } from "@/lib/hospital/clinical-baseline-readiness"
import { isHospitalDeployment } from "@/lib/hospital/deployment"

export async function GET(req: NextRequest) {
  const user = await getAuthUser(req)
  if (!user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const hospital = isHospitalDeployment()
  const [effective, policy, baseline] = await Promise.all([
    effectiveClinicalRulesForUser(user, "PEDIATRIC"),
    currentGuidancePolicy(),
    hospital ? assessSelectedHospitalClinicalBaseline("PEDIATRIC") : Promise.resolve(null),
  ])
  const doseProfiles = pediatricDoseProfilesFromRules(effective.rules)
  const pediatricDrugProfiles = pediatricDrugProfilesFromRules(effective.rules)
  const pediatricFluidProfiles = pediatricFluidProfilesFromRules(effective.rules)
  const pediatricInfusionProfiles = pediatricInfusionProfilesFromRules(effective.rules)
  const effectiveProfileReady = pediatricDrugProfiles.length > 0
    || pediatricInfusionProfiles.length > 0
    || pediatricFluidProfiles.length > 0
    || doseProfiles.length > 0
  const baselineReady = baseline?.baselineReady
    ?? (PEDIATRIC_PRODUCTION_READY && effectiveProfileReady)
  const guidanceEnabled = policy.pediatricEnabled && baselineReady

  return NextResponse.json({
    ...pediatricCapabilities(),
    rulesetVersion: PEDIATRIC_RULESET_VERSION,
    productionReady: baselineReady,
    baseline,
    guidance: {
      enabled: guidanceEnabled,
      policyEnabled: policy.pediatricEnabled,
      baselineReady,
      prospectiveOnly: true,
    },
    sources: Object.values(PEDIATRIC_SOURCE_REFERENCES),
    fastingPolicies: [APAGBI_FASTING_POLICY_2023],
    preset: effective.presetId
      ? {
          id: effective.presetId,
          name: effective.presetName!,
          version: effective.presetVersion!,
          scope: effective.scope!,
        }
      : null,
    effectiveRules: effective.rules,
    pediatricDrugProfiles,
    pediatricInfusionProfiles,
    pediatricFluidProfiles,
    // Kept for clients that still understand the retired one-route rule shape.
    doseProfiles,
    manifest: createPediatricRuleManifest(doseProfiles),
    unavailableWithoutReviewedProfile: [
      "LOCAL_ANAESTHETIC_LIMIT",
      "ESTIMATED_BLOOD_VOLUME",
      "ALLOWABLE_BLOOD_LOSS",
      "VENTILATION_SETTING",
      ...(pediatricDrugProfiles.length || doseProfiles.length ? [] : ["PEDIATRIC_DOSE"]),
    ],
  })
}
