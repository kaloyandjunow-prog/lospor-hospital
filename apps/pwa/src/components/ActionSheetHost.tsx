import { useSyncExternalStore } from "react"
import { Modal, Text, Pressable, TouchableOpacity } from "react-native"
import {
  subscribeActionSheet,
  getActionSheetSnapshot,
  dismissActionSheet,
  type SheetAction,
} from "@/lib/action-sheet-store"
import { colors } from "@/theme/colors"

// Web-only in-app action sheet. On native, actionSheet() uses Alert.alert and
// this host stays idle (snapshot never set). Mounted once in the root layout.
export function ActionSheetHost() {
  const req = useSyncExternalStore(subscribeActionSheet, getActionSheetSnapshot, getActionSheetSnapshot)
  if (!req) return null

  const run = (action: SheetAction) => {
    dismissActionSheet()
    action.onPress?.()
  }

  const cancelAction = req.actions.find((a) => a.cancel)
  const mainActions = req.actions.filter((a) => !a.cancel)

  return (
    <Modal visible transparent animationType="fade" onRequestClose={dismissActionSheet}>
      <Pressable
        style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.65)", justifyContent: "flex-end" }}
        onPress={dismissActionSheet}
      >
        <Pressable
          style={{
            backgroundColor: colors.surfaceRaised,
            borderTopLeftRadius: 22,
            borderTopRightRadius: 22,
            padding: 18,
            paddingBottom: 36,
            alignSelf: "center",
            width: "100%",
            maxWidth: 430,
          }}
          onPress={() => {}}
        >
          {req.title ? (
            <Text style={{ color: colors.textPrimary, fontSize: 16, fontWeight: "800", marginBottom: req.message ? 4 : 14 }}>
              {req.title}
            </Text>
          ) : null}
          {req.message ? (
            <Text style={{ color: colors.textSecondary, fontSize: 13, marginBottom: 14 }}>{req.message}</Text>
          ) : null}

          {mainActions.map((a, i) => (
            <TouchableOpacity
              key={`${a.label}-${i}`}
              onPress={() => run(a)}
              style={{
                paddingVertical: 14,
                paddingHorizontal: 12,
                borderRadius: 12,
                backgroundColor: colors.surfacePressed,
                marginBottom: 8,
              }}
            >
              <Text
                style={{
                  color: a.destructive ? colors.danger : colors.textPrimary,
                  fontSize: 15,
                  fontWeight: "700",
                  textAlign: "center",
                }}
              >
                {a.label}
              </Text>
            </TouchableOpacity>
          ))}

          <TouchableOpacity
            onPress={() => (cancelAction ? run(cancelAction) : dismissActionSheet())}
            style={{ paddingVertical: 14, paddingHorizontal: 12, borderRadius: 12, marginTop: 4 }}
          >
            <Text style={{ color: colors.textMuted, fontSize: 15, fontWeight: "700", textAlign: "center" }}>
              {cancelAction?.label ?? "Cancel"}
            </Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  )
}
