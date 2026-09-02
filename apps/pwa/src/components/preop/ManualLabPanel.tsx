import { useMemo, useState } from "react"
import { Pressable, Text, TextInput, View } from "react-native"
import { displayClinicalCode } from "@/lib/clinical-display"
import { LAB_CATEGORIES, getLabOutOfRange, searchLabs, type LabTest } from "@/lib/labs"
import { usePreferences } from "@/lib/preferences-context"
import { colors } from "@/theme/colors"

// `source` is per-item provenance ("manual" | "ai-scan" | "import") shared
// with the web client and read by the API. This panel only ever adds rows a
// clinician typed in by hand, but the type has to admit the field or it gets
// stripped by the object literal in addTest below.
type ManualLabValue = { test: string; value: string; unit: string; source?: "manual" | "ai-scan" | "import" }

export function ManualLabPanel({ value, onChange, labelManualLabEntry, labelHideManualLab, labelSearchLabs }: { value: ManualLabValue[]; onChange: (value: ManualLabValue[]) => void; labelManualLabEntry?: string; labelHideManualLab?: string; labelSearchLabs?: string }) {
  const { tc, language } = usePreferences()
  const [expanded, setExpanded] = useState(false)
  const [query, setQuery] = useState("")
  const [category, setCategory] = useState<string | null>(null)
  const filtered = useMemo(() => query.length >= 2 ? searchLabs(query) : null, [query])

  function addTest(test: LabTest) {
    if (value.some((row) => row.test === test.name)) return
    onChange([...value, { test: test.name, value: "", unit: test.unit, source: "manual" }])
    setQuery("")
  }

  function update(test: string, nextValue: string) {
    onChange(value.map((row) => row.test === test ? { ...row, value: nextValue } : row))
  }

  return (
    <View>
      {value.length > 0 ? (
        <View style={{ backgroundColor: colors.surface, borderRadius: 14, borderWidth: 1, borderColor: colors.border, overflow: "hidden", marginBottom: 12 }}>
          {value.map((row, idx) => {
            const testDef = searchLabs(row.test)[0]?.test
            const numeric = Number.parseFloat(row.value)
            const flag = testDef && Number.isFinite(numeric) ? getLabOutOfRange(testDef, numeric) : null
            return (
              <View key={row.test} style={{ flexDirection: "row", alignItems: "center", gap: 8, padding: 10, borderBottomWidth: idx < value.length - 1 ? 1 : 0, borderBottomColor: colors.border }}>
                <Text style={{ flex: 1, color: colors.textSecondary, fontSize: 12, fontWeight: "900" }} numberOfLines={1}>{displayClinicalCode("labTest", row.test, language, { label: row.test })}</Text>
                <TextInput
                  value={row.value}
                  onChangeText={(text) => update(row.test, text)}
                  keyboardType="decimal-pad"
                  placeholder="-"
                  placeholderTextColor={colors.textMuted}
                  style={{ width: 72, color: flag ? colors.warning : colors.textPrimary, backgroundColor: colors.background, borderWidth: 1, borderColor: flag ? colors.warning : colors.border, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 6, textAlign: "right", fontWeight: "900" }}
                />
                <Text style={{ width: 48, color: colors.textMuted, fontSize: 11 }}>{row.unit}</Text>
                <Pressable onPress={() => onChange(value.filter((item) => item.test !== row.test))}>
                  <Text style={{ color: colors.danger, fontSize: 16, fontWeight: "900" }}>✕</Text>
                </Pressable>
              </View>
            )
          })}
        </View>
      ) : null}

      <Pressable onPress={() => setExpanded(!expanded)} style={{ borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, paddingHorizontal: 14, paddingVertical: 12, marginBottom: expanded ? 12 : 0 }}>
        <Text style={{ color: colors.textSecondary, fontSize: 14, fontWeight: "900" }}>{expanded ? (labelHideManualLab ?? tc("hideManualLab")) : (labelManualLabEntry ?? tc("manualLabEntry"))}</Text>
        <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }}>{tc("manualLabHint")}</Text>
      </Pressable>

      {expanded ? (
        <View>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={labelSearchLabs ?? tc("searchLabs")}
            placeholderTextColor={colors.textMuted}
            style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 14, color: colors.textPrimary, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 10 }}
          />
          {filtered ? (
            <View style={{ backgroundColor: colors.surface, borderRadius: 14, borderWidth: 1, borderColor: colors.border, overflow: "hidden" }}>
              {filtered.slice(0, 8).map((result, idx) => (
                <Pressable key={result.test.name} onPress={() => addTest(result.test)} style={{ padding: 12, borderBottomWidth: idx < Math.min(filtered.length, 8) - 1 ? 1 : 0, borderBottomColor: colors.border }}>
                  <Text style={{ color: colors.textPrimary, fontWeight: "900" }}>{displayClinicalCode("labTest", result.test.name, language, { label: result.test.name })}</Text>
                  <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }}>{displayClinicalCode("labCategory", result.category.id, language, { label: result.category.label })} - {result.test.unit}</Text>
                </Pressable>
              ))}
            </View>
          ) : LAB_CATEGORIES.map((cat) => (
            <View key={cat.id} style={{ marginBottom: 8 }}>
              <Pressable onPress={() => setCategory(category === cat.id ? null : cat.id)} style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 14, padding: 12 }}>
                <Text style={{ color: colors.textSecondary, fontWeight: "900" }}>{displayClinicalCode("labCategory", cat.id, language, { label: cat.label })}</Text>
              </Pressable>
              {category === cat.id ? cat.tests.map((test) => (
                <Pressable key={test.name} onPress={() => addTest(test)} style={{ paddingHorizontal: 14, paddingVertical: 10 }}>
                  <Text style={{ color: colors.textMuted, fontWeight: "800" }}>{displayClinicalCode("labTest", test.name, language, { label: test.name })} ({test.unit})</Text>
                </Pressable>
              )) : null}
            </View>
          ))}
        </View>
      ) : null}
    </View>
  )
}
