import { Text, TouchableOpacity, View } from "react-native"
import {
  CONSENT_FALLBACK_TECHNIQUE,
  CONSENT_TECHNIQUE_LABELS,
  CONSENT_TECHNIQUES,
  type ConsentTechnique,
} from "@lospor/core/preop-documents"
import type { ClinicalStringKey } from "@/lib/preferences-context"
import { colors, useThemeRefresh } from "@/theme/colors"

/**
 * Layout C, before printing: the planned techniques. The consent describes
 * the ticked ones and general anaesthesia, which is always on as the
 * fallback. Nothing ticked describes every technique, as layout B.
 */
export function ConsentTechniqueChips({ chosen, onChange, language, tc }: {
  chosen: readonly ConsentTechnique[]
  onChange: (next: ConsentTechnique[]) => void
  language: "en" | "bg"
  tc: (key: ClinicalStringKey) => string
}) {
  useThemeRefresh()
  const labels = CONSENT_TECHNIQUE_LABELS[language]
  return (
    <View testID="preop-technique-picker" style={{ gap: 8 }}>
      <Text style={{ color: colors.textSecondary, fontSize: 13, lineHeight: 18 }}>{tc("preopSummaryTechniques")}</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {CONSENT_TECHNIQUES.map(technique => {
          const fallback = technique === CONSENT_FALLBACK_TECHNIQUE
          const on = fallback || chosen.includes(technique)
          return (
            <TouchableOpacity
              key={technique}
              testID={`preop-technique-${technique}`}
              disabled={fallback}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: on, disabled: fallback }}
              onPress={() => onChange(on
                ? chosen.filter(item => item !== technique)
                : CONSENT_TECHNIQUES.filter(item => item === technique || chosen.includes(item)))}
              style={{ paddingHorizontal: 12, paddingVertical: 9, borderRadius: 999, borderWidth: 1, borderColor: on ? colors.primary : colors.border, backgroundColor: on ? colors.primarySoft : colors.surface, opacity: fallback ? 0.75 : 1 }}
            >
              <Text style={{ color: colors.textPrimary, fontSize: 13, fontWeight: on ? "800" : "600" }}>{labels[technique]}</Text>
            </TouchableOpacity>
          )
        })}
      </View>
      {chosen.length === 0 ? <Text style={{ color: colors.textMuted, fontSize: 12 }}>{tc("preopSummaryNoneTicked")}</Text> : null}
    </View>
  )
}
