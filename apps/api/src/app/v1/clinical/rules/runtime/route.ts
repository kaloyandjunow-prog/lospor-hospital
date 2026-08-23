import { NextRequest, NextResponse } from "next/server"
import {
  adultDoseProfilesFromRules,
  pediatricDrugProfilesFromRules,
  pediatricDoseProfilesFromRules,
  pediatricFluidProfilesFromRules,
  pediatricInfusionProfilesFromRules,
} from "@lospor/core/clinical-rules"
import { getAuthUser } from "@/lib/mobile-auth"
import { effectiveClinicalRulesForUser } from "@/lib/clinical-rules/service"
import { currentGuidancePolicy } from "@/lib/hospital/control-plane"
import { assessSelectedHospitalClinicalBaseline } from "@/lib/hospital/clinical-baseline-readiness"
import { isHospitalDeployment } from "@/lib/hospital/deployment"

export async function GET(req: NextRequest) {
  const user = await getAuthUser(req)
  if (!user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const mode = new URL(req.url).searchParams.get("mode") ?? "ADULT"
  if (mode !== "ADULT" && mode !== "PEDIATRIC") {
    return NextResponse.json({ error: "Invalid clinical mode" }, { status: 400 })
  }
  const hospital = isHospitalDeployment()
  const [effective, policy, baseline] = await Promise.all([
    effectiveClinicalRulesForUser(user, mode),
    currentGuidancePolicy(),
    hospital ? assessSelectedHospitalClinicalBaseline(mode) : Promise.resolve(null),
  ])
  const policyEnabled = mode === "ADULT" ? policy.adultEnabled : policy.pediatricEnabled
  const pediatricProfiles = mode === "PEDIATRIC"
    ? pediatricDoseProfilesFromRules(effective.rules)
    : []
  const pediatricDrugProfiles = mode === "PEDIATRIC"
    ? pediatricDrugProfilesFromRules(effective.rules)
    : []
  const pediatricFluidProfiles = mode === "PEDIATRIC"
    ? pediatricFluidProfilesFromRules(effective.rules)
    : []
  const pediatricInfusionProfiles = mode === "PEDIATRIC"
    ? pediatricInfusionProfilesFromRules(effective.rules)
    : []
  const adultProfiles = mode === "ADULT"
    ? adultDoseProfilesFromRules(effective.rules)
    : []
  const effectiveProfileReady = mode === "ADULT"
    ? adultProfiles.length > 0
    : pediatricDrugProfiles.length > 0
      || pediatricInfusionProfiles.length > 0
      || pediatricFluidProfiles.length > 0
      || pediatricProfiles.length > 0
  // Public/demo deployments retain their upstream profile-based readiness.
  // Hospital appliances additionally require the exact selected platform v2
  // baseline; a personal or institution ruleset can never satisfy that gate.
  const baselineReady = baseline?.baselineReady ?? effectiveProfileReady
  const guidanceEnabled = policyEnabled && baselineReady

  return NextResponse.json({
    mode,
    preset: effective.presetId
      ? {
          id: effective.presetId,
          name: effective.presetName!,
          version: effective.presetVersion!,
          scope: effective.scope!,
        }
      : null,
    // Kept for existing clients, but now means content readiness only. Policy
    // state is reported independently below.
    productionReady: baselineReady,
    baseline,
    guidance: {
      enabled: guidanceEnabled,
      policyEnabled,
      baselineReady,
      prospectiveOnly: true,
    },
    effectiveRules: effective.rules,
    pediatricDrugProfiles,
    pediatricInfusionProfiles,
    pediatricFluidProfiles,
    // Legacy indication/route rows remain available during the staged client
    // rollout. New clients use pediatricDrugProfiles exclusively.
    doseProfiles: pediatricProfiles,
    adultDoseProfiles: adultProfiles,
  })
}
