import { Text, TouchableOpacity, View } from "react-native"
import { Sheet } from "./Sheet"

export type EndCaseCleanupItem = {
  key: string
  label: string
  sublabel: string
  color: string
  onStop: () => void | Promise<void>
}

type Props = {
  visible: boolean
  onClose: () => void
  items: EndCaseCleanupItem[]
  decisions: Record<string, "stop" | "continue">
  continueLabel: string
  onDecision: (key: string, decision: "stop" | "continue") => void
  onFinalize: (continuedItems: string[]) => void
}

export function EndCaseSheet({
  visible,
  onClose,
  items,
  decisions,
  continueLabel,
  onDecision,
  onFinalize,
}: Props) {
  const allDecided = items.length === 0 || items.every(item => !!decisions[item.key])
  return (
    <Sheet visible={visible} onClose={onClose} title="End case" full>
      <Text style={{ color:"#94a3b8", fontSize:13, marginBottom:16 }}>
        {items.length === 0
          ? "No active items - ready to finalise."
          : "Choose what to do with each active item, then finalise."}
      </Text>
      {items.map(item => {
        const dec = decisions[item.key]
        return (
          <View key={item.key} style={{ marginBottom:10,
            backgroundColor:item.color+"1a", borderRadius:12, padding:12,
            borderWidth:1, borderColor:item.color+"44" }}>
            <View style={{ marginBottom:8 }}>
              <Text style={{ color:item.color, fontWeight:"700" }}>{item.label}</Text>
              <Text style={{ color:"#94a3b8", fontSize:11 }}>{item.sublabel}</Text>
            </View>
            <View style={{ flexDirection:"row", gap:8 }}>
              <TouchableOpacity
                onPress={() => onDecision(item.key, "stop")}
                style={{ flex:1, paddingVertical:8, borderRadius:8, alignItems:"center",
                  backgroundColor: dec === "stop" ? "#2a0a0a" : "#1c1c1c",
                  borderWidth:1, borderColor: dec === "stop" ? "#ef4444" : "#ef444433" }}>
                <Text style={{ color: dec === "stop" ? "#ef4444" : "#64748b",
                  fontWeight:"700", fontSize:13 }}>Stop</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => onDecision(item.key, "continue")}
                style={{ flex:1, paddingVertical:8, borderRadius:8, alignItems:"center",
                  backgroundColor: dec === "continue" ? "#0a1f2a" : "#1c1c1c",
                  borderWidth:1, borderColor: dec === "continue" ? "#38bdf8" : "#38bdf833" }}>
                <Text style={{ color: dec === "continue" ? "#38bdf8" : "#64748b",
                  fontWeight:"700", fontSize:13 }}>Continue postop</Text>
              </TouchableOpacity>
            </View>
          </View>
        )
      })}
      {allDecided && (
        <TouchableOpacity
          onPress={async () => {
            // Run all stops concurrently instead of one full round-trip at a
            // time — each item's local optimistic update no longer needs to
            // wait for the previous item's network save to finish.
            await Promise.all(items.filter(item => decisions[item.key] === "stop").map(item => item.onStop()))
            const continued = items
              .filter(item => decisions[item.key] === "continue")
              .map(item => `${item.label} (${item.sublabel})`)
            onFinalize(continued)
          }}
          style={{ marginTop:8, backgroundColor:"#1a2e1a", borderRadius:12,
            padding:18, alignItems:"center", borderWidth:1, borderColor:"#22c55e" }}>
          <Text style={{ color:"#86efac", fontWeight:"700", fontSize:16 }}>
            {continueLabel}
          </Text>
        </TouchableOpacity>
      )}
    </Sheet>
  )
}
