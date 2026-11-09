import React from "react"
import { Text, TouchableOpacity, View } from "react-native"
import { useShade } from "@/theme/shade"
import { inlineSheet, useInlineSheet } from "./inline-sheet"

/**
 * Under a card row: the controls of the sheet that row opened (10.2.0), drawn
 * in place with the sheet's own title, body and Administer footer. Empty
 * unless this row holds the slot.
 */
export function InlineSheetSlot({ id }: { id: string }) {
  const shade = useShade()
  const slot = useInlineSheet()
  if (slot.id !== id || !slot.node) return null
  return (
    <View testID="card-inline-dose" style={{ marginTop: 10, borderRadius: 12, borderWidth: 1, borderColor: shade("#334155"), backgroundColor: shade("#141414"), padding: 12 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <Text style={{ color: shade("#f8fafc"), fontSize: 14, fontWeight: "700", flex: 1 }}>{slot.title}</Text>
        <TouchableOpacity testID="card-inline-fold" onPress={() => inlineSheet.fold()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={{ color: shade("#94a3b8"), fontSize: 18 }}>✕</Text>
        </TouchableOpacity>
      </View>
      {slot.node}
      {slot.footer ? <View testID="card-inline-footer" style={{ marginTop: 10 }}>{slot.footer}</View> : null}
    </View>
  )
}

