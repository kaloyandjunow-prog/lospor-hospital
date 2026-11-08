import { Text, TextInput, TouchableOpacity, View } from "react-native"
import { eventSearchScore } from "@lospor/core/event-synonyms"
import type { ClinicalEventDef } from "@/lib/intraop-types"
import { usePreferences } from "@/lib/preferences-context"
import { useShade } from "@/theme/shade"
import type { EventGroup } from "./EventList"

/**
 * The event selector as it was before 10.2.0, chosen in Settings (Legacy): a search box, then every category as a
 * wrapped grid of coloured buttons, with the rest of the complications behind "Show". Search takes the same words
 * colleagues use as the new list does.
 */
export function LegacyEventList({ groups, search, onSearch, onSelect, label, complicationExpanded, onToggleComplications }: {
  groups: readonly EventGroup[]
  search: string
  onSearch: (value: string) => void
  onSelect: (event: ClinicalEventDef, isComplication: boolean) => void
  label: (event: ClinicalEventDef, isComplication: boolean) => string
  complicationExpanded: boolean
  onToggleComplications: () => void
}) {
  const shade = useShade()
  const { tc } = usePreferences()
  // The complication systems are one button away, as they were.
  const shown = groups.filter(group => !group.key.startsWith("complications:") || complicationExpanded)
  return (
    <>
      <TextInput
        style={{ backgroundColor:shade("#111820"), color:shade("#f8fafc"), borderRadius:10, paddingHorizontal:12, paddingVertical:9,
          fontSize:13, borderWidth:1, borderColor:shade("#1e2d40"), marginBottom:12 }}
        placeholder={tc("sasSearchEvents")}
        placeholderTextColor={shade("#475569")}
        value={search}
        onChangeText={onSearch}
        autoCapitalize="none"
        autoCorrect={false}
      />

      {shown.map(group => {
        const visibleEvents = group.events.filter(ev => !search || eventSearchScore(search, ev.label, [label(ev, group.isComplication)]) != null)
        if (visibleEvents.length === 0 && (search || !group.toggle)) return null
        return (
          <View key={group.key} style={{ marginBottom:14 }}>
            <View style={{ flexDirection:"row", alignItems:"center", marginBottom:6 }}>
              <Text style={{ color: group.color, fontSize:9, fontWeight:"800", letterSpacing:1.2,
                textTransform:"uppercase", flex:1 }}>{group.title}</Text>
              {group.toggle && (
                <TouchableOpacity onPress={onToggleComplications}>
                  <Text style={{ color:shade("#64748b"), fontSize:9, fontWeight:"700" }}>
                    {complicationExpanded ? tc("hide") : tc("show")}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
            <View style={{ flexDirection:"row", flexWrap:"wrap", gap:7 }}>
              {visibleEvents.map(ev => (
                <TouchableOpacity key={ev.label} onPress={() => onSelect(ev, group.isComplication)}
                  style={{ paddingHorizontal:11, paddingVertical:8, borderRadius:10,
                    backgroundColor:ev.color+"18", borderWidth:1, borderColor:ev.color+"55" }}>
                  <Text style={{ color:ev.color, fontSize:11, fontWeight:"700" }}>{label(ev, group.isComplication)}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )
      })}
    </>
  )
}
