import { useCallback } from "react"
import { displayClinicalCode, displayNamedOption } from "@/lib/clinical-display"
import type { LibraryOption } from "@/hooks/useOptionLibrary"

/**
 * Clinical naming for the intraoperative timetable.
 *
 * Eight of these lived inside the timetable component, which is the reason any
 * part of that screen split into its own component has to be handed the naming
 * it needs rather than reaching for it. They are gathered here so a lane, a row
 * or a sheet can take one `IntraopDisplay` and render the same words the rest
 * of the screen does.
 *
 * The names are deliberately unchanged from their previous local ones, so the
 * component destructures this hook and nothing else about it moves.
 */

/**
 * Fluid lanes are labelled "<group> <n>" — "Crystalloid 2" — because a case can
 * run several bags of the same fluid at once. Only the group is a clinical term
 * to be translated; the number is just which line it is.
 *
 * Exported and pure so the parsing can be tested without a renderer: getting it
 * wrong shows up as an untranslated lane header, which reads as a missing
 * translation rather than as a bug.
 */
export function splitFluidLaneLabel(label: string): { group: string; index: string } | null {
  const match = label.match(/^(.*) (\d+)$/)
  return match ? { group: match[1], index: match[2] } : null
}

export type IntraopDisplayInput = {
  locale: string
  drugOptions: readonly LibraryOption[]
  fluidOptions: readonly LibraryOption[]
  infusionOptions: readonly LibraryOption[]
  agentOptions: readonly LibraryOption[]
}

export type IntraopDisplay = {
  displayDrugName: (name: string) => string
  displayFluidName: (name: string) => string
  displayInfusionName: (name: string) => string
  displayAgentName: (name: string) => string
  displayEventName: (event: { code: string; label: string; labelBg: string | null }) => string
  displayGroupName: (group: string) => string
  displayFluidLaneLabel: (label: string) => string
  displayScenarioName: (group: { key: string; label: string }) => string
}

export function useIntraopDisplay({
  locale,
  drugOptions,
  fluidOptions,
  infusionOptions,
  agentOptions,
}: IntraopDisplayInput): IntraopDisplay {
  const displayDrugName = useCallback(
    (name: string) => displayNamedOption("INTRAOP_DRUG", drugOptions, name, locale),
    [drugOptions, locale],
  )
  const displayFluidName = useCallback(
    (name: string) => displayNamedOption("INTRAOP_FLUID", fluidOptions, name, locale),
    [fluidOptions, locale],
  )
  const displayInfusionName = useCallback(
    (name: string) => displayNamedOption("INTRAOP_INFUSION", infusionOptions, name, locale),
    [infusionOptions, locale],
  )
  const displayAgentName = useCallback(
    (name: string) => displayNamedOption("INHALATIONAL_AGENT", agentOptions, name, locale),
    [agentOptions, locale],
  )
  const displayEventName = useCallback(
    (event: { code: string; label: string; labelBg: string | null }) => displayClinicalCode(
      "option:INTRAOP_EVENT",
      event.code,
      locale,
      { label: event.label, labelBg: event.labelBg },
    ),
    [locale],
  )
  const displayGroupName = useCallback(
    (group: string) => displayClinicalCode("optionGroup", group, locale),
    [locale],
  )
  const displayFluidLaneLabel = useCallback((label: string) => {
    const parts = splitFluidLaneLabel(label)
    return parts ? `${displayGroupName(parts.group)} ${parts.index}` : displayGroupName(label)
  }, [displayGroupName])
  const displayScenarioName = useCallback(
    (group: { key: string; label: string }) => displayClinicalCode(
      "scenarioGroup",
      group.key,
      locale,
      { label: group.label },
    ),
    [locale],
  )

  return {
    displayDrugName,
    displayFluidName,
    displayInfusionName,
    displayAgentName,
    displayEventName,
    displayGroupName,
    displayFluidLaneLabel,
    displayScenarioName,
  }
}
