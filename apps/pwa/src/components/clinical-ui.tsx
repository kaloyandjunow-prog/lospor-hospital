import React from "react"
import { ActivityIndicator, Pressable, Text, View } from "react-native"
import { colors, withAlpha } from "@/theme/colors"

export function ScreenState({
  title,
  message,
  action,
  onAction,
  loading = false,
}: {
  title: string
  message?: string
  action?: string
  onAction?: () => void
  loading?: boolean
}) {
  return (
    <View style={{ alignItems: "center", paddingHorizontal: 28, paddingTop: 72, gap: 10 }}>
      {loading && <ActivityIndicator color={colors.primary} />}
      <Text style={{ color: colors.textPrimary, fontSize: 17, fontWeight: "700", textAlign: "center" }}>
        {title}
      </Text>
      {message ? (
        <Text style={{ color: colors.textMuted, fontSize: 13, textAlign: "center", lineHeight: 18 }}>
          {message}
        </Text>
      ) : null}
      {action && onAction ? (
        <Pressable
          onPress={onAction}
          style={{
            marginTop: 8,
            borderRadius: 12,
            borderCurve: "continuous",
            backgroundColor: colors.primarySoft,
            borderWidth: 1,
            borderColor: withAlpha(colors.primary, "66"),
            paddingHorizontal: 16,
            paddingVertical: 10,
          }}
        >
          <Text style={{ color: colors.primary, fontWeight: "700", fontSize: 13 }}>{action}</Text>
        </Pressable>
      ) : null}
    </View>
  )
}

export function WorkflowPill({
  label,
  selected,
  onPress,
}: {
  label: string
  selected: boolean
  onPress: () => void
}) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        borderRadius: 999,
        backgroundColor: selected ? colors.primarySoft : colors.surfaceRaised,
        borderWidth: 1,
        borderColor: selected ? colors.primary : colors.border,
        paddingHorizontal: 14,
        paddingVertical: 8,
      }}
    >
      <Text style={{ color: selected ? colors.textPrimary : colors.textSecondary, fontSize: 12, fontWeight: "700" }}>
        {label}
      </Text>
    </Pressable>
  )
}

export function ActionTile({
  label,
  sub,
  color = colors.primary,
  onPress,
  flex,
  disabled = false,
}: {
  label: string
  sub?: string
  color?: string
  onPress: () => void
  flex?: number
  disabled?: boolean
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => ({
        flex,
        minHeight: 56,
        borderRadius: 14,
        borderCurve: "continuous",
        backgroundColor: pressed ? colors.surfacePressed : colors.surfaceRaised,
        borderWidth: 1,
        borderColor: withAlpha(color, "66"),
        paddingHorizontal: 14,
        paddingVertical: 10,
        opacity: disabled ? 0.5 : 1,
        boxShadow: `0 10px 26px ${withAlpha(color, "18")}`,
      })}
    >
      <View style={{ position: "absolute", left: 0, top: 10, bottom: 10, width: 4, borderRadius: 999, backgroundColor: color }} />
      <Text style={{ color: colors.textPrimary, fontSize: 15, fontWeight: "800", paddingLeft: 4 }}>{label}</Text>
      {sub ? <Text style={{ color: colors.textMuted, fontSize: 11, paddingLeft: 4, marginTop: 2 }}>{sub}</Text> : null}
    </Pressable>
  )
}

export function SyncBadge({ state, detail }: { state: "saved" | "saving" | "failed" | "offline"; detail?: string }) {
  const meta = {
    saved: { label: detail ?? "Saved", color: colors.success },
    saving: { label: detail ?? "Saving...", color: colors.primary },
    failed: { label: detail ?? "Sync failed", color: colors.danger },
    offline: { label: detail ?? "Offline", color: colors.warning },
  }[state]
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start" }}>
      <View style={{ width: 7, height: 7, borderRadius: 999, backgroundColor: meta.color }} />
      <Text style={{ color: meta.color, fontSize: 12, fontWeight: "700" }}>{meta.label}</Text>
    </View>
  )
}
