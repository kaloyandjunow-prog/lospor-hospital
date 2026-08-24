import { Text, View } from "react-native"
import { usePreferences } from "@/lib/preferences-context"
import { formatMessage } from "@/i18n/locale"
import type { DrugSheetPediatric } from "@/lib/drug-sheet-pediatric"

/**
 * Explain where a child's configured dose came from, or why automatic entry is
 * unavailable. The established approved-dose and cached-source notices remain
 * visible alongside the medication controls.
 */
export function PediatricDoseNotice({
  loading, source, cachedAt, error,
  conflict, hasProfiles, surface, structuredRule, legacyProfile, legacyResolution,
}: {
  loading?: boolean
  source?: "server" | "cache" | null
  cachedAt?: string | null
  error?: string | null
  conflict: boolean
  hasProfiles: boolean
  surface: DrugSheetPediatric["surface"]
  structuredRule: DrugSheetPediatric["selectedProfile"]
  legacyProfile: DrugSheetPediatric["legacyProfile"]
  legacyResolution: DrugSheetPediatric["legacyResolution"]
}) {
  const { language, tc } = usePreferences()
  const cannotAutofill = !!error
    || (!!surface && !!structuredRule && !surface.dose)
    || (!!legacyProfile && !!legacyResolution && legacyResolution.status !== "AVAILABLE")

  return (
    <View style={{ marginBottom: 10, gap: 8 }}>
      {conflict ? (
        <Text
          testID="drug-profile-conflict"
          accessibilityRole="alert"
          style={{ color: "#fca5a5", fontSize: 12, lineHeight: 17 }}
        >
          {tc("pediatricDoseConflict")}
        </Text>
      ) : null}
      {loading ? (
        <Text style={{ color: "#94a3b8", fontSize: 12, lineHeight: 17 }}>
          {tc("loadingInstitutionPreset")}
        </Text>
      ) : null}
      {source === "cache" ? (
        <Text style={{ color: "#fbbf24", fontSize: 12, lineHeight: 17 }}>
          {cachedAt
            ? formatMessage(tc("cachedInstitutionPresetFrom"), {
                time: new Date(cachedAt).toLocaleString(language === "bg" ? "bg-BG" : "en-GB"),
              })
            : tc("cachedInstitutionPreset")}
        </Text>
      ) : null}
      {!loading && !hasProfiles ? (
        <Text style={{ color: "#fbbf24", fontSize: 12, lineHeight: 17 }}>
          {tc("noApprovedDoseProfile")}
        </Text>
      ) : null}
      {!conflict && !loading && hasProfiles && cannotAutofill ? (
        <Text style={{ color: "#fbbf24", fontSize: 12, lineHeight: 17 }}>
          {tc("doseCannotAutofill")}
        </Text>
      ) : null}
      {surface?.dose && structuredRule ? (
        <Text style={{ color: "#4ade80", fontSize: 12, lineHeight: 17 }}>
          {tc("approvedInstitutionDose")}: {surface.dose} {surface.unit} · {structuredRule.ruleVersion}
        </Text>
      ) : legacyProfile && legacyResolution?.status === "AVAILABLE" ? (
        <Text style={{ color: "#4ade80", fontSize: 12, lineHeight: 17 }}>
          {tc("approvedInstitutionDose")}: {legacyResolution.amount} {legacyResolution.doseUnit} · {legacyProfile.version}
        </Text>
      ) : null}
    </View>
  )
}
