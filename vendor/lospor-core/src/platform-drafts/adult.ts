import {
  type DoseProfile,
  type LocalAnaestheticFormulation,
  type RouteMode,
} from "../catalog"
import {
  LOSPOR_ADULT_RULESET_KEY,
  createLosporAdultRulePayloads,
  validateClinicalRulePayload,
  type AdultDoseProfileRulePayload,
} from "../clinical-rules"
import {
  LOSPOR_ADULT_V2_RULESET_VERSION,
  type PlatformClinicalDraft,
} from "./types"

type LocalAnaestheticRouteSetting = {
  concentrationOptions?: string[]
  defaultConcentration?: string
  formulationOptions?: LocalAnaestheticFormulation[]
  defaultFormulation?: LocalAnaestheticFormulation
}

/**
 * Baricity for a neuraxial block is not only a manufactured product attribute:
 * the anaesthetist routinely compounds it at the bedside (glucose to make a
 * solution hyperbaric, sterile water to make it hypobaric), often off-label.
 * Every local anaesthetic therefore offers all three, and the register records
 * what was actually given rather than restricting it to licensed presentations.
 * Isobaric is preselected because it is the unmodified solution.
 */

const NEURAXIAL_BARICITY = {
  formulationOptions: ["HYPOBARIC", "ISOBARIC", "HYPERBARIC"] as LocalAnaestheticFormulation[],
  defaultFormulation: "ISOBARIC" as LocalAnaestheticFormulation,
} satisfies LocalAnaestheticRouteSetting

const LOCAL_ANAESTHETIC_V2: Readonly<Record<
  string,
  { routes: Readonly<Record<string, LocalAnaestheticRouteSetting>>; sourceRefs: readonly string[] }
>> = {
  "Lidocaine": {
    routes: {
      INFILTRATION: { defaultConcentration: "0.5%" },
      EPIDURAL: { defaultConcentration: "1%" },
      INTRATHECAL: {
        concentrationOptions: ["5%"],
        defaultConcentration: "5%",
        ...NEURAXIAL_BARICITY,
      },
      PERINEURAL: { defaultConcentration: "1%" },
    },
    sourceRefs: [
      "https://www.medicines.org.uk/emc/product/15149/smpc",
      "https://labeling.pfizer.com/ShowLabeling.aspx?format=PDF&id=5361",
    ],
  },
  "Bupivacaine": {
    routes: {
      INFILTRATION: { defaultConcentration: "0.25%" },
      EPIDURAL: { defaultConcentration: "0.25%" },
      INTRATHECAL: {
        concentrationOptions: ["0.5%"],
        defaultConcentration: "0.5%",
        ...NEURAXIAL_BARICITY,
      },
      PERINEURAL: { defaultConcentration: "0.25%" },
    },
    sourceRefs: [
      "https://www.medicines.org.uk/emc/product/5763/smpc",
      "https://www.medicines.org.uk/emc/product/11160/smpc",
    ],
  },
  "Levobupivacaine": {
    routes: {
      INFILTRATION: { defaultConcentration: "0.25%" },
      EPIDURAL: { defaultConcentration: "0.25%" },
      INTRATHECAL: {
        concentrationOptions: ["0.5%"],
        defaultConcentration: "0.5%",
        ...NEURAXIAL_BARICITY,
      },
      PERINEURAL: { defaultConcentration: "0.25%" },
    },
    sourceRefs: [
      "https://www.medicines.org.uk/emc/product/13643/smpc",
      "https://sps.nhs.uk/articles/levobupivacaine-informing-intrathecal-risk-assessment/",
    ],
  },
  "Ropivacaine": {
    routes: {
      INFILTRATION: { defaultConcentration: "0.2%" },
      EPIDURAL: { defaultConcentration: "0.2%" },
      // Intrathecal ropivacaine is off-label, but it is used. Omitting
      // concentrationOptions inherits the catalog list, so the quick pills mirror
      // the epidural route exactly; "other" still allows any entered strength.
      INTRATHECAL: { defaultConcentration: "0.2%", ...NEURAXIAL_BARICITY },
      PERINEURAL: { defaultConcentration: "0.2%" },
    },
    sourceRefs: [
      "https://www.medicines.org.uk/emc/product/1497/smpc",
      "https://sps.nhs.uk/articles/ropivacaine-informing-intrathecal-risk-assessment/",
    ],
  },
  "Mepivacaine": {
    routes: {
      INFILTRATION: { defaultConcentration: "1%" },
      EPIDURAL: { defaultConcentration: "1%" },
      // Same as ropivacaine: off-label intrathecal use is recorded, and the quick
      // pills mirror the epidural route by inheriting the catalog concentrations.
      INTRATHECAL: { defaultConcentration: "1%", ...NEURAXIAL_BARICITY },
      PERINEURAL: { defaultConcentration: "1%" },
    },
    sourceRefs: [
      "https://dailymed.nlm.nih.gov/dailymed/fda/fdaDrugXsl.cfm?setid=643a8a85-e7c6-4f09-a179-0a8e63de1bac&type=display",
    ],
  },
  "Prilocaine": {
    routes: {
      IV: { defaultConcentration: "0.5%" },
      INFILTRATION: { defaultConcentration: "0.5%" },
      EPIDURAL: { defaultConcentration: "0.5%" },
      INTRATHECAL: {
        concentrationOptions: ["2%"],
        defaultConcentration: "2%",
        ...NEURAXIAL_BARICITY,
      },
      PERINEURAL: { defaultConcentration: "0.5%" },
    },
    sourceRefs: [
      "https://www.medicines.org.uk/emc/product/870/smpc",
      "https://www.medicines.org.uk/emc/product/15160/smpc",
    ],
  },
  "Chloroprocaine": {
    routes: {
      INFILTRATION: { defaultConcentration: "2%" },
      EPIDURAL: { defaultConcentration: "2%" },
      INTRATHECAL: {
        concentrationOptions: ["1%"],
        defaultConcentration: "1%",
        ...NEURAXIAL_BARICITY,
      },
      PERINEURAL: { defaultConcentration: "2%" },
    },
    sourceRefs: [
      "https://www.medicines.org.uk/emc/product/15158/smpc",
      "https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=4305ab6b-6038-9daa-e063-6294a90a018e",
    ],
  },
  "Tetracaine / Amethocaine": {
    routes: {
      INTRATHECAL: {
        concentrationOptions: ["1%"],
        defaultConcentration: "1%",
        ...NEURAXIAL_BARICITY,
      },
    },
    sourceRefs: [
      "https://dailymed.nlm.nih.gov/dailymed/fda/fdaDrugXsl.cfm?setid=2b3349c1-bd02-4442-9bf0-40a654bb8a80",
    ],
  },
}

function cloneRouteMode(mode: RouteMode): RouteMode {
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

function routeModeFromProfile(profile: DoseProfile, route: string): RouteMode {
  const existing = profile.routeModes?.[route]
  if (existing) return cloneRouteMode(existing)
  if (profile.min == null || profile.max == null || !profile.unit) {
    throw new Error(`Adult local-anaesthetic profile has no complete surface for ${route}`)
  }
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

function withAdultLocalAnaestheticV2(
  payload: AdultDoseProfileRulePayload,
): AdultDoseProfileRulePayload {
  const policy = LOCAL_ANAESTHETIC_V2[payload.itemKey]
  if (!policy) return payload
  const routeModes = Object.fromEntries(payload.profile.routes.map(route => {
    const base = routeModeFromProfile(payload.profile, route)
    const setting = policy.routes[route]
    if (!setting || (!base.concentrationOptions && !setting.concentrationOptions)) {
      return [route, base]
    }
    return [route, {
      ...base,
      concentrationOptions: setting.concentrationOptions
        ? [...setting.concentrationOptions]
        : base.concentrationOptions,
      concentrationUnit: "PERCENT",
      defaultConcentration: setting.defaultConcentration,
      suggestedConcentration: undefined,
      formulationOptions: setting.formulationOptions
        ? [...setting.formulationOptions]
        : undefined,
      defaultFormulation: setting.defaultFormulation,
    } satisfies RouteMode]
  }))
  const candidate = {
    ...payload,
    profile: {
      ...payload.profile,
      routeModes,
      concentrationOptions: undefined,
      concentrationUnit: undefined,
      defaultConcentration: undefined,
      suggestedConcentration: undefined,
      formulationOptions: undefined,
      defaultFormulation: undefined,
    },
  }
  const parsed = validateClinicalRulePayload(candidate)
  if (!parsed.valid || parsed.value.kind !== "ADULT_DRUG_PROFILE") {
    const detail = parsed.valid
      ? "Unexpected rule kind"
      : parsed.issues.map(issue => `${issue.field}: ${issue.message}`).join("; ")
    throw new Error(`Invalid adult local-anaesthetic v2 profile for ${payload.itemKey}: ${detail}`)
  }
  return parsed.value
}

export function createLosporAdultV2Draft(): PlatformClinicalDraft {
  const rules = createLosporAdultRulePayloads().map(payload => {
    // Deliberately bolus profiles only. Local anaesthetics also exist as
    // ADULT_INFUSION_PROFILE rules with neuraxial routes, but those must NOT get
    // baricity pills: intrathecal infusions are not run with hyperbaric solutions,
    // so offering the choice there would be clinically wrong, not merely noisy.
    const next = payload.kind === "ADULT_DRUG_PROFILE"
      ? withAdultLocalAnaestheticV2(payload)
      : payload
    return {
      payload: next,
      sourceRefs: next.kind === "ADULT_DRUG_PROFILE"
        ? [...(LOCAL_ANAESTHETIC_V2[next.itemKey]?.sourceRefs ?? [])]
        : [],
    }
  })
  return {
    id: "lospor-adults-v2",
    key: LOSPOR_ADULT_RULESET_KEY,
    name: "LOSPOR adult drugs profile",
    description: "Full adult snapshot preserving v1 selector behaviour while adding explicit percent "
      + "concentration units and route defaults. Concentration and baricity stay independent pills "
      + "because the anaesthetist compounds baricity at the bedside; every neuraxial local anaesthetic "
      + "offers hypobaric, isobaric and hyperbaric with isobaric preselected, and intrathecal quick "
      + "concentrations mirror the epidural route. Off-label neuraxial use is recorded rather than "
      + "blocked, and any strength outside the pills can still be entered under \"other\".",
    clinicalMode: "ADULT",
    version: LOSPOR_ADULT_V2_RULESET_VERSION,
    publishable: true,
    blockers: [],
    rules,
  }
}

