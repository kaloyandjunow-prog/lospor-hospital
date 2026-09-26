import { Pressable, ScrollView, Text, TextInput, TouchableOpacity, View } from "react-native"
import { LAB_DRAW_COLOR } from "@/components/intraop/LabDrawCell"
import { labDrawSummary, type IntraopLabDraw } from "@lospor/core/labs"
import type { EventLabel } from "@/lib/intraop-event-label"
import { formatTs } from "@/lib/intraop-format"
import type { LogEvent } from "@/lib/intraop-log-event"
import { formatMessage } from "@/i18n/locale"
import { usePreferences } from "@/lib/preferences-context"
import { useShade } from "@/theme/shade"

type Props = {
  log: LogEvent[]
  /** Lab draws, listed with the events by time (they are not log events). */
  labDraws?: IntraopLabDraw[]
  onOpenLabs?: (takenAt: string) => void
  selectedComplications: string[]
  complicationsNotes: string
  onComplicationsNotesChange: (text: string) => void
  onComplicationsNotesBlur: () => void
  onOpenComplications: () => void
  onEventActions: (event: LogEvent) => void
  onPromptDelete: (event: LogEvent) => void
  eventLabel: (event: LogEvent, previousVital?: LogEvent) => EventLabel
  previousVitalFor: (index: number) => LogEvent | undefined
}

export function IntraopEventsTab({
  log,
  labDraws = [],
  onOpenLabs,
  selectedComplications,
  complicationsNotes,
  onComplicationsNotesChange,
  onComplicationsNotesBlur,
  onOpenComplications,
  onEventActions,
  onPromptDelete,
  eventLabel,
  previousVitalFor,
}: Props) {
  const shade = useShade()
  const { tc } = usePreferences()
  return (
    <ScrollView style={{ flex:1 }} contentContainerStyle={{ padding:16, paddingBottom:40 }}>
      <Text style={{ color:shade("#94a3b8"), fontSize:10, fontWeight:"700", letterSpacing:1.2,
        textTransform:"uppercase", marginBottom:10 }}>{tc("eventLog")}</Text>
      {log.length === 0 && labDraws.length === 0 ? (
        <View style={{ alignItems:"center", paddingTop:40, paddingBottom:20 }}>
          <Text style={{ color:shade("#475569"), fontSize:14 }}>{tc("noEventsYet")}</Text>
        </View>
      ) : mergeLogWithLabDraws(log, labDraws).map(entry => {
        if (entry.kind === "lab") {
          const draw = entry.draw
          return (
            <TouchableOpacity key={`lab-${draw.takenAt}`} testID="event-log-lab-draw"
              onPress={() => onOpenLabs?.(draw.takenAt)}
              style={{ flexDirection:"row", alignItems:"center", paddingVertical:11,
                borderBottomWidth:1, borderBottomColor:shade("#1a2030") }}>
              <Text style={{ color:shade("#64748b"), fontSize:11, width:42,
                fontVariant:["tabular-nums"] }}>{formatTs(draw.takenAt)}</Text>
              <View style={{ width:3, height:36, borderRadius:2, backgroundColor:LAB_DRAW_COLOR, marginHorizontal:12 }} />
              <View style={{ flex:1 }}>
                <Text style={{ color:shade("#e2e8f0"), fontSize:13, fontWeight:"600" }}>
                  {formatMessage(tc("labsPill"), { count: draw.results.length })}
                </Text>
                <Text style={{ color:shade("#94a3b8"), fontSize:11, marginTop:1 }} numberOfLines={2}>{labDrawSummary(draw)}</Text>
              </View>
            </TouchableOpacity>
          )
        }
        const { ev, idx } = entry
        const prev = ev.type === "vital" ? previousVitalFor(idx) : undefined
        const { text, color, sub } = eventLabel(ev, prev)
        return (
          <TouchableOpacity key={ev.id}
            onLongPress={() => onEventActions(ev)}
            style={{ flexDirection:"row", alignItems:"center", paddingVertical:11,
              borderBottomWidth:1, borderBottomColor:shade("#1a2030") }}>
            <Text style={{ color:shade("#64748b"), fontSize:11, width:42,
              fontVariant:["tabular-nums"] }}>{formatTs(ev.ts)}</Text>
            <View style={{ width:3, height:36, borderRadius:2, backgroundColor:color, marginHorizontal:12 }} />
            <View style={{ flex:1 }}>
              <Text style={{ color:shade("#e2e8f0"), fontSize:13, fontWeight:"600" }}>{text}</Text>
              {!!sub && <Text style={{ color:shade("#94a3b8"), fontSize:11, marginTop:1 }}>{sub}</Text>}
            </View>
            <Pressable
              onPress={() => onPromptDelete(ev)}
              hitSlop={12}
              style={{ paddingHorizontal:8, paddingVertical:4 }}
            >
              <Text style={{ color:shade("#475569"), fontSize:18, fontWeight:"300" }}>✕</Text>
            </Pressable>
          </TouchableOpacity>
        )
      })}

      <View style={{ height:1, backgroundColor:shade("#1a2030"), marginTop:16, marginBottom:16 }} />

      <View style={{ marginBottom:8 }}>
        <View style={{ flexDirection:"row", alignItems:"center", justifyContent:"space-between",
          marginBottom:10 }}>
          <Text style={{ color:shade("#94a3b8"), fontSize:10, fontWeight:"700", letterSpacing:1.2,
            textTransform:"uppercase" }}>{tc("complicationsTitle")}</Text>
          <View style={{ flexDirection:"row", gap:8, alignItems:"center" }}>
            {selectedComplications.length > 0 && (
              <View style={{ paddingHorizontal:8, paddingVertical:3, borderRadius:8,
                backgroundColor:shade("#ef444422"), borderWidth:1, borderColor:shade("#ef444455") }}>
                <Text style={{ color:shade("#f87171"), fontSize:11, fontWeight:"700" }}>
                  {formatMessage(tc("selectedCount"), { count: selectedComplications.length })}
                </Text>
              </View>
            )}
            <TouchableOpacity
              onPress={onOpenComplications}
              style={{ paddingHorizontal:10, paddingVertical:5, borderRadius:8,
                backgroundColor:shade("#1e2030"), borderWidth:1, borderColor:shade("#ef444444") }}>
              <Text style={{ color:shade("#f87171"), fontSize:11, fontWeight:"700" }}>
                {selectedComplications.length > 0
                  ? `${formatMessage(tc("selectedCount"), { count: selectedComplications.length })} ->`
                  : tc("addComplication")}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
        {selectedComplications.length > 0 && (
          <View style={{ flexDirection:"row", flexWrap:"wrap", gap:6, marginBottom:10 }}>
            {selectedComplications.map(comp => (
              <View key={comp} style={{ paddingHorizontal:8, paddingVertical:5, borderRadius:8,
                backgroundColor:shade("#ef444418"), borderWidth:1, borderColor:shade("#ef444455") }}>
                <Text style={{ color:shade("#fca5a5"), fontSize:11, fontWeight:"600" }}>{comp}</Text>
              </View>
            ))}
          </View>
        )}
        <TextInput
          style={{ backgroundColor:shade("#111111"), color:shade("#e2e8f0"), borderRadius:10, padding:11,
            fontSize:13, borderWidth:1, borderColor:shade("#2a2030"), minHeight:44 }}
          placeholder={tc("additionalNotesOptional")}
          placeholderTextColor={shade("#3e3e4e")}
          multiline
          maxLength={500}
          value={complicationsNotes}
          onChangeText={onComplicationsNotesChange}
          onBlur={onComplicationsNotesBlur}
        />
      </View>
    </ScrollView>
  )
}

type EventLogEntry =
  | { kind: "event"; ev: LogEvent; idx: number }
  | { kind: "lab"; draw: IntraopLabDraw }

/** Events (newest first, as the log is kept) with lab draws slotted in by time. */
function mergeLogWithLabDraws(log: LogEvent[], draws: IntraopLabDraw[]): EventLogEntry[] {
  const entries: EventLogEntry[] = log.map((ev, idx) => ({ kind: "event", ev, idx }))
  for (const draw of draws) {
    const at = entries.findIndex(entry => entry.kind === "event" && entry.ev.ts <= draw.takenAt)
    entries.splice(at < 0 ? entries.length : at, 0, { kind: "lab", draw })
  }
  return entries
}
