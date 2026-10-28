import { View, Text } from "react-native"
import { broselowLabel, type BroselowResult } from "@lospor/core/broselow"
import { usePreferences } from "@/lib/preferences-context"
import { useShade } from "@/theme/shade"

/**
 * The child's Broselow tape colour, shown in the colour itself with its name.
 *
 * The fill is the tape's own colour, so it is not passed through `shade()`: a
 * yellow zone must stay yellow in the light theme too. The name always
 * accompanies it for anyone who cannot tell the colours apart.
 */
export function BroselowChip({ result }: { result: BroselowResult }) {
  const { tc, language } = usePreferences()
  const shade = useShade()
  const { zone } = result
  return (
    <View
      testID="broselow-chip"
      accessibilityLabel={`${tc("broselow")} ${broselowLabel(zone, language)}`}
      style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 16 }}
    >
      <View style={{
        backgroundColor: zone.hex, borderRadius: 10, borderWidth: 1, borderColor: shade("#64748b"),
        paddingHorizontal: 14, paddingVertical: 8,
      }}>
        <Text style={{ color: zone.textHex, fontSize: 15, fontWeight: "900" }}>
          {tc("broselow")} {broselowLabel(zone, language)}
        </Text>
      </View>
      <Text style={{ fontSize: 11, color: shade("#94a3b8") }}>
        {result.basis === "HEIGHT" ? tc("broselowByHeight") : tc("broselowByWeight")}
      </Text>
    </View>
  )
}
