import { Text, TextInput, TouchableOpacity, View } from "react-native"
import type { ClinicalEventDef } from "@/lib/intraop-types"
import type { ActiveGasSettings } from "@/lib/intraop-log-event"
import { FeedbackPressable } from "./FeedbackPressable"
import { Sheet } from "./Sheet"
import { usePreferences } from "@/lib/preferences-context"
import { displayClinicalCode } from "@/lib/clinical-display"
import { formatMessage } from "@/i18n/locale"
import { useShade } from "@/theme/shade"

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
  extraComplicationLabels: string[]
  isGACase: boolean
  /** Every running volatile agent; several may run at once. */
  activeAgents: NonNullable<ActiveAgent>[]
  activeGas: ActiveGasSettings
  onClose: () => void
  onEventSearchChange: (value: string) => void
  onToggleComplications: () => void
  onSelectEvent: (event: ClinicalEventDef, isComplication: boolean) => void
  onBrowseDrugs: () => void
  onStopAgent: (name: string) => void
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
  extraComplicationLabels,
  isGACase,
  activeAgents,
  activeGas,
  onClose,
  onEventSearchChange,
  onToggleComplications,
  onSelectEvent,
  onBrowseDrugs,
  onStopAgent,
  onOpenAgent,
  onStopGas,
  onOpenGas,
}: Props) {
  const shade = useShade()
  const { tc, language } = usePreferences()
  const categoryLabel = (name: string) => displayClinicalCode("optionGroup", name, language, { label: name })
  const clinicalEventLabel = (event: ClinicalEventDef) => event.code
    ? displayClinicalCode("option:INTRAOP_EVENT", event.code, language, { label: event.label, labelBg: event.labelBg })
    : displayClinicalCode("complication", event.label, language, { label: event.label })
  const agentLabel = (name: string) => displayClinicalCode("option:INHALATIONAL_AGENT", name, language, { label: name })
  return (
    <Sheet visible={visible} onClose={onClose} title={title} full>
      <TextInput
        style={{ backgroundColor:shade("#111820"), color:shade("#f8fafc"), borderRadius:10, paddingHorizontal:12, paddingVertical:9,
          fontSize:13, borderWidth:1, borderColor:shade("#1e2d40"), marginBottom:12 }}
        placeholder={tc("sasSearchEvents")}
        placeholderTextColor={shade("#475569")}
        value={eventSearch}
        onChangeText={onEventSearchChange}
        autoCapitalize="none"
        autoCorrect={false}
      />

      {eventCategories.map(cat => {
        const events = cat.isComplication && complicationExpanded
          ? [
              ...cat.events,
              ...extraComplicationLabels
                .filter(label => !cat.events.some(e => e.label === label))
                .map(label => ({ label, color: shade("#ef4444") })),
            ]
          : cat.events
        const visibleEvents = events.filter(ev => !eventSearch || [ev.label, clinicalEventLabel(ev)].some(label => label.toLowerCase().includes(eventSearch.toLowerCase())))
        if (visibleEvents.length === 0 && eventSearch) return null
        return (
          <View key={cat.cat} style={{ marginBottom:14 }}>
            <View style={{ flexDirection:"row", alignItems:"center", marginBottom:6 }}>
              <Text style={{ color: cat.color, fontSize:9, fontWeight:"800", letterSpacing:1.2,
                textTransform:"uppercase", flex:1 }}>{categoryLabel(cat.cat)}</Text>
              {cat.isComplication && (
                <TouchableOpacity onPress={onToggleComplications}>
                  <Text style={{ color:shade("#64748b"), fontSize:9, fontWeight:"700" }}>
                    {complicationExpanded ? tc("hide") : tc("show")}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
            <View style={{ flexDirection:"row", flexWrap:"wrap", gap:7 }}>
              {visibleEvents.map(ev => (
                <TouchableOpacity key={ev.label} onPress={() => onSelectEvent(ev, cat.isComplication ?? false)}
                  style={{ paddingHorizontal:11, paddingVertical:8, borderRadius:10,
                    backgroundColor:ev.color+"18", borderWidth:1, borderColor:ev.color+"55" }}>
                  <Text style={{ color:ev.color, fontSize:11, fontWeight:"700" }}>{clinicalEventLabel(ev)}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )
      })}

      <FeedbackPressable onPress={onBrowseDrugs}
        style={{ borderRadius:10, paddingVertical:10, alignItems:"center",
          backgroundColor:shade("#1e2d40"), borderWidth:1, borderColor:shade("#3b82f644"), marginBottom:18 }}>
        <Text style={{ color:shade("#93c5fd"), fontWeight:"700", fontSize:12 }}>{tc("sasBrowseAllDrugs")}</Text>
      </FeedbackPressable>

      {isGACase && (
        <>
          <Text style={{ color:shade("#a855f7"), fontSize:10, fontWeight:"800", letterSpacing:1.2,
            textTransform:"uppercase", marginBottom:8 }}>{tc("sasInhaledAgent")}</Text>
          {activeAgents.map(activeAgent => (
            <View key={activeAgent.name} style={{ flexDirection:"row", gap:8, marginBottom:8 }}>
              <View style={{ flex:1, borderRadius:10, paddingVertical:10, paddingHorizontal:12,
                backgroundColor:activeAgent.color+"18", borderWidth:1, borderColor:activeAgent.color+"55" }}>
                <Text style={{ color:activeAgent.color, fontWeight:"700" }}>
                  {formatMessage(tc("agentIsRunning"), { name: agentLabel(activeAgent.name) })}
                </Text>
              </View>
              <TouchableOpacity onPress={() => onStopAgent(activeAgent.name)}
                style={{ borderRadius:10, paddingHorizontal:14, paddingVertical:10,
                  backgroundColor:shade("#1e1010"), borderWidth:1, borderColor:shade("#ef444444") }}>
                <Text style={{ color:shade("#ef4444"), fontWeight:"700", fontSize:12 }}>{tc("sasStop")}</Text>
              </TouchableOpacity>
            </View>
          ))}
          <TouchableOpacity onPress={onOpenAgent}
            style={{ borderRadius:10, paddingVertical:10, alignItems:"center",
              backgroundColor:shade("#1a1030"), borderWidth:1, borderColor:shade("#a855f744") }}>
            <Text style={{ color:shade("#d8b4fe"), fontWeight:"700", fontSize:12 }}>
              {activeAgents.length > 0 ? tc("slotSwitchAgent") : tc("slotStartAgent")}
            </Text>
          </TouchableOpacity>

          <Text style={{ color:shade("#6366f1"), fontSize:10, fontWeight:"800", letterSpacing:1.2,
            textTransform:"uppercase", marginTop:16, marginBottom:8 }}>{tc("gasSettings")}</Text>
          {activeGas ? (
            <View style={{ flexDirection:"row", gap:8, marginBottom:8 }}>
              <View style={{ flex:1, borderRadius:10, paddingVertical:10, paddingHorizontal:12,
                backgroundColor:shade("#6366f118"), borderWidth:1, borderColor:shade("#6366f155") }}>
                <Text style={{ color:shade("#a5b4fc"), fontWeight:"700", fontSize:12 }}>
                  FGF {activeGas.fgf}L/min{activeGas.carrierGas ? ` - ${displayClinicalCode("carrierGas", activeGas.carrierGas, language, { label: activeGas.carrierGas })}` : ""} - FiO2 {activeGas.fio2}%
                </Text>
              </View>
              <TouchableOpacity onPress={onStopGas}
                style={{ borderRadius:10, paddingHorizontal:14, paddingVertical:10,
                  backgroundColor:shade("#1e1010"), borderWidth:1, borderColor:shade("#ef444444") }}>
                <Text style={{ color:shade("#ef4444"), fontWeight:"700", fontSize:12 }}>{tc("sasStop")}</Text>
              </TouchableOpacity>
            </View>
          ) : null}
          <TouchableOpacity onPress={onOpenGas}
            style={{ borderRadius:10, paddingVertical:10, alignItems:"center",
              backgroundColor:shade("#1a1a30"), borderWidth:1, borderColor:shade("#6366f144") }}>
            <Text style={{ color:shade("#a5b4fc"), fontWeight:"700", fontSize:12 }}>
              {activeGas ? tc("gasEditTitle") : tc("gasStartTitle")}
            </Text>
          </TouchableOpacity>
        </>
      )}
    </Sheet>
  )
}
