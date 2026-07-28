import React, { useState } from "react"
import { View, Text, Pressable } from "react-native"
import { colors, withAlpha } from "@/theme/colors"



export function SummaryCard({
  title, children, defaultOpen = true, badge,
}: {
  title: string
  children: React.ReactNode
  defaultOpen?: boolean
  badge?: string | number
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <View style={{
      backgroundColor: colors.surfaceRaised, borderRadius: 16,
      borderWidth: 1, borderColor: colors.border, marginBottom: 12, overflow: "hidden",
    }}>
      <Pressable
        onPress={() => setOpen(v => !v)}
        style={{
          flexDirection: "row", alignItems: "center", justifyContent: "space-between",
          paddingHorizontal: 16, paddingVertical: 14,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Text style={{
            color: colors.textPrimary, fontSize: 13, fontWeight: "900",
            textTransform: "uppercase", letterSpacing: 0.8,
          }}>
            {title}
          </Text>
          {badge != null && (
            <View style={{
              backgroundColor: withAlpha(colors.primary, "22"),
              borderRadius: 999, paddingHorizontal: 7, paddingVertical: 2,
            }}>
              <Text style={{ color: colors.primary, fontSize: 11, fontWeight: "700" }}>{badge}</Text>
            </View>
          )}
        </View>
        <Text style={{ color: colors.textMuted, fontSize: 12 }}>{open ? "▼" : "▶"}</Text>
      </Pressable>
      {open && (
        <View style={{ paddingHorizontal: 16, paddingBottom: 16 }}>{children}</View>
      )}
    </View>
  )
}

export function InfoRow({
  label, value, valueColor,
}: { label: string; value?: string | null; valueColor?: string }) {
  if (!value) return null
  return (
    <View style={{
      flexDirection: "row", justifyContent: "space-between",
      alignItems: "flex-start", marginBottom: 8,
    }}>
      <Text style={{ color: colors.textMuted, fontSize: 12, flex: 1 }}>{label}</Text>
      <Text style={{
        color: valueColor ?? colors.textPrimary, fontSize: 12,
        fontWeight: "600", flex: 2, textAlign: "right",
      }}>
        {value}
      </Text>
    </View>
  )
}

export function Chip({ label, color }: { label: string; color: string }) {
  return (
    <View style={{
      paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999,
      backgroundColor: color + "22", borderWidth: 1, borderColor: color + "55",
      marginRight: 6, marginBottom: 6,
    }}>
      <Text style={{ color, fontSize: 11, fontWeight: "700" }}>{label}</Text>
    </View>
  )
}

export function ChipRow({ children }: { children: React.ReactNode }) {
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", marginTop: 4 }}>
      {children}
    </View>
  )
}

export function Divider() {
  return <View style={{ height: 1, backgroundColor: colors.border, marginVertical: 10 }} />
}


export function AldreteRow({
  label, value, descriptions,
}: { label: string; value?: number; descriptions: [string, string, string] }) {
  const score = value ?? 0
  const desc = descriptions[score] ?? ""
  const scoreColor = score === 2 ? colors.success : score === 1 ? colors.warning : colors.danger
  return (
    <View style={{
      flexDirection: "row", alignItems: "center", justifyContent: "space-between",
      paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border,
    }}>
      <View style={{ flex: 1 }}>
        <Text style={{ color: colors.textSecondary, fontSize: 12, fontWeight: "600" }}>{label}</Text>
        <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 1 }}>{desc}</Text>
      </View>
      <View style={{
        width: 32, height: 32, borderRadius: 999, alignItems: "center", justifyContent: "center",
        backgroundColor: withAlpha(scoreColor, "22"), borderWidth: 1, borderColor: withAlpha(scoreColor, "66"),
      }}>
        <Text style={{ color: scoreColor, fontSize: 14, fontWeight: "800" }}>{score}</Text>
      </View>
    </View>
  )
}

// ─── Card 1: Preoperative ─────────────────────────────────────────────────────

