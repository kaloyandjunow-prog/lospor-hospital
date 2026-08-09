import React, { useState } from "react"
import { View, Text, TouchableOpacity } from "react-native"
import { useMemo } from "react"
import { colors, withAlpha } from "@/theme/colors"
import { usePreferences } from "@/lib/preferences-context"
import { displayClinicalCode } from "@/lib/clinical-display"
import { aldreteBand, handoverGroups } from "@lospor/core/postop"

// ─── Sub-components ───────────────────────────────────────────────────────────

export function SectionHeader({ title }: { title: string }) {
  return (
    <Text style={{ color: colors.primary, fontSize: 11, fontWeight: "900", textTransform: "uppercase", letterSpacing: 1.1, marginBottom: 10, marginTop: 20 }}>
      {title}
    </Text>
  )
}

export function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <View style={{ marginBottom: 16 }}>
      <Text style={{ color: colors.textSecondary, fontSize: 14, marginBottom: 6 }}>{label}</Text>
      {children}
      {error && <Text style={{ color: colors.danger, fontSize: 12, marginTop: 4 }}>{error}</Text>}
    </View>
  )
}

// 3-button row for 0 / 1 / 2 Aldrete scores
export function ScoreRow({
  label: _label,
  value,
  onChange,
  descriptions,
}: {
  label: string
  value: number
  onChange: (v: number) => void
  descriptions: [string, string, string]
}) {
  return (
    <View className="flex-row gap-2">
      {([0, 1, 2] as const).map((score) => {
        const selected = value === score
        return (
          <TouchableOpacity
            key={score}
            onPress={() => onChange(score)}
            style={{
              flex: 1,
              borderRadius: 14,
              borderCurve: "continuous",
              borderWidth: 1,
              borderColor: selected ? colors.primary : colors.border,
              backgroundColor: selected ? colors.primarySoft : colors.surfaceRaised,
              paddingVertical: 12,
              paddingHorizontal: 8,
              alignItems: "center",
              minHeight: 76,
            }}
          >
            <Text style={{ color: selected ? colors.primary : colors.textMuted, fontSize: 18, fontWeight: "900", marginBottom: 3 }}>
              {score}
            </Text>
            <Text
              style={{ color: selected ? colors.textPrimary : colors.textMuted, fontSize: 10, textAlign: "center", lineHeight: 13 }}
              numberOfLines={2}
            >
              {descriptions[score]}
            </Text>
          </TouchableOpacity>
        )
      })}
    </View>
  )
}

// Row of 11 numbered buttons for NRS 0–10
export function NRSRow({ value, onChange, max = 10 }: {
  value: number | undefined
  onChange: (v: number) => void
  max?: number
}) {
  return (
    <View className="flex-row flex-wrap gap-1.5">
      {Array.from({ length: max + 1 }, (_, i) => i).map((n) => {
        const selected = value === n
        return (
          <TouchableOpacity
            key={n}
            onPress={() => onChange(n)}
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              borderCurve: "continuous",
              borderWidth: 1,
              borderColor: selected ? colors.warning : colors.border,
              backgroundColor: selected ? withAlpha(colors.warning, "22") : colors.surfaceRaised,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text style={{ color: selected ? colors.warning : colors.textSecondary, fontSize: 14, fontWeight: "800" }}>
              {n}
            </Text>
          </TouchableOpacity>
        )
      })}
    </View>
  )
}

// Disposition pill picker
export function DispositionPicker({
  value,
  onChange,
  wardLabel,
  pacuLabel,
  icuLabel,
}: {
  value: "WARD" | "PACU" | "ICU" | undefined
  onChange: (v: "WARD" | "PACU" | "ICU" | undefined) => void
  wardLabel: string
  pacuLabel: string
  icuLabel: string
}) {
  const { language } = usePreferences()
  const OPTIONS: { v: "WARD" | "PACU" | "ICU"; label: string; color: string }[] = [
    { v: "WARD", label: wardLabel, color: colors.success },
    { v: "PACU", label: pacuLabel, color: colors.warning },
    { v: "ICU",  label: icuLabel,  color: colors.danger },
  ]
  return (
    <View className="flex-row gap-3">
      {OPTIONS.map((opt) => {
        const selected = value === opt.v
        return (
          <TouchableOpacity
            key={opt.v}
            onPress={() => onChange(selected ? undefined : opt.v)}
            style={{
              flex: 1,
              minHeight: 72,
              borderRadius: 14,
              borderCurve: "continuous",
              borderWidth: 1,
              borderColor: selected ? opt.color : colors.border,
              backgroundColor: selected ? withAlpha(opt.color, "22") : colors.surfaceRaised,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text style={{ color: selected ? opt.color : colors.textPrimary, fontSize: 16, fontWeight: "900" }}>
              {displayClinicalCode("option:DISPOSITION", opt.v, language, { label: opt.label })}
            </Text>
          </TouchableOpacity>
        )
      })}
    </View>
  )
}

// Multi-toggle checkboxes for handover items — grouped
export function HandoverChecklist({
  value,
  onChange,
}: {
  value: string[]
  onChange: (v: string[]) => void
}) {
  const { language } = usePreferences()
  const groups = useMemo(
    () => handoverGroups(language === "bg" ? "bg" : "en"),
    [language],
  )
  const [expanded, setExpanded] = useState<string[]>(() => groups.map(group => group.id))

  function toggle(item: string) {
    onChange(value.includes(item) ? value.filter((x) => x !== item) : [...value, item])
  }

  function toggleGroup(groupId: string) {
    setExpanded(prev => prev.includes(groupId) ? prev.filter(g => g !== groupId) : [...prev, groupId])
  }

  function groupCheckedCount(group: (typeof groups)[number]) {
    return group.items.filter(item => value.includes(item.code)).length
  }

  return (
    <View style={{ gap: 8 }}>
      {groups.map((group) => {
        const isOpen = expanded.includes(group.id)
        const checkedCount = groupCheckedCount(group)
        const allChecked = checkedCount === group.items.length
        return (
          <View key={group.id} style={{ backgroundColor: colors.surfaceRaised, borderRadius: 14, borderCurve: "continuous", borderWidth: 1, borderColor: allChecked ? withAlpha(colors.success, "66") : colors.border, overflow: "hidden" }}>
            <TouchableOpacity
              onPress={() => toggleGroup(group.id)}
              style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 12, gap: 10 }}
            >
              <Text style={{ flex: 1, color: colors.textSecondary, fontSize: 13, fontWeight: "800" }}>
                {displayClinicalCode("option:HANDOVER_ITEM", group.id, language, { label: group.group })}
              </Text>
              <Text style={{ color: checkedCount > 0 ? colors.success : colors.textMuted, fontSize: 12, fontWeight: "800" }}>
                {checkedCount}/{group.items.length}
              </Text>
              <Text style={{ color: colors.textMuted, fontSize: 13 }}>{isOpen ? "▲" : "▼"}</Text>
            </TouchableOpacity>
            {isOpen && group.items.map((opt) => {
              const checked = value.includes(opt.code)
              return (
                <TouchableOpacity
                  key={opt.code}
                  onPress={() => toggle(opt.code)}
                  style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 14, paddingVertical: 12, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: checked ? withAlpha(colors.success, "08") : "transparent" }}
                >
                  <View style={{ width: 22, height: 22, borderRadius: 7, borderWidth: 2, borderColor: checked ? colors.success : colors.borderStrong, backgroundColor: checked ? colors.success : "transparent", alignItems: "center", justifyContent: "center" }}>
                    {checked && <Text style={{ color: colors.background, fontSize: 13, fontWeight: "900", lineHeight: 15 }}>✓</Text>}
                  </View>
                  <Text style={{ color: checked ? colors.textPrimary : colors.textSecondary, fontSize: 13, flex: 1, lineHeight: 18 }}>
                    {displayClinicalCode("option:HANDOVER_ITEM", opt.code, language, { label: opt.label })}
                  </Text>
                </TouchableOpacity>
              )
            })}
          </View>
        )
      })}
    </View>
  )
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export function RecoverySummary({
  total,
  label,
  disposition,
  pain,
  ponv,
}: {
  /** Null until every component is assessed — a partial score has no total. */
  total: number | null
  label: string
  disposition?: "WARD" | "PACU" | "ICU"
  pain?: number
  ponv?: boolean
}) {
  const { t, language } = usePreferences()
  const status = total == null ? null : aldreteBand(total)
  // Neutral while unassessed. Colouring an incomplete score red reads as a sick
  // patient rather than an unfinished form.
  const statusColor = status === null
    ? colors.textMuted
    : status === "ready"
    ? colors.success
    : status === "observe" ? colors.warning : colors.danger
  const dispoColor = disposition === "ICU" ? colors.danger : disposition === "PACU" ? colors.warning : colors.success
  return (
    <View style={{ backgroundColor: colors.surfaceRaised, borderRadius: 16, borderCurve: "continuous", borderWidth: 1, borderColor: withAlpha(statusColor, "66"), padding: 16, marginTop: 10, marginBottom: 6 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
        <View>
          <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: "900", letterSpacing: 1, textTransform: "uppercase" }}>{t("aldreteLabel")}</Text>
          <Text style={{ color: statusColor, fontSize: 40, fontWeight: "900", fontVariant: ["tabular-nums"], marginTop: 2 }}>
            {total ?? "—"}<Text style={{ color: colors.textMuted, fontSize: 18 }}> / 10</Text>
          </Text>
          <Text style={{ color: statusColor, fontSize: 13, fontWeight: "800" }}>{label}</Text>
        </View>
        <View style={{ alignItems: "flex-end", gap: 6 }}>
          <Text style={{ color: disposition ? dispoColor : colors.textMuted, fontSize: 18, fontWeight: "900" }}>
            {disposition ? displayClinicalCode("option:DISPOSITION", disposition, language) : t("noDisposition")}
          </Text>
          <Text style={{ color: colors.textSecondary, fontSize: 12 }}>{t("painLabel")} {pain ?? "-"}/10</Text>
          <Text style={{ color: ponv ? colors.warning : colors.textMuted, fontSize: 12 }}>{ponv ? t("ponvPresent") : t("noPONV")}</Text>
        </View>
      </View>
    </View>
  )
}

