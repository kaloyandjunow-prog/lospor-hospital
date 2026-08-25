import type { ReactNode } from "react"
import { Text, View } from "react-native"
import { colors } from "@/theme/colors"

export function PreopSectionCard({ title, subtitle, children, onLayout, visible = true }: {
  title: string
  subtitle?: string
  children: ReactNode
  onLayout?: (y: number) => void
  visible?: boolean
}) {
  if (!visible) return null
  return (
    <View
      onLayout={(event) => onLayout?.(event.nativeEvent.layout.y)}
      style={{
        backgroundColor: colors.surfaceRaised,
        borderRadius: 18,
        borderCurve: "continuous",
        borderWidth: 1,
        borderColor: colors.border,
        padding: 16,
        marginBottom: 16,
      }}
    >
      <Text style={{ color: colors.textPrimary, fontSize: 21, fontWeight: "900" }}>{title}</Text>
      {subtitle ? <Text style={{ color: colors.textMuted, fontSize: 12, lineHeight: 17, marginTop: 4, marginBottom: 12 }}>{subtitle}</Text> : <View style={{ height: 10 }} />}
      {children}
    </View>
  )
}
