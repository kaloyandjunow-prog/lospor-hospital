import { useState } from "react"
import { Text, TextInput, TouchableOpacity, View } from "react-native"
import { successionAutomationId, type LikelyEvent } from "@lospor/core/event-succession"
import { eventSearchScore } from "@lospor/core/event-synonyms"
import type { ClinicalEventDef } from "@/lib/intraop-types"
import { formatMessage } from "@/i18n/locale"
import { usePreferences } from "@/lib/preferences-context"
import { useShade } from "@/theme/shade"

export type EventGroup = { key: string; title: string; color: string; isComplication: boolean; toggle: boolean; events: ClinicalEventDef[] }

/**
 * The event selector (10.2.0): one quiet list. Search on top, at most two events likely to come next (only ones not yet
 * charted), then the categories, one open at a time. Complications open to the common ones and then their systems.
 * One dot of colour per category and one accent for what can be pressed; nothing wraps. Which events are likely is
 * Core's (event-succession).
 */
export function EventList({ groups, search, onSearch, onSelect, label, likely, onDismissLikely }: {
  groups: readonly EventGroup[]
  search: string
  onSearch: (value: string) => void
  onSelect: (event: ClinicalEventDef, isComplication: boolean, suggestion?: string) => void
  label: (event: ClinicalEventDef, isComplication: boolean) => string
  likely: readonly LikelyEvent[]
  onDismissLikely: (suggestionId: string) => void
}) {
  const shade = useShade()
  const { tc } = usePreferences()
  const [open, setOpen] = useState("")
  const [openSystem, setOpenSystem] = useState("")
  const categories = groups.filter(group => !group.key.startsWith("complications:"))
  const systems = groups.filter(group => group.key.startsWith("complications:"))
  const all = groups.flatMap(group => group.events.map(event => ({ event, group })))
  const q = search.trim()
  // By the names and by the words colleagues use, in English and Bulgarian, best match first.
  const found = q
    ? all.flatMap(item => { const score = eventSearchScore(q, item.event.label, [label(item.event, item.group.isComplication)]); return score == null ? [] : [{ ...item, score }] })
      .sort((a, b) => a.score - b.score).slice(0, 12)
    : []
  const likelyRows = likely.flatMap(item => {
    const hit = all.find(({ event, group }) => event.label === item.event && !group.isComplication)
    return hit ? [{ item, hit }] : []
  })
  const row = { flexDirection: "row" as const, alignItems: "center" as const, gap: 12, minHeight: 54, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: shade("#262d3a") }
  const eyebrow = (text: string) => <Text style={{ color: shade("#94a3b8"), fontSize: 11, fontWeight: "700", letterSpacing: 1, textTransform: "uppercase", marginTop: 16, marginBottom: 6, marginLeft: 2 }}>{text}</Text>
  const box = { borderWidth: 1, borderColor: shade("#262d3a"), borderRadius: 14, overflow: "hidden" as const, backgroundColor: shade("#171c26") }
  const eventRow = (event: ClinicalEventDef, group: EventGroup, indent: number, sub?: string) => (
    <TouchableOpacity key={`${group.key}:${event.label}`} testID={`event-${event.label}`} onPress={() => onSelect(event, group.isComplication)} style={[row, { paddingLeft: 14 + indent }]}>
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: group.color }} />
      <View style={{ flex: 1 }}>
        <Text style={{ color: shade("#f8fafc"), fontSize: 15, fontWeight: indent > 0 ? "500" : "600" }}>{label(event, group.isComplication)}</Text>
        {sub ? <Text style={{ color: shade("#94a3b8"), fontSize: 11.5 }}>{sub}</Text> : null}
      </View>
    </TouchableOpacity>
  )

  return (
    <View testID="event-list">
      <TextInput testID="event-search" value={search} onChangeText={onSearch} placeholder={tc("sasSearchEvents")} placeholderTextColor={shade("#475569")} autoCapitalize="none" autoCorrect={false}
        style={{ minHeight: 50, borderRadius: 14, borderWidth: 1, borderColor: shade("#262d3a"), backgroundColor: shade("#171c26"), color: shade("#f8fafc"), paddingHorizontal: 14, fontSize: 15 }} />

      {q ? (
        <>
          {eyebrow(tc("evlResults"))}
          <View style={box}>
            {found.length === 0 ? <Text testID="event-none" style={{ color: shade("#94a3b8"), padding: 14 }}>{tc("evlNone")}</Text> : found.map(({ event, group }) => eventRow(event, group, 0, group.title))}
          </View>
        </>
      ) : (
        <>
          {likelyRows.length > 0 ? (
            <>
              {eyebrow(tc("evlLikely"))}
              <View testID="event-likely" style={box}>
                {likelyRows.map(({ item, hit }) => (
                  <View key={item.event} style={[row, { paddingVertical: 8 }]}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: shade("#f8fafc"), fontSize: 15, fontWeight: "700" }}>{label(hit.event, false)}</Text>
                      <Text style={{ color: shade("#fbbf24"), fontSize: 12, fontWeight: "600" }}>{formatMessage(tc("evlUsually"), { from: item.from, percent: Math.round(item.probability * 100) })}</Text>
                    </View>
                    <TouchableOpacity testID={`likely-dismiss-${item.event}`} accessibilityLabel={tc("evlDismiss")} onPress={() => onDismissLikely(successionAutomationId(item.from, item.event))} style={{ minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center" }}>
                      <Text style={{ color: shade("#94a3b8"), fontSize: 12, fontWeight: "800" }}>{tc("evlDismiss")}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity testID={`likely-log-${item.event}`} onPress={() => onSelect(hit.event, false, successionAutomationId(item.from, item.event))}
                      style={{ minHeight: 44, paddingHorizontal: 16, borderRadius: 10, borderWidth: 1, borderColor: shade("#a67cff"), backgroundColor: shade("#a67cff") + "26", justifyContent: "center" }}>
                      <Text style={{ color: shade("#c4b0ff"), fontWeight: "800", fontSize: 13 }}>{tc("evlLog")}</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            </>
          ) : null}

          {eyebrow(tc("evlAll"))}
          <View style={box}>
            {categories.map(category => {
              const isOpen = open === category.key
              const total = category.events.length + (category.isComplication ? systems.reduce((sum, system) => sum + system.events.length, 0) : 0)
              return (
                <View key={category.key}>
                  <TouchableOpacity testID={`event-category-${category.key}`} accessibilityState={{ expanded: isOpen }} onPress={() => { setOpen(isOpen ? "" : category.key); setOpenSystem("") }} style={row}>
                    <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: category.color }} />
                    <Text style={{ color: shade("#f8fafc"), fontSize: 15, fontWeight: "700", flex: 1 }}>{category.title}</Text>
                    <Text style={{ color: shade("#94a3b8"), fontSize: 13 }}>{total} {isOpen ? "▾" : "▸"}</Text>
                  </TouchableOpacity>
                  {isOpen ? (
                    <View style={{ backgroundColor: shade("#1b2230") }}>
                      {category.events.map(event => eventRow(event, category, 20))}
                      {category.isComplication ? systems.map(system => {
                        const systemOpen = openSystem === system.key
                        return (
                          <View key={system.key}>
                            <TouchableOpacity testID={`event-system-${system.key}`} accessibilityState={{ expanded: systemOpen }} onPress={() => setOpenSystem(systemOpen ? "" : system.key)} style={[row, { minHeight: 48, paddingLeft: 34 }]}>
                              <Text style={{ color: shade("#e2e8f0"), fontSize: 13.5, fontWeight: "700", flex: 1 }}>{system.title}</Text>
                              <Text style={{ color: shade("#94a3b8"), fontSize: 13 }}>{system.events.length} {systemOpen ? "▾" : "▸"}</Text>
                            </TouchableOpacity>
                            {systemOpen ? system.events.map(event => eventRow(event, system, 48)) : null}
                          </View>
                        )
                      }) : null}
                    </View>
                  ) : null}
                </View>
              )
            })}
          </View>
        </>
      )}
    </View>
  )
}
