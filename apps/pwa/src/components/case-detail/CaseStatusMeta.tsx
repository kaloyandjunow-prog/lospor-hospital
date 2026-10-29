import { Text, View } from "react-native"
import { colors, withAlpha } from "@/theme/colors"

export function CaseStatusMeta({ statusLabel, statusColor, caseCode, cancelledText, theatreName, institutionName, institutionCity }: {
  statusLabel: string
  statusColor: string
  caseCode?: string | null
  cancelledText?: string
  theatreName?: string | null
  institutionName?: string | null
  institutionCity?: string | null
}) {
  return <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
    <View style={{ paddingHorizontal: 12, paddingVertical: 5, borderRadius: 999, backgroundColor: withAlpha(statusColor, "22"), borderWidth: 1, borderColor: withAlpha(statusColor, "66") }}><Text style={{ color: statusColor, fontSize: 11, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.5 }}>{statusLabel}</Text></View>
    {caseCode ? <Text style={{ color: colors.textMuted, fontSize: 12 }}>{caseCode}</Text> : null}
    {cancelledText ? <View testID="case-cancelled" style={{ backgroundColor: withAlpha(colors.danger, "18"), borderRadius: 6, borderWidth: 1, borderColor: withAlpha(colors.danger, "66"), paddingHorizontal: 8, paddingVertical: 3 }}><Text style={{ color: colors.danger, fontSize: 12, fontWeight: "900" }} numberOfLines={2}>{cancelledText}</Text></View> : null}
    {theatreName ? <View testID="case-theatre" style={{ backgroundColor: withAlpha(colors.primary, "16"), borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 }}><Text style={{ color: colors.primary, fontSize: 12, fontWeight: "800" }} numberOfLines={1}>{theatreName}</Text></View> : null}
    {institutionName ? <Text style={{ color: colors.textMuted, fontSize: 12 }} numberOfLines={1}>{institutionName}{institutionCity ? `, ${institutionCity}` : ""}</Text> : null}
  </View>
}
