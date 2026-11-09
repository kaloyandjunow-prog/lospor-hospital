import React, { useEffect } from "react"
import { View, Text, Modal, TouchableOpacity, Pressable, KeyboardAvoidingView, Platform, useWindowDimensions } from "react-native"
import { useShade } from "@/theme/shade"
import { inlineSheet, useInlineSheetId } from "./inline-sheet"
import { OverflowCueScrollView } from "./OverflowCueScrollView"

export function Sheet({ visible, onClose, title, children, footer, full, allowInline = true }: {
  visible: boolean; onClose: () => void; title: string
  children: React.ReactNode; footer?: React.ReactNode; full?: boolean
  /** False for a sheet that is itself the card the controls open inside. */
  allowInline?: boolean
}) {
  const shade = useShade()
  // A suggestion card's row holds the slot while its controls are open (10.2.0):
  // this sheet then draws under that row instead of opening a modal.
  const heldBy = useInlineSheetId()
  const inline = allowInline && visible && heldBy !== null
  useEffect(() => { if (inline) inlineSheet.publish({ node: children, title, footer, close: onClose }) })
  useEffect(() => { if (allowInline && !visible) inlineSheet.release() }, [allowInline, visible])
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
  if (inline) return null
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
          backgroundColor:shade("#1c1c1c"), borderTopLeftRadius:22, borderTopRightRadius:22,
          padding:20, paddingBottom:44, maxHeight: full ? "92%" : "72%",
          width: sheetWidth,
          ...(Platform.OS === "web" ? { marginLeft: sheetMarginLeft } : { alignSelf: "center" }),
        }}>
          <View testID="sheet-header" style={{ flexDirection:"row", justifyContent:"space-between", alignItems:"center", marginBottom:18 }}>
            <Text style={{ color:shade("#f8fafc"), fontSize:16, fontWeight:"700" }}>{title}</Text>
            <TouchableOpacity onPress={onClose} hitSlop={{ top:8, bottom:8, left:8, right:8 }}>
              <Text style={{ color:shade("#94a3b8"), fontSize:20 }}>✕</Text>
            </TouchableOpacity>
          </View>
          <OverflowCueScrollView
            testID="sheet-scroll"
            style={{ flexShrink: 1 }}
            scrollViewStyle={{ flexShrink: 1 }}
            contentContainerStyle={footer ? { paddingBottom: 12 } : undefined}
            keyboardShouldPersistTaps="handled"
          >
            {children}
          </OverflowCueScrollView>
          {footer ? <View testID="sheet-footer">{footer}</View> : null}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  )
}
