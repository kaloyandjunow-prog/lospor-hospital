import { Text, TouchableOpacity, View } from "react-native"
import { usePreferences } from "@/lib/preferences-context"
import { formatMessage } from "@/i18n/locale"
import { useShade } from "@/theme/shade"

export function PostopContinueFooter({
  continuedItems,
  continueLabel,
  onContinue,
}: {
  continuedItems: string[]
  continueLabel: string
  onContinue: () => void
}) {
  const shade = useShade()
  const { tc } = usePreferences()
  return (
    <View style={{ padding:16, backgroundColor:shade("#0a0f1a"), borderTopWidth:1, borderTopColor:shade("#1e2d40") }}>
      <TouchableOpacity
        onPress={onContinue}
        style={{ backgroundColor:shade("#0f2a1a"), borderRadius:14, padding:18, alignItems:"center",
          borderWidth:1, borderColor:shade("#22c55e") }}>
        <Text style={{ color:shade("#86efac"), fontWeight:"900", fontSize:16 }}>
          {continueLabel}
        </Text>
        {continuedItems.length > 0 && (
          <Text style={{ color:shade("#38bdf8"), fontSize:11, marginTop:4 }}>
            {continuedItems.length === 1
              ? tc("postopContinuingOne")
              : formatMessage(tc("postopContinuingMany"), { count: continuedItems.length })}
          </Text>
        )}
      </TouchableOpacity>
    </View>
  )
}
