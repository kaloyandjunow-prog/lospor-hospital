import { Text, View } from "react-native"
import { usePreferences } from "@/lib/preferences-context"
import type { DrugSheetPediatric } from "@/lib/drug-sheet-pediatric"

/**
 * What the drug sheet has to say about where a child's dose came from — or why
 * there isn't one. Every branch here is a reason the dose field is not filled
 * in, and an unstated reason is the same as no reason at all.
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
  const { language } = usePreferences()
  return (
    <View style={{ marginBottom: 10, gap: 8 }}>
      {conflict ? (
        <Text
          testID="drug-profile-conflict"
          accessibilityRole="alert"
          style={{ color: "#fca5a5", fontSize: 12, lineHeight: 17 }}
        >
          {language === "bg"
            ? "Няколко одобрени дозови правила важат за това дете, затова нито едно не може да се приложи. Въведете ръчно проверена доза — тя ще бъде записана без позоваване на правило."
            : "More than one approved dose rule applies to this child, so none of them may be used. Enter a manually verified dose; it is recorded without a rule credited."}
        </Text>
      ) : null}
      {loading ? (
        <Text style={{ color: "#94a3b8", fontSize: 12, lineHeight: 17 }}>
          {language === "bg" ? "Зареждане на одобрения институционален набор..." : "Loading the approved institution preset..."}
        </Text>
      ) : null}
      {source === "cache" ? (
        <Text style={{ color: "#fbbf24", fontSize: 12, lineHeight: 17 }}>
          {language === "bg"
            ? `Използва се последният запазен институционален набор${cachedAt ? ` от ${new Date(cachedAt).toLocaleString()}` : ""}.`
            : `Using the last cached institution preset${cachedAt ? ` from ${new Date(cachedAt).toLocaleString()}` : ""}.`}
        </Text>
      ) : null}
      {!loading && !hasProfiles ? (
        <Text style={{ color: "#fbbf24", fontSize: 12, lineHeight: 17 }}>
          {language === "bg"
            ? "Няма приложим одобрен дозов профил. Въведете ръчно проверена доза."
            : "No applicable approved dose profile is available. Enter a manually verified dose."}
          {error ? ` ${error}` : ""}
        </Text>
      ) : null}
      {surface?.dose && structuredRule ? (
        <Text style={{ color: "#4ade80", fontSize: 12, lineHeight: 17 }}>
          {language === "bg" ? "Одобрена институционална доза" : "Approved institution dose"}: {surface.dose} {surface.unit} · {structuredRule.ruleVersion}
        </Text>
      ) : surface && structuredRule ? (
        <Text style={{ color: "#fbbf24", fontSize: 12, lineHeight: 17 }}>
          {language === "bg" ? "Дозата не може да бъде изчислена автоматично" : "The dose cannot be calculated automatically"}: {surface.calculationUnavailableReason ?? "NO_AUTOFILL"}
        </Text>
      ) : legacyProfile && legacyResolution?.status === "AVAILABLE" ? (
        <Text style={{ color: "#4ade80", fontSize: 12, lineHeight: 17 }}>
          {language === "bg" ? "Одобрена институционална доза" : "Approved institution dose"}: {legacyResolution.amount} {legacyResolution.doseUnit} · {legacyProfile.version}
        </Text>
      ) : legacyProfile && legacyResolution ? (
        <Text style={{ color: "#fbbf24", fontSize: 12, lineHeight: 17 }}>
          {language === "bg" ? "Дозата не може да бъде изчислена автоматично" : "The dose cannot be calculated automatically"}: {legacyResolution.status}
        </Text>
      ) : null}
    </View>
  )
}
