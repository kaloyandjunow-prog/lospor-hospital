import { useState } from "react"
import { View, Text, TouchableOpacity, ActivityIndicator } from "react-native"
import { colors, withAlpha } from "@/theme/colors"

export function WatchingOverlay({ onTakeover }: { onTakeover: () => Promise<void> }) {
  const [confirming, setConfirming] = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleConfirm() {
    setLoading(true)
    try { await onTakeover() } finally { setLoading(false); setConfirming(false) }
  }

  return (
    <View style={{
      backgroundColor: withAlpha(colors.warning, "18"),
      borderBottomWidth: 1,
      borderBottomColor: withAlpha(colors.warning, "44"),
      paddingHorizontal: 16,
      paddingVertical: 12,
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
    }}>
      {confirming ? (
        <>
          <Text style={{ color: colors.warning, fontSize: 13, fontWeight: "700", flex: 1 }}>
            This will interrupt the other session. Confirm take over?
          </Text>
          {loading
            ? <ActivityIndicator color={colors.warning} />
            : (
              <View style={{ flexDirection: "row", gap: 8 }}>
                <TouchableOpacity
                  onPress={() => setConfirming(false)}
                  style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 }}
                >
                  <Text style={{ color: colors.textSecondary, fontSize: 12, fontWeight: "700" }}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleConfirm}
                  style={{ borderWidth: 1, borderColor: colors.warning, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: withAlpha(colors.warning, "22") }}
                >
                  <Text style={{ color: colors.warning, fontSize: 12, fontWeight: "900" }}>Confirm</Text>
                </TouchableOpacity>
              </View>
            )
          }
        </>
      ) : (
        <>
          <Text style={{ color: colors.warning, fontSize: 13, fontWeight: "700", flex: 1 }}>
            ⚠ Being edited on another device — watching mode.
          </Text>
          <TouchableOpacity
            onPress={() => setConfirming(true)}
            style={{ borderWidth: 1, borderColor: colors.warning, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 }}
          >
            <Text style={{ color: colors.warning, fontSize: 12, fontWeight: "900" }}>Take over</Text>
          </TouchableOpacity>
        </>
      )}
    </View>
  )
}
