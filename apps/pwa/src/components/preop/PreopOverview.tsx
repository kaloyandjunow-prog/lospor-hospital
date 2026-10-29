import { ActivityIndicator, ScrollView, Text, TouchableOpacity, View } from "react-native"
import { AppHeader } from "@/components/AppHeader"
import { EditWindowBanner } from "@/components/EditWindowBanner"
import { colors, withAlpha } from "@/theme/colors"
import type { ClinicalStringKey } from "@/lib/preferences-context"
import type { PreopSection } from "@/lib/preop-form-schema"

type Item = { key: PreopSection; label: string; done: boolean; required: boolean; summary: string }

export function PreopOverview({ tc, shade, items, finalizedAt, caseStatus, continueId, saving, onJump, onContinue }: {
  tc: (key: ClinicalStringKey) => string
  shade: (light: string) => string
  items: Item[]
  finalizedAt: string | null
  caseStatus: string | null
  continueId?: string
  saving: boolean
  onJump: (section: PreopSection) => void
  onContinue: () => void
}) {
  return <View style={{ flex: 1, backgroundColor: colors.background }}>
    <AppHeader title={tc("preopTitle")} showNewCase={false} />
    {caseStatus === "COMPLETE" && finalizedAt && <EditWindowBanner finalizedAt={finalizedAt} caseId={continueId} showBackButton />}
    <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 60 }}>
      <Text style={{ color: colors.textPrimary, fontSize: 22, fontWeight: "900", marginBottom: 4 }}>{tc("preopTitle")}</Text>
      <Text style={{ color: colors.textMuted, fontSize: 13, marginBottom: 20 }}>{tc("tapSectionHint")}</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 24 }}>{items.map(({ key, label, done, required, summary }) => <TouchableOpacity key={key} onPress={() => onJump(key)} style={{ width: "47%", minHeight: 80, justifyContent: "center", gap: 4, borderRadius: 16, borderCurve: "continuous", paddingHorizontal: 14, paddingVertical: 12, backgroundColor: done ? withAlpha(colors.success, "12") : required ? withAlpha(colors.warning, "10") : colors.surfaceRaised, borderWidth: 1.5, borderColor: done ? withAlpha(colors.success, "77") : required ? withAlpha(colors.warning, "66") : colors.border }}>
        <Text style={{ color: done ? colors.success : required ? colors.warning : colors.textMuted, fontSize: 10, fontWeight: "900", textTransform: "uppercase", letterSpacing: 0.8 }}>{done ? tc("overviewReady") : required ? tc("overviewRequired") : tc("overviewOptional")}</Text>
        <Text style={{ color: colors.textPrimary, fontSize: 14, fontWeight: "900" }}>{label}</Text>
        <Text style={{ color: colors.textMuted, fontSize: 11 }} numberOfLines={1}>{summary}</Text>
      </TouchableOpacity>)}</View>
      <TouchableOpacity onPress={onContinue} disabled={saving} style={{ backgroundColor: colors.primary, borderRadius: 16, borderCurve: "continuous", paddingVertical: 15, alignItems: "center", borderWidth: 1, borderColor: withAlpha(colors.primary, "99"), opacity: saving ? 0.6 : 1 }}>
        {saving ? <ActivityIndicator color={shade("#fff")} /> : <Text style={{ color: shade("#fff"), fontWeight: "900", fontSize: 16 }}>{tc("continueIntraop")}</Text>}
      </TouchableOpacity>
    </ScrollView>
  </View>
}
