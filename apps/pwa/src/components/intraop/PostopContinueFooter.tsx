import { Text, TouchableOpacity, View } from "react-native"

export function PostopContinueFooter({
  continuedItems,
  continueLabel,
  onContinue,
}: {
  continuedItems: string[]
  continueLabel: string
  onContinue: () => void
}) {
  return (
    <View style={{ padding:16, backgroundColor:"#0a0f1a", borderTopWidth:1, borderTopColor:"#1e2d40" }}>
      <TouchableOpacity
        onPress={onContinue}
        style={{ backgroundColor:"#0f2a1a", borderRadius:14, padding:18, alignItems:"center",
          borderWidth:1, borderColor:"#22c55e" }}>
        <Text style={{ color:"#86efac", fontWeight:"900", fontSize:16 }}>
          {continueLabel}
        </Text>
        {continuedItems.length > 0 && (
          <Text style={{ color:"#38bdf8", fontSize:11, marginTop:4 }}>
            {continuedItems.length} item{continuedItems.length > 1 ? "s" : ""} continuing postop
          </Text>
        )}
      </TouchableOpacity>
    </View>
  )
}
