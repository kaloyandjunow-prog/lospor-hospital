import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, Switch, type TextInputProps } from "react-native"
import { colors, withAlpha } from "@/theme/colors"
import { usePreferences, type AppLanguage } from "@/lib/preferences-context"
import { displayClinicalCode } from "@/lib/clinical-display"

// ─── Colors (match web dark mode exactly) ────────────────────────────────────
// Screen bg:    #111111   →  bg-[#111111]
// Card bg:      #1c1c1c   →  bg-[#1c1c1c]
// Border:       #2e2e2e   →  border-[#2e2e2e]
// Primary btn:  blue-600  →  bg-blue-600
// Label:        slate-300
// Muted:        slate-500

// ─── Field wrapper ────────────────────────────────────────────────────────────
export function Field({
  label, error, required = false, children,
}: { label: string; error?: string; required?: boolean; children: React.ReactNode }) {
  return (
    <View style={{ marginBottom: 16 }}>
      <Text style={{ color: colors.textSecondary, fontSize: 14, marginBottom: 6 }}>
        {label}{required && <Text style={{ color: colors.danger }}> *</Text>}
      </Text>
      {children}
      {error && <Text style={{ color: colors.danger, fontSize: 12, marginTop: 4 }}>{error}</Text>}
    </View>
  )
}

// ─── Styled text input ────────────────────────────────────────────────────────
export function StyledInput({ value, onChangeText, placeholder, keyboardType, multiline, numberOfLines, style, ...rest }: TextInputProps) {
  return (
    <TextInput
      placeholderTextColor={colors.textMuted}
      placeholder={placeholder}
      keyboardType={keyboardType ?? "default"}
      value={value}
      onChangeText={onChangeText}
      multiline={multiline}
      numberOfLines={numberOfLines}
      style={[{
        backgroundColor: colors.surface,
        color: colors.textPrimary,
        borderRadius: 14,
        borderCurve: "continuous",
        paddingHorizontal: 14,
        paddingVertical: 12,
        fontSize: 16,
        borderWidth: 1,
        borderColor: colors.border,
      }, multiline ? { minHeight: 80, textAlignVertical: "top" } : {}, style]}
      {...rest}
    />
  )
}

// ─── Section header ───────────────────────────────────────────────────────────
export function SectionHeader({ title }: { title: string }) {
  return (
    <Text style={{ color: colors.primary, fontSize: 11, fontWeight: "800", textTransform: "uppercase", letterSpacing: 1.1, marginBottom: 10, marginTop: 20 }}>
      {title}
    </Text>
  )
}

// ─── Card ─────────────────────────────────────────────────────────────────────
export function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <View
      className={className}
      style={{ backgroundColor: colors.surfaceRaised, borderRadius: 14, borderCurve: "continuous", borderWidth: 1, borderColor: colors.border, overflow: "hidden" }}
    >
      {children}
    </View>
  )
}

// ─── Settings row ─────────────────────────────────────────────────────────────
export function SettingsRow({
  label, subtitle, onPress, rightElement, danger = false, last = false,
}: {
  label: string; subtitle?: string; onPress?: () => void
  rightElement?: React.ReactNode; danger?: boolean; last?: boolean
}) {
  const Inner = (
    <View style={{ paddingHorizontal: 16, paddingVertical: 14, flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderBottomWidth: last ? 0 : 1, borderBottomColor: colors.border }}>
      <View className="flex-1 mr-3">
        <Text style={{ color: danger ? colors.danger : colors.textPrimary, fontSize: 14, fontWeight: "700" }}>{label}</Text>
        {subtitle && <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 3 }} numberOfLines={2}>{subtitle}</Text>}
      </View>
      {rightElement && <View>{rightElement}</View>}
    </View>
  )
  if (onPress) return <TouchableOpacity onPress={onPress}>{Inner}</TouchableOpacity>
  return Inner
}

// ─── Primary button ───────────────────────────────────────────────────────────
export function PrimaryButton({
  label, onPress, loading = false, disabled = false, color = "blue",
}: { label: string; onPress: () => void; loading?: boolean; disabled?: boolean; color?: "blue" | "emerald" | "violet" | "indigo" | "red" | "amber" }) {
  const bg = {
    blue:    colors.primary,
    emerald: colors.success,
    violet:  colors.agent,
    indigo:  "#6366f1",
    red:     colors.danger,
    amber:   colors.warning,
  }[color]
  return (
    <TouchableOpacity
      style={{ backgroundColor: bg, borderRadius: 14, borderCurve: "continuous", paddingVertical: 14, alignItems: "center", opacity: disabled || loading ? 0.6 : 1, boxShadow: `0 10px 24px ${withAlpha(bg, "33")}` }}
      onPress={onPress}
      disabled={disabled || loading}
    >
      {loading ? <ActivityIndicator color="#fff" /> : <Text style={{ color: colors.background, fontWeight: "900", fontSize: 16 }}>{label}</Text>}
    </TouchableOpacity>
  )
}

// ─── Multi-select toggle pills ────────────────────────────────────────────────
export function MultiToggle({
  options, value, onChange,
}: { options: readonly { v: string; label: string }[] | { v: string; label: string }[]; value: string[]; onChange: (v: string[]) => void }) {
  function toggle(v: string) {
    onChange(value.includes(v) ? value.filter(x => x !== v) : [...value, v])
  }
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
      {options.map(opt => {
        const on = value.includes(opt.v)
        return (
          <TouchableOpacity
            key={opt.v}
            onPress={() => toggle(opt.v)}
            style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderCurve: "continuous", borderWidth: 1, borderColor: on ? colors.primary : colors.border, backgroundColor: on ? colors.primarySoft : colors.surfaceRaised }}
          >
            <Text style={{ color: on ? colors.primary : colors.textSecondary, fontSize: 14, fontWeight: on ? "900" : "700" }}>{opt.label}</Text>
          </TouchableOpacity>
        )
      })}
    </View>
  )
}

// ─── Single-select toggle pills ───────────────────────────────────────────────
export function SingleToggle({
  options, value, onChange, deselectable = true,
}: {
  options: readonly { v: string; label: string }[] | { v: string; label: string }[]
  value: string | undefined
  onChange: (v: string | undefined) => void
  deselectable?: boolean
}) {
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
      {options.map(opt => {
        const on = value === opt.v
        return (
          <TouchableOpacity
            key={opt.v}
            onPress={() => onChange(deselectable && on ? undefined : opt.v)}
            style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderCurve: "continuous", borderWidth: 1, borderColor: on ? colors.primary : colors.border, backgroundColor: on ? colors.primarySoft : colors.surfaceRaised }}
          >
            <Text style={{ color: on ? colors.primary : colors.textSecondary, fontSize: 14, fontWeight: on ? "900" : "700" }}>{opt.label}</Text>
          </TouchableOpacity>
        )
      })}
    </View>
  )
}

// ─── Status badge ─────────────────────────────────────────────────────────────
// Colors only — labels come from @lospor/core/case-status (shared with
// lospor-app) so they follow the active app language instead of being
// hardcoded English here.
export const STATUS_META: Record<string, { color: string }> = {
  DRAFT:                { color: colors.textMuted },
  IN_CONSULTATION:      { color: "#f59e0b" },
  AWAITING_ALLOCATION:  { color: "#14b8a6" },
  IN_PROGRESS:          { color: colors.primary },
  AWAITING_POSTOP:      { color: "#f97316" },
  AWAITING_REVIEW:      { color: "#f59e0b" },
  COMPLETE:             { color: colors.success },
}

export function statusLabel(status: string, language: AppLanguage): string {
  return displayClinicalCode("caseStatus", status, language)
}

export function StatusBadge({ status }: { status: string }) {
  const { language } = usePreferences()
  const color = STATUS_META[status]?.color ?? colors.textMuted
  const label = statusLabel(status, language)
  return (
    <View style={{ borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, backgroundColor: withAlpha(color, "20"), borderWidth: 1, borderColor: withAlpha(color, "66") }}>
      <Text style={{ color, fontSize: 12, fontWeight: "800" }}>{label}</Text>
    </View>
  )
}

// ─── ASA badge ────────────────────────────────────────────────────────────────
const ASA_COLOR: Record<string, string> = {
  I:   colors.success,
  II:  colors.primary,
  III: colors.warning,
  IV:  colors.danger,
  V:   colors.danger,
  VI:  colors.danger,
}

export function ASABadge({ asa }: { asa?: string | null }) {
  if (!asa) return null
  const color = ASA_COLOR[asa] ?? colors.textMuted
  return (
    <View style={{ borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, backgroundColor: withAlpha(color, "20"), borderWidth: 1, borderColor: withAlpha(color, "66") }}>
      <Text style={{ color, fontSize: 12, fontWeight: "800" }}>ASA {asa}</Text>
    </View>
  )
}

// ─── Disposition badge ────────────────────────────────────────────────────────
const DISP_COLOR: Record<string, string> = {
  WARD: colors.success,
  PACU: colors.warning,
  ICU:  colors.danger,
}

export function DispositionBadge({ disposition }: { disposition?: string | null }) {
  const { language } = usePreferences()
  if (!disposition) return null
  const color = DISP_COLOR[disposition] ?? colors.textMuted
  return (
    <View style={{ borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, backgroundColor: withAlpha(color, "20"), borderWidth: 1, borderColor: withAlpha(color, "66") }}>
      <Text style={{ color, fontSize: 12, fontWeight: "800" }}>{displayClinicalCode("option:DISPOSITION", disposition, language)}</Text>
    </View>
  )
}

// ─── Chip ─────────────────────────────────────────────────────────────────────
export function Chip({ label, onRemove }: { label: string; onRemove?: () => void }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", backgroundColor: colors.primarySoft, borderWidth: 1, borderColor: withAlpha(colors.primary, "55"), borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5, marginRight: 6, marginBottom: 6, maxWidth: "100%" }}>
      <Text style={{ color: colors.primary, fontSize: 12, marginRight: 4, fontWeight: "700" }} numberOfLines={1}>{label}</Text>
      {onRemove && (
        <TouchableOpacity onPress={onRemove} hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}>
          <Text style={{ color: colors.primary, fontSize: 12, fontWeight: "900" }}>×</Text>
        </TouchableOpacity>
      )}
    </View>
  )
}

export function ChecklistTitle({ children }: { children: React.ReactNode }) {
  return (
    <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: "900", textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>
      {children}
    </Text>
  )
}

export function ChecklistGroup({ children }: { children: React.ReactNode }) {
  return (
    <View style={{ backgroundColor: colors.surfaceRaised, borderRadius: 14, borderCurve: "continuous", borderWidth: 1, borderColor: colors.border, marginBottom: 16, overflow: "hidden" }}>
      {children}
    </View>
  )
}

export function ChecklistRow({
  label,
  checked,
  onPress,
  muted = false,
  last = false,
  hint,
}: {
  label: string
  checked: boolean
  onPress?: () => void
  muted?: boolean
  last?: boolean
  hint?: string
}) {
  const content = (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: last ? 0 : 1, borderBottomColor: colors.border, opacity: muted ? 0.78 : 1 }}>
      <View style={{ width: 24, height: 24, borderRadius: 8, borderCurve: "continuous", borderWidth: 2, borderColor: checked ? colors.primary : colors.borderStrong, backgroundColor: checked ? colors.primary : "transparent", alignItems: "center", justifyContent: "center" }}>
        {checked && <Text style={{ color: colors.background, fontSize: 14, fontWeight: "900", lineHeight: 16 }}>✓</Text>}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ color: muted ? colors.textMuted : colors.textSecondary, fontSize: 14, lineHeight: 19, fontWeight: checked ? "800" : "600" }}>
          {label}
        </Text>
        {hint && !checked && (
          <Text style={{ color: colors.warning, fontSize: 11, lineHeight: 14, marginTop: 2 }}>{hint}</Text>
        )}
      </View>
    </View>
  )

  if (onPress) return <TouchableOpacity onPress={onPress}>{content}</TouchableOpacity>
  return content
}

export function ClinicalSwitchRow({
  value,
  onValueChange,
  label,
  activeColor = colors.primary,
}: {
  value: boolean
  onValueChange: (value: boolean) => void
  label: string
  activeColor?: string
}) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: value ? activeColor : colors.border, borderRadius: 14, borderCurve: "continuous", paddingHorizontal: 14, paddingVertical: 10 }}>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: colors.borderStrong, true: withAlpha(activeColor, "66") }}
        ios_backgroundColor={colors.borderStrong}
        thumbColor="#fff"
      />
      <Text style={{ color: value ? activeColor : colors.textSecondary, fontSize: 14, fontWeight: "800" }}>{label}</Text>
    </View>
  )
}
