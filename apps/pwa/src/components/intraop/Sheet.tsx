import React from "react"
import { View, Text, Modal, TouchableOpacity, ScrollView, Pressable, KeyboardAvoidingView, Platform, useWindowDimensions } from "react-native"

export function Sheet({ visible, onClose, title, children, full }: {
  visible: boolean; onClose: () => void; title: string
  children: React.ReactNode; full?: boolean
}) {
  const { width: screenWidth } = useWindowDimensions()
  // Cap width at 430 on wide screens; on phones this is just screenWidth.
  const sheetWidth = Math.min(screenWidth, 430)
  // On web, alignSelf:"center" positions relative to the layout parent width, which can be
  // wider than the viewport if a horizontal FlatList has expanded the document. Use explicit
  // marginLeft instead — it's always relative to the element's own layout container.
  // On native the standard alignSelf:"center" works correctly.
  const sheetMarginLeft = Platform.OS === "web" && sheetWidth < screenWidth
    ? (screenWidth - sheetWidth) / 2
    : 0
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      {/* Android already resizes the window under the keyboard (Expo's default
          softwareKeyboardLayoutMode is "resize"). Adding behavior="height" here
          made this view ALSO shrink by the keyboard height, and inside a Modal
          the two adjustments fought and oscillated — the sheet visibly bounced
          up and down while a field was focused. Passing no behavior on Android
          lets the native resize handle it alone; iOS still needs "padding". */}
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex:1 }}>
        <Pressable style={{ flex:1, backgroundColor:"rgba(0,0,0,0.65)" }} onPress={onClose} />
        <View style={{
          backgroundColor:"#1c1c1c", borderTopLeftRadius:22, borderTopRightRadius:22,
          padding:20, paddingBottom:44, maxHeight: full ? "92%" : "72%",
          width: sheetWidth,
          ...(Platform.OS === "web" ? { marginLeft: sheetMarginLeft } : { alignSelf: "center" }),
        }}>
          <View style={{ flexDirection:"row", justifyContent:"space-between", alignItems:"center", marginBottom:18 }}>
            <Text style={{ color:"#f8fafc", fontSize:16, fontWeight:"700" }}>{title}</Text>
            <TouchableOpacity onPress={onClose} hitSlop={{ top:8, bottom:8, left:8, right:8 }}>
              <Text style={{ color:"#94a3b8", fontSize:20 }}>✕</Text>
            </TouchableOpacity>
          </View>
          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            {children}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  )
}
