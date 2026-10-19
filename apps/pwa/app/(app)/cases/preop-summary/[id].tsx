import { useCallback, useEffect, useMemo, useState } from "react"
import { ScrollView, Text, TouchableOpacity, View } from "react-native"
import { Stack, useLocalSearchParams, useRouter } from "expo-router"
import {
  CONSENT_FALLBACK_TECHNIQUE,
  consentPopulationForAge,
  preopAgeInYears,
  type ConsentTechnique,
  type PreopDocumentsResponse,
} from "@lospor/core/preop-documents"
import { consentTechniquesForPlan } from "@lospor/core/preop-plan"
import { apiFetch, apiJson } from "@/lib/api"
import { notify } from "@/lib/notify"
import { openPrintCase } from "@/lib/print-case"
import { startIntraop } from "@/lib/start-intraop"
import { usePreferences } from "@/lib/preferences-context"
import { PrimaryButton } from "@/components/ui"
import { ScreenState } from "@/components/clinical-ui"
import { PreopSummaryCard, type PreopSummaryCase } from "@/components/preop/PreopSummaryCard"
import { ConsentTechniqueChips } from "@/components/preop/ConsentTechniqueChips"
import { colors, useThemeRefresh } from "@/theme/colors"

type SummaryData = PreopSummaryCase & { preopDocuments?: PreopDocumentsResponse | null }

/**
 * The preop summary on the phone: between preop and intraop when the
 * hospital uses it. Keep the case or hand it over, print the summary (and
 * consent) as a PDF, start intraop. Starting intraop never needs this screen
 * to have loaded: offline, the button is still there.
 */
export default function PreopSummaryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()
  useThemeRefresh()
  const { tc, language } = usePreferences()
  const lang = language === "bg" ? "bg" : "en"
  const [data, setData] = useState<SummaryData | null>(null)
  const [canWrite, setCanWrite] = useState(true)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<"print" | "start" | null>(null)
  const [techniques, setTechniques] = useState<ConsentTechnique[]>([])

  useEffect(() => {
    let cancelled = false
    Promise.all([
      apiJson<SummaryData>(`/api/cases/${id}/print-data`),
      apiJson<{ capabilities?: { canWrite?: boolean } | null }>(`/api/cases/${id}`).catch(() => null),
    ])
      .then(([summary, detail]) => {
        if (cancelled) return
        setData(summary)
        // Layout C starts from the anaesthesia planned at the preop visit.
        setTechniques(consentTechniquesForPlan(summary.preop?.plannedAnaesthesia))
        setCanWrite(detail?.capabilities?.canWrite !== false)
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [id])

  const consent = data?.preopDocuments?.consentEnabled === true
  const layout = data?.preopDocuments?.layout ?? "B"
  // Layout C prints the techniques ticked here (general anaesthesia always).
  const chosen = useMemo(() => consent && layout === "C" ? techniques : [], [consent, layout, techniques])
  const chip = { paddingHorizontal: 14, paddingVertical: 11, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface }
  const chipText = { color: colors.textPrimary, fontSize: 14, fontWeight: "700" as const }

  const print = useCallback(async () => {
    setBusy("print")
    try {
      const template = consent && data?.preopDocuments?.templates
        ? data.preopDocuments.templates[consentPopulationForAge(preopAgeInYears(data.preop as never))]
        : null
      // The sheet records which consent text it carried; the PDF itself records nothing.
      if (template) {
        const recorded = await apiFetch(`/api/cases/${id}/consent-prints`, {
          method: "POST",
          body: JSON.stringify({
            population: template.population,
            version: template.version,
            sha256: template.sha256,
            layout,
            ...(layout === "C" ? { techniques: [CONSENT_FALLBACK_TECHNIQUE, ...chosen] } : {}),
          }),
        }).catch(() => null)
        // Refused or offline: say so (as web), and print anyway -- the sheet is still needed.
        if (!recorded?.ok) notify(tc("errorLabel"), tc("preopSummaryRecordFailed"))
      }
      const ok = await openPrintCase(id, lang, data?.caseCode, { doc: "preop-summary", ...(consent && layout === "C" ? { techniques: chosen } : {}) })
      if (!ok) notify(tc("errorLabel"), tc("printFailed"))
    } finally {
      setBusy(null)
    }
  }, [chosen, consent, data, id, lang, layout, tc])

  const begin = useCallback(async () => {
    setBusy("start")
    try {
      if (await startIntraop(id)) router.replace(`/(app)/cases/intraop/${id}`)
      else notify(tc("savePendingTitle"), tc("savePendingBody"))
    } catch {
      notify(tc("errorLabel"), tc("couldCreateCase"))
    } finally {
      setBusy(null)
    }
  }, [id, router, tc])

  return (
    <>
      <Stack.Screen options={{ title: tc("preopSummaryTitle") }} />
      <ScrollView style={{ flex: 1, backgroundColor: colors.background }} contentContainerStyle={{ padding: 16, paddingBottom: 48, gap: 14 }} testID="preop-summary-screen">
        <Text style={{ color: colors.textPrimary, fontSize: 22, fontWeight: "900" }}>{tc("preopSummaryTitle")}</Text>
        <Text style={{ color: colors.textSecondary, fontSize: 14, lineHeight: 20 }}>{canWrite ? tc("preopSummaryHint") : tc("preopSummaryHandedOn")}</Text>

        {canWrite ? <PrimaryButton label={tc("preopSummaryStartIntraop")} onPress={() => { void begin() }} loading={busy === "start"} color="blue" /> : null}

        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
          {canWrite ? (
            <TouchableOpacity testID="preop-summary-handover" onPress={() => router.push(`/(app)/cases/handover/${id}`)} style={chip}>
              <Text style={chipText}>{tc("preopSummaryHandover")}</Text>
            </TouchableOpacity>
          ) : null}
          {data ? (
            <TouchableOpacity testID="preop-summary-print" disabled={busy === "print"} onPress={() => { void print() }} style={chip}>
              <Text style={chipText}>{consent ? tc("preopSummaryPrintWithConsent") : tc("preopSummaryPrint")}</Text>
            </TouchableOpacity>
          ) : null}
          {canWrite ? (
            <TouchableOpacity testID="preop-summary-edit" onPress={() => router.push(`/(app)/cases/new?continue=${id}`)} style={chip}>
              <Text style={chipText}>{tc("preopSummaryEditPreop")}</Text>
            </TouchableOpacity>
          ) : null}
        </View>
        {consent ? <Text style={{ color: colors.textMuted, fontSize: 12, lineHeight: 17 }}>{tc("preopSummaryConsentNote")}</Text> : null}
        {consent && layout === "C" ? <ConsentTechniqueChips chosen={techniques} onChange={setTechniques} language={lang} tc={tc} /> : null}

        {loading ? <ScreenState title={tc("preopSummaryTitle")} loading /> : null}
        {!loading && !data ? <Text style={{ color: colors.warning, fontSize: 13 }}>{tc("preopSummaryOffline")}</Text> : null}
        {data ? <PreopSummaryCard data={data} language={lang} tc={tc} /> : null}
      </ScrollView>
    </>
  )
}
