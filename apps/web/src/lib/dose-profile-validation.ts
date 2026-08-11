import type { DoseProfile, RouteMode } from "@lospor/core/catalog"

/**
 * Whether an authored dose profile is fit to publish.
 *
 * This is the gate between someone typing a rule into the clinical-rules
 * console and the chart dosing from it. A profile that gets through here with a
 * gap in it does not fail loudly: it surfaces later as a drug that quietly will
 * not autofill, on a device, in front of a patient, with nothing to connect the
 * two events.
 *
 * The awkward part is that a profile does not have to state its routes
 * explicitly. A route with no settings of its own inherits the drug's, so
 * "complete" means every declared route resolves to something usable — which is
 * why the validation and the inheritance live together and are tested together.
 */

export function cloneRouteMode(mode: RouteMode): RouteMode {
  return {
    ...mode,
    quickValues: [...mode.quickValues],
    variableStep: mode.variableStep?.map(item => ({ ...item })),
    doseCalc: mode.doseCalc ? { ...mode.doseCalc } : undefined,
    concentrationOptions: mode.concentrationOptions ? [...mode.concentrationOptions] : undefined,
    formulationOptions: mode.formulationOptions ? [...mode.formulationOptions] : undefined,
    prepStrength: mode.prepStrength ? { ...mode.prepStrength } : undefined,
  }
}

export function effectiveRouteMode(profile: DoseProfile, route: string): RouteMode | null {
  const explicit = profile.routeModes?.[route]
  if (explicit) return cloneRouteMode(explicit)
  if (profile.min == null || profile.max == null || !profile.unit) return null
  return {
    mode: profile.mode,
    min: profile.min,
    max: profile.max,
    step: profile.step ?? profile.variableStep?.[0]?.step ?? 1,
    variableStep: profile.variableStep?.map(item => ({ ...item })),
    quickValues: [...profile.quickValues],
    unit: profile.unit,
    weightBasis: profile.weightBasis,
    doseCalc: profile.doseCalcByRoute?.[route]
      ? { ...profile.doseCalcByRoute[route] }
      : profile.doseCalc
        ? { ...profile.doseCalc }
        : undefined,
    concentrationOptions: profile.concentrationOptions
      ? [...profile.concentrationOptions]
      : undefined,
    concentrationUnit: profile.concentrationUnit,
    defaultConcentration: profile.defaultConcentration,
    suggestedConcentration: profile.suggestedConcentration,
    formulationOptions: profile.formulationOptions
      ? [...profile.formulationOptions]
      : undefined,
    defaultFormulation: profile.defaultFormulation,
    suggestedVolume: profile.suggestedVolumeByRoute?.[route] ?? profile.suggestedVolume,
    suggestedRate: profile.suggestedRate,
    prepStrength: profile.prepStrength ? { ...profile.prepStrength } : undefined,
  }
}

export function doseProfileEditorIssues(profile: DoseProfile): string[] {
  const issues: string[] = []
  if (!profile.routes.length) issues.push("At least one route is required.")
  if (!profile.defaultRoute || !profile.routes.includes(profile.defaultRoute)) {
    issues.push("The default route must be one of the included routes.")
  }
  const orphanRoutes = Object.keys(profile.routeModes ?? {}).filter(route => !profile.routes.includes(route))
  if (orphanRoutes.length) issues.push(`Remove orphan route settings: ${orphanRoutes.join(", ")}.`)
  const missingRoutes = profile.routes.filter(route => !effectiveRouteMode(profile, route))
  if (missingRoutes.length) issues.push(`Complete the route settings for: ${missingRoutes.join(", ")}.`)
  if (profile.kind === "fluid") {
    const modes = profile.fluidEntryModes
    if (modes && !modes.length) issues.push("At least one fluid entry mode is required.")
    if (
      profile.defaultFluidEntryMode
      && !modes?.includes(profile.defaultFluidEntryMode)
    ) {
      issues.push("The default fluid entry mode must be one of the included modes.")
    }
    if (profile.fluidRate && modes && !modes.includes("RATE")) {
      issues.push("Rate settings require the Rate entry mode.")
    }
  }
  return issues
}
