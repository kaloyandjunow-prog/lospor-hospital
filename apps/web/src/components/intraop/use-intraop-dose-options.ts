import { useCallback, useMemo } from "react"
import { useOptionLibrary } from "@/hooks/useOptionLibrary"
import { agentRuleFor } from "@lospor/core/agent-entry"
import {
  applyAdultDoseProfilesToOptions,
  applyPediatricDrugProfilesToOptions,
  applyPediatricInfusionProfilesToOptions,
  synthesizePediatricDrugOptions,
  type AdultDoseProfileRule,
  type PediatricAgentProfileRule,
  type PediatricDrugProfileRule,
  type PediatricInfusionProfileRule,
} from "@lospor/core/clinical-rules"
import type { PediatricAgeUnit } from "@lospor/core/pediatric"

type Args = {
  isPediatric: boolean
  adultDoseProfiles: readonly AdultDoseProfileRule[]
  pediatricDrugProfiles: readonly PediatricDrugProfileRule[]
  pediatricInfusionProfiles: readonly PediatricInfusionProfileRule[]
  pediatricAgentProfiles: readonly PediatricAgentProfileRule[]
  pediatricAge: { value: number; unit: PediatricAgeUnit } | null
  tbw: number | null | undefined
}

/**
 * The timetable's option lists: the shared library, with the active ruleset's
 * dose profiles applied, plus the rule lookup for an inhaled agent (range, step
 * and quick buttons; none -> the catalogue answers).
 */
export function useIntraopDoseOptions({
  isPediatric, adultDoseProfiles, pediatricDrugProfiles, pediatricInfusionProfiles, pediatricAgentProfiles, pediatricAge, tbw,
}: Args) {
  const { options: baseDrugLibOpts } = useOptionLibrary("INTRAOP_DRUG")
  const { options: baseFluidLibOpts } = useOptionLibrary("INTRAOP_FLUID")
  const { options: eventLibOpts } = useOptionLibrary("INTRAOP_EVENT")
  const { options: baseInfusionLibOpts } = useOptionLibrary("INTRAOP_INFUSION")
  const { options: agentLibOpts } = useOptionLibrary("INHALATIONAL_AGENT")
  const drugOptionsWithPediatricRules = useMemo(() =>
    synthesizePediatricDrugOptions(baseDrugLibOpts, isPediatric ? pediatricDrugProfiles : []),
  [baseDrugLibOpts, isPediatric, pediatricDrugProfiles])
  const drugLibOpts = useMemo(
    () => applyPediatricDrugProfilesToOptions(
      applyAdultDoseProfilesToOptions(
        drugOptionsWithPediatricRules,
        adultDoseProfiles,
        "ADULT_DRUG_PROFILE",
      ),
      isPediatric ? pediatricDrugProfiles : [],
      isPediatric ? pediatricAge : null,
      tbw,
    ),
    [adultDoseProfiles, drugOptionsWithPediatricRules, isPediatric, pediatricAge, pediatricDrugProfiles, tbw],
  )
  const infusionLibOpts = useMemo(
    () => applyPediatricInfusionProfilesToOptions(
      applyAdultDoseProfilesToOptions(
        baseInfusionLibOpts,
        adultDoseProfiles,
        "ADULT_INFUSION_PROFILE",
      ),
      isPediatric ? pediatricInfusionProfiles : [],
      isPediatric ? pediatricAge : null,
      tbw,
    ),
    [adultDoseProfiles, baseInfusionLibOpts, isPediatric, pediatricAge, pediatricInfusionProfiles, tbw],
  )
  // The active ruleset's range, step and quick buttons for an agent; none -> the catalogue.
  const agentRuleOf = useCallback(
    (agent: string) => agentRuleFor(agent, { adult: adultDoseProfiles, paediatric: pediatricAgentProfiles }, isPediatric),
    [adultDoseProfiles, isPediatric, pediatricAgentProfiles],
  )
  const fluidLibOpts = useMemo(
    () => applyAdultDoseProfilesToOptions(
      baseFluidLibOpts,
      adultDoseProfiles,
      "ADULT_FLUID_PROFILE",
    ),
    [adultDoseProfiles, baseFluidLibOpts],
  )
  return { eventLibOpts, agentLibOpts, drugLibOpts, infusionLibOpts, fluidLibOpts, agentRuleOf }
}
