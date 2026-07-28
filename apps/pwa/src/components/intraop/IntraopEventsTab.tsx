import { Pressable, ScrollView, Text, TextInput, TouchableOpacity, View } from "react-native"
import type { EventLabel } from "@/lib/intraop-event-label"
import { formatTs } from "@/lib/intraop-format"
import type { LogEvent } from "@/lib/intraop-log-event"

type Props = {
  log: LogEvent[]
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
  return (
    <ScrollView style={{ flex:1 }} contentContainerStyle={{ padding:16, paddingBottom:40 }}>
      <Text style={{ color:"#94a3b8", fontSize:10, fontWeight:"700", letterSpacing:1.2,
        textTransform:"uppercase", marginBottom:10 }}>Event log</Text>
      {log.length === 0 ? (
        <View style={{ alignItems:"center", paddingTop:40, paddingBottom:20 }}>
          <Text style={{ color:"#475569", fontSize:14 }}>No events recorded yet.</Text>
        </View>
      ) : log.map((ev, idx) => {
        const prev = ev.type === "vital" ? previousVitalFor(idx) : undefined
        const { text, color, sub } = eventLabel(ev, prev)
        return (
          <TouchableOpacity key={ev.id}
            onLongPress={() => onEventActions(ev)}
            style={{ flexDirection:"row", alignItems:"center", paddingVertical:11,
              borderBottomWidth:1, borderBottomColor:"#1a2030" }}>
            <Text style={{ color:"#64748b", fontSize:11, width:42,
              fontVariant:["tabular-nums"] }}>{formatTs(ev.ts)}</Text>
            <View style={{ width:3, height:36, borderRadius:2, backgroundColor:color, marginHorizontal:12 }} />
            <View style={{ flex:1 }}>
              <Text style={{ color:"#e2e8f0", fontSize:13, fontWeight:"600" }}>{text}</Text>
              {!!sub && <Text style={{ color:"#94a3b8", fontSize:11, marginTop:1 }}>{sub}</Text>}
            </View>
            <Pressable
              onPress={() => onPromptDelete(ev)}
              hitSlop={12}
              style={{ paddingHorizontal:8, paddingVertical:4 }}
            >
              <Text style={{ color:"#475569", fontSize:18, fontWeight:"300" }}>x</Text>
            </Pressable>
          </TouchableOpacity>
        )
      })}

      <View style={{ height:1, backgroundColor:"#1a2030", marginTop:16, marginBottom:16 }} />

      <View style={{ marginBottom:8 }}>
        <View style={{ flexDirection:"row", alignItems:"center", justifyContent:"space-between",
          marginBottom:10 }}>
          <Text style={{ color:"#94a3b8", fontSize:10, fontWeight:"700", letterSpacing:1.2,
            textTransform:"uppercase" }}>Complications</Text>
          <View style={{ flexDirection:"row", gap:8, alignItems:"center" }}>
            {selectedComplications.length > 0 && (
              <View style={{ paddingHorizontal:8, paddingVertical:3, borderRadius:8,
                backgroundColor:"#ef444422", borderWidth:1, borderColor:"#ef444455" }}>
                <Text style={{ color:"#f87171", fontSize:11, fontWeight:"700" }}>
                  {selectedComplications.length} selected
                </Text>
              </View>
            )}
            <TouchableOpacity
              onPress={onOpenComplications}
              style={{ paddingHorizontal:10, paddingVertical:5, borderRadius:8,
                backgroundColor:"#1e2030", borderWidth:1, borderColor:"#ef444444" }}>
              <Text style={{ color:"#f87171", fontSize:11, fontWeight:"700" }}>
                {selectedComplications.length > 0 ? `${selectedComplications.length} selected ->` : "+ Add complication"}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
        {selectedComplications.length > 0 && (
          <View style={{ flexDirection:"row", flexWrap:"wrap", gap:6, marginBottom:10 }}>
            {selectedComplications.map(comp => (
              <View key={comp} style={{ paddingHorizontal:8, paddingVertical:5, borderRadius:8,
                backgroundColor:"#ef444418", borderWidth:1, borderColor:"#ef444455" }}>
                <Text style={{ color:"#fca5a5", fontSize:11, fontWeight:"600" }}>{comp}</Text>
              </View>
            ))}
          </View>
        )}
        <TextInput
          style={{ backgroundColor:"#111111", color:"#e2e8f0", borderRadius:10, padding:11,
            fontSize:13, borderWidth:1, borderColor:"#2a2030", minHeight:44 }}
          placeholder="Additional notes (optional)"
          placeholderTextColor="#3e3e4e"
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
