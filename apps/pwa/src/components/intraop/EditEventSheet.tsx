import { Text, TextInput, TouchableOpacity, View } from "react-native"
import type { LogEvent } from "@/lib/intraop-log-event"
import { Sheet } from "./Sheet"

type Props = {
  visible: boolean
  event: LogEvent | null
  dose: string
  time: string
  onClose: () => void
  onDoseChange: (value: string) => void
  onTimeChange: (value: string) => void
  onConfirm: () => void
}

export function EditEventSheet({
  visible,
  event,
  dose,
  time,
  onClose,
  onDoseChange,
  onTimeChange,
  onConfirm,
}: Props) {
  return (
    <Sheet visible={visible} onClose={onClose} title={`Edit ${event?.name ?? "event"}`}>
      {event && (
        <View style={{ gap:14 }}>
          <View>
            {event.type === "drug" && (
              <>
                <Text style={{ color:"#94a3b8", fontSize:11, fontWeight:"700", letterSpacing:1,
                  textTransform:"uppercase", marginBottom:8 }}>Dose ({event.unit})</Text>
                <TextInput
                  style={{ backgroundColor:"#111111", color:"#fff", borderRadius:10, padding:12,
                    fontSize:22, borderWidth:1, borderColor:"#3e3e3e", textAlign:"center" }}
                  keyboardType="decimal-pad"
                  value={dose}
                  onChangeText={onDoseChange}
                />
              </>
            )}
          </View>
          <View>
            <Text style={{ color:"#94a3b8", fontSize:11, fontWeight:"700", letterSpacing:1,
              textTransform:"uppercase", marginBottom:8 }}>Time (HH:MM)</Text>
            <TextInput
              style={{ backgroundColor:"#111111", color:"#fff", borderRadius:10, padding:12,
                fontSize:22, borderWidth:1, borderColor:"#3e3e3e", textAlign:"center" }}
              placeholder="e.g. 09:15"
              placeholderTextColor="#475569"
              value={time}
              onChangeText={onTimeChange}
            />
          </View>
          <TouchableOpacity onPress={onConfirm}
            style={{ backgroundColor:"#2563eb", borderRadius:12, padding:16, alignItems:"center" }}>
            <Text style={{ color:"#fff", fontWeight:"700", fontSize:15 }}>Save changes</Text>
          </TouchableOpacity>
        </View>
      )}
    </Sheet>
  )
}
