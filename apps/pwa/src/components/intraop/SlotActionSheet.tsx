import { Text } from "react-native"
import type { ClinicalEventDef } from "@/lib/intraop-types"
import type { ActiveGasSettings } from "@/lib/intraop-log-event"
import { FeedbackPressable } from "./FeedbackPressable"
import { Sheet } from "./Sheet"
import { usePreferences } from "@/lib/preferences-context"
import { displayClinicalCode } from "@/lib/clinical-display"
import { complicationDisplayLabel } from "@lospor/core/clinical-display"
import { canonicalComplicationLabel, complicationGroupsBeyond } from "@lospor/core/complications"
import { useShade } from "@/theme/shade"
import { jetSheet } from "@/lib/jet-sheet"
import { useSyncExternalStore } from "react"
import type { LikelyEvent } from "@lospor/core/event-succession"
import { EventList } from "./EventList"
import { LegacyEventList } from "./LegacyEventList"

type ClinicalEventCategory = {
  cat: string
  color: string
  events: ClinicalEventDef[]
  isComplication?: boolean
}

type ActiveAgent = { name: string; color: string; percent?: number } | null

type Props = {
  visible: boolean
  title: string
  eventSearch: string
  complicationExpanded: boolean
  eventCategories: ClinicalEventCategory[]
  isGACase: boolean
  /** Every running volatile agent; several may run at once. */
  activeAgents: NonNullable<ActiveAgent>[]
  activeGas: ActiveGasSettings
  onClose: () => void
  onEventSearchChange: (value: string) => void
  onToggleComplications: () => void
  /** The events likely to come next (10.2.0), none already charted. */
  likelyEvents?: readonly LikelyEvent[]
  /** Smart selection (default) or the Legacy coloured buttons (Settings). */
  eventsScreen?: "smart" | "legacy"
  onDismissLikely?: (suggestionId: string) => void
  onSelectEvent: (event: ClinicalEventDef, isComplication: boolean, suggestion?: string) => void
  onBrowseDrugs: () => void
  /** A shock at the slot's time (10.1.0). */
  onOpenDefibrillation?: () => void
  /** Jet ventilation at the slot's time (10.2.0); shown once Jet is ticked among the ventilation modes. */
  onOpenJet?: () => void
  onStopAgent: (name: string) => void
  /** Change the concentration of a running agent (opens the agent sheet on it). */
  onChangeAgent?: (name: string) => void
  onOpenAgent: () => void
  onStopGas: () => void
  onOpenGas: () => void
}

export function SlotActionSheet({
  visible,
  title,
  eventSearch,
  complicationExpanded,
  eventCategories,
  onClose,
  onEventSearchChange,
  likelyEvents = [],
  eventsScreen = "smart",
  onDismissLikely,
  onToggleComplications,
  onSelectEvent,
  onBrowseDrugs,
  onOpenDefibrillation,
  onOpenJet,
}: Props) {
  const shade = useShade()
  const jetOn = useSyncExternalStore(jetSheet.subscribe, jetSheet.enabled, jetSheet.enabled)
  const { tc, language } = usePreferences()
  const categoryLabel = (name: string) => displayClinicalCode("optionGroup", name, language, { label: name })
  // A complication reads as the complications catalogue names it, as in its
  // list and the event log (10.1.0); any other event by its option.
  const clinicalEventLabel = (event: ClinicalEventDef, isComplication: boolean) => isComplication
    ? complicationDisplayLabel(event.label, language)
    : event.code
      ? displayClinicalCode("option:INTRAOP_EVENT", event.code, language, { label: event.label, labelBg: event.labelBg })
      : displayClinicalCode("complication", event.label, language, { label: event.label })
  // The quick complications are saved under the catalogue's name; "Show all"
  // adds the rest under the catalogue's headings.
  const groups = eventCategories.flatMap(cat => {
    const isComplication = cat.isComplication ?? false
    const quick = { key: cat.cat, title: categoryLabel(cat.cat), color: cat.color, isComplication, toggle: isComplication,
      events: isComplication ? cat.events.map(ev => ({ ...ev, label: canonicalComplicationLabel(ev.label) })) : cat.events }
    if (!isComplication) return [quick]
    return [quick, ...complicationGroupsBeyond(cat.events.map(ev => ev.label)).map(group => ({
      key: `complications:${group.id}`, title: language === "bg" ? group.titleBg : group.title, color: cat.color,
      isComplication: true, toggle: false, events: group.items.map(label => ({ label, color: shade("#ef4444") }) as ClinicalEventDef),
    }))]
  })
  return (
    <Sheet visible={visible} onClose={onClose} title={title} full>
      {eventsScreen === "legacy" ? (
        <LegacyEventList groups={groups} search={eventSearch} onSearch={onEventSearchChange} onSelect={onSelectEvent} label={clinicalEventLabel}
          complicationExpanded={complicationExpanded} onToggleComplications={onToggleComplications} />
      ) : (
        <EventList groups={groups} search={eventSearch} onSearch={onEventSearchChange} onSelect={onSelectEvent} label={clinicalEventLabel}
          likely={likelyEvents} onDismissLikely={event => onDismissLikely?.(event)} />
      )}

      <FeedbackPressable onPress={onBrowseDrugs}
        style={{ borderRadius:10, paddingVertical:10, alignItems:"center",
          backgroundColor:shade("#1e2d40"), borderWidth:1, borderColor:shade("#3b82f644"), marginBottom:18 }}>
        <Text style={{ color:shade("#93c5fd"), fontWeight:"700", fontSize:12 }}>{tc("sasBrowseAllDrugs")}</Text>
      </FeedbackPressable>

      {onOpenDefibrillation ? (
        <FeedbackPressable onPress={onOpenDefibrillation} testID="slot-defibrillation"
          style={{ borderRadius:10, paddingVertical:10, alignItems:"center", marginTop:-8,
            backgroundColor:shade("#f59e0b18"), borderWidth:1, borderColor:shade("#f59e0b55"), marginBottom:18 }}>
          <Text style={{ color:shade("#fbbf24"), fontWeight:"700", fontSize:12 }}>{tc("defibButton")}</Text>
        </FeedbackPressable>
      ) : null}

      {onOpenJet && jetOn ? (
        <FeedbackPressable onPress={onOpenJet} testID="slot-jet"
          style={{ borderRadius:10, paddingVertical:10, alignItems:"center", marginTop:-8,
            backgroundColor:shade("#14b8a618"), borderWidth:1, borderColor:shade("#14b8a655"), marginBottom:18 }}>
          <Text style={{ color:shade("#5eead4"), fontWeight:"700", fontSize:12 }}>{tc("jetRow")}</Text>
        </FeedbackPressable>
      ) : null}

      {/* 10.8.0: the running agent and gas are worked with from their own menu in the row, not from here. */}
    </Sheet>
  )
}
