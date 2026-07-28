import { Text, TextInput, TouchableOpacity } from "react-native"
import { colors } from "@/theme/colors"
import { Sheet } from "./Sheet"

type Props = {
  visible: boolean
  value: string
  onClose: () => void
  onChange: (value: string) => void
  onStart: (value: string) => void
}

function formatStartInput(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 4)
  if (digits.length <= 2) return digits
  return `${digits.slice(0, 2)}:${digits.slice(2)}`
}

export function StartAtSheet({ visible, value, onClose, onChange, onStart }: Props) {
  const canStart = value.length >= 5
  return (
    <Sheet visible={visible} onClose={onClose} title="Start at...">
      <Text style={{ color:colors.textSecondary, fontSize:13, marginBottom:16 }}>
        Enter the time the anaesthesia actually started. The timetable will open from that time and the current time will be highlighted as "now".
      </Text>
      <Text style={{ color:colors.textMuted, fontSize:10, fontWeight:"700", letterSpacing:1.1,
        textTransform:"uppercase", marginBottom:8 }}>Start time (HH:MM)</Text>
      <TextInput
        style={{ backgroundColor:"#111111", color:"#a5b4fc", borderRadius:12, padding:16,
          fontSize:36, fontWeight:"200", borderWidth:1, borderColor:"#6366f166",
          textAlign:"center", fontVariant:["tabular-nums"], marginBottom:16, letterSpacing:4 }}
        value={value}
        onChangeText={next => onChange(formatStartInput(next))}
        placeholder="HH:MM"
        placeholderTextColor="#334155"
        keyboardType="number-pad"
        maxLength={5}
        autoFocus
      />
      <TouchableOpacity
        onPress={() => onStart(value)}
        disabled={!canStart}
        style={{ backgroundColor: canStart ? "#1e1a40" : "#111111",
          borderRadius:14, padding:18, alignItems:"center",
          borderWidth:1, borderColor: canStart ? "#6366f1" : "#1e2d40" }}>
        <Text style={{ color: canStart ? "#a5b4fc" : "#334155",
          fontWeight:"900", fontSize:16 }}>
          Start case at {value || "-"}
        </Text>
      </TouchableOpacity>
    </Sheet>
  )
}
