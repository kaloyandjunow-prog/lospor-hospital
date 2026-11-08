import { Pressable, Text, TextInput, View } from "react-native"
import type { IntraopLabDraw } from "@lospor/core/labs"
import { intraopComplicationList, type IntraopComplicationEntry } from "@lospor/core/complication-events"
import { formatComplications } from "@lospor/core/intraop-entries"
import { displayClinicalCode } from "@/lib/clinical-display"
import type { EventLabel } from "@/lib/intraop-event-label"
import { formatTs } from "@/lib/intraop-format"
import type { LogEvent } from "@/lib/intraop-log-event"
import { formatMessage } from "@/i18n/locale"
import { usePreferences } from "@/lib/preferences-context"
import { useIntraopHeaderScroll } from "./IntraopHeaderCollapse"
import { useShade } from "@/theme/shade"
import { EventLogTimelineStream, LegacyEventLogList } from "@/components/intraop/EventLogList"
import { OverflowCueScrollView } from "@/components/intraop/OverflowCueScrollView"

type Props = {
  log: LogEvent[]
  /** Lab draws, listed with the events by time (they are not log events). */
  labDraws?: IntraopLabDraw[]
  onOpenLabs?: (takenAt: string) => void
  selectedComplications: string[]
  complicationsNotes: string
  onComplicationsNotesChange: (text: string) => void
  onComplicationsNotesBlur: () => void
  /** Deletes an item of the old line of text (cases charted before 10.1.0). */
  onRemoveLegacyComplication: (label: string) => void
  onEventActions: (event: LogEvent) => void
  onPromptDelete: (event: LogEvent) => void
  eventLabel: (event: LogEvent, previousVital?: LogEvent) => EventLabel
  previousVitalFor: (index: number) => LogEvent | undefined
  eventLogScreen?: "smart" | "legacy"
}
export function IntraopEventsTab({
  log,
  labDraws = [],
  onOpenLabs,
  selectedComplications,
  complicationsNotes,
  onComplicationsNotesChange,
  onComplicationsNotesBlur,
  onRemoveLegacyComplication,
  onEventActions,
  onPromptDelete,
  eventLabel,
  previousVitalFor,
  eventLogScreen = "smart",
}: Props) {
  const shade = useShade()
  const { tc, language } = usePreferences()
  const { onScroll, scrollEventThrottle } = useIntraopHeaderScroll()
  // One list from the timed entries in the log and the old text's items
  // (10.1.0). Added only from the timeline; deleted here, which deletes the
  // entry everywhere it shows.
  const complications = intraopComplicationList(log, formatComplications(selectedComplications, ""))
  const removeComplication = (item: IntraopComplicationEntry) => {
    const event = item.eventId ? log.find(entry => entry.id === item.eventId) : undefined
    if (event) onPromptDelete(event)
    else if (item.source === "legacy") onRemoveLegacyComplication(item.label)
  }
  const complicationTime = (item: IntraopComplicationEntry) => !item.ts
    ? tc("complicationNoTime")
    : item.endTs && item.endTs !== item.ts
      ? `${formatTs(item.ts)} · ${formatMessage(tc("complicationUntil"), { time: formatTs(item.endTs) })}`
      : item.open ? `${formatTs(item.ts)} · ${tc("complicationOpen")}` : formatTs(item.ts)
  return (
    <OverflowCueScrollView style={{ flex:1 }} scrollViewStyle={{ flex:1 }} contentContainerStyle={{ padding:16, paddingBottom:40 }} onScroll={onScroll} scrollEventThrottle={scrollEventThrottle}>
      {eventLogScreen === "legacy" ? <LegacyEventLogList log={log} labDraws={labDraws} onOpenLabs={onOpenLabs} selectedComplications={selectedComplications} onEventActions={onEventActions} onPromptDelete={onPromptDelete} eventLabel={eventLabel} previousVitalFor={previousVitalFor} tc={tc} /> : <EventLogTimelineStream log={log} labDraws={labDraws} onOpenLabs={onOpenLabs} selectedComplications={selectedComplications} onEventActions={onEventActions} onPromptDelete={onPromptDelete} eventLabel={eventLabel} previousVitalFor={previousVitalFor} tc={tc} />}

      <View style={{ height:1, backgroundColor:shade("#1a2030"), marginTop:16, marginBottom:16 }} />

      <View style={{ marginBottom:8 }}>
        <View style={{ flexDirection:"row", alignItems:"center", justifyContent:"space-between",
          marginBottom:10 }}>
          <Text style={{ color:shade("#94a3b8"), fontSize:10, fontWeight:"700", letterSpacing:1.2,
            textTransform:"uppercase" }}>{tc("complicationsSummaryTitle")}</Text>
          {complications.length > 0 && (
            <View style={{ paddingHorizontal:8, paddingVertical:3, borderRadius:8,
              backgroundColor:shade("#ef444422"), borderWidth:1, borderColor:shade("#ef444455") }}>
              <Text style={{ color:shade("#f87171"), fontSize:11, fontWeight:"700" }}>
                {formatMessage(tc("complicationsRecordedCount"), { count: complications.length })}
              </Text>
            </View>
          )}
        </View>
        {complications.map(item => (
          <View key={item.key} testID={`complication-${item.key}`} style={{ flexDirection:"row", alignItems:"center", paddingVertical:8,
            borderBottomWidth:1, borderBottomColor:shade("#1a2030") }}>
            <View style={{ width:3, height:30, borderRadius:2, backgroundColor:shade("#ef4444"), marginRight:12 }} />
            <View style={{ flex:1 }}>
              <Text style={{ color:shade("#fca5a5"), fontSize:13, fontWeight:"700" }}>
                {displayClinicalCode("complication", item.label, language, { label: item.label })}
              </Text>
              <Text style={{ color:shade("#94a3b8"), fontSize:11, marginTop:1, fontVariant:["tabular-nums"] }}>{complicationTime(item)}</Text>
            </View>
            <Pressable testID={`complication-delete-${item.key}`} accessibilityRole="button" accessibilityLabel={tc("removeEventLabel")} onPress={() => removeComplication(item)} hitSlop={8}
              style={{ minHeight:36, paddingHorizontal:8, alignItems:"center", justifyContent:"center" }}>
              <Text style={{ color:shade("#fca5a5"), fontSize:11, fontWeight:"800" }}>{tc("removeEventLabel")}</Text>
            </Pressable>
          </View>
        ))}
        <Text style={{ color:shade("#64748b"), fontSize:11, marginTop:8, marginBottom:10 }}>{tc("complicationsTimedHint")}</Text>
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
    </OverflowCueScrollView>
  )
}
