import { useCallback, useEffect, useState } from "react"
import { ActivityIndicator, RefreshControl, ScrollView, Text, View } from "react-native"
import { Stack } from "expo-router"
import type { IndicatorConfig, IndicatorsReport, Share, Spread } from "@lospor/core/indicators"
import { apiJson } from "@/lib/api"
import { displayClinicalCode } from "@/lib/clinical-display"
import { usePreferences } from "@/lib/preferences-context"
import { AppHeader } from "@/components/AppHeader"
import { WorkflowPill } from "@/components/clinical-ui"
import { colors, withAlpha } from "@/theme/colors"

/**
 * The unit indicators on the phone (10.0.0): the department's figures,
 * compact, a few per section. The web has every figure and every filter.
 */
type Response = { pending: number; config: IndicatorConfig; report: IndicatorsReport }

const DAY = 86_400_000
const PERIODS = [{ days: 30, key: "indPeriod30" }, { days: 90, key: "indPeriod90" }, { days: 365, key: "indPeriod365" }] as const
const MODES = [{ value: "", key: "indAll" }, { value: "ADULT", key: "indAdults" }, { value: "PEDIATRIC", key: "indChildren" }] as const

export default function IndicatorsScreen() {
  const { t, language } = usePreferences()
  const [days, setDays] = useState<number>(90)
  const [mode, setMode] = useState("")
  const [data, setData] = useState<Response | null>(null)
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const to = new Date()
      const from = new Date(to.getTime() - (days - 1) * DAY)
      const params = new URLSearchParams({ from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10), ...(mode ? { mode } : {}) })
      setData(await apiJson<Response>(`/api/indicators?${params.toString()}`, { timeoutMs: 30_000 }))
      setFailed(false)
    } catch {
      setFailed(true)
    } finally {
      setLoading(false)
    }
  }, [days, mode])

  useEffect(() => { void load() }, [load])
  // Cases still being worked out: ask again shortly.
  useEffect(() => {
    if (!data?.pending || loading) return
    const timer = setTimeout(() => void load(), 1500)
    return () => clearTimeout(timer)
  }, [data, load, loading])

  const fewer = t("indFewer")
  const pct = (value: number) => `${Math.round(value * 100)} %`
  const share = (value: Share) => value.share == null ? fewer : `${pct(value.share)} (${value.count}/${value.of})`
  const median = (value: Spread, unit = "") => value.median == null ? fewer : `${value.median}${unit ? ` ${unit}` : ""}`
  const report = data?.report
  const bandLabel = (key: string) => {
    const band = data?.config.hypotensionBands.find(item => item.key === key)
    return band ? (language === "bg" ? band.labelBg : band.labelEn) : key
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Stack.Screen options={{ title: t("indTitle"), headerShown: false }} />
      <AppHeader title={t("indTitle")} showNewCase={false} />
      <ScrollView
        testID="indicators"
        contentContainerStyle={{ padding: 16, paddingBottom: 60, gap: 14 }}
        refreshControl={<RefreshControl refreshing={loading && !!data} onRefresh={() => void load()} tintColor={colors.primary} />}
      >
        <Text style={{ color: colors.textMuted, fontSize: 12 }}>{t("indSubtitle")}</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {PERIODS.map(period => <WorkflowPill key={period.days} label={t(period.key)} selected={days === period.days} onPress={() => setDays(period.days)} />)}
        </View>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {MODES.map(item => <WorkflowPill key={item.key} label={t(item.key)} selected={mode === item.value} onPress={() => setMode(item.value)} />)}
        </View>

        {failed ? <Text style={{ color: colors.danger, fontSize: 14 }}>{t("indFailed")}</Text> : null}
        {loading && !report ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}><ActivityIndicator color={colors.primary} /><Text style={{ color: colors.textMuted }}>{t("indLoading")}</Text></View>
        ) : null}
        {data && data.pending > 0 ? <Text style={{ color: colors.warning, fontSize: 12 }}>{t("indPending").replace("{count}", String(data.pending))}</Text> : null}

        {report && report.cases === 0 ? <Text style={{ color: colors.textMuted }}>{t("indNone")}</Text> : null}
        {report && report.cases > 0 ? (
          <>
            <Text testID="indicators-cases" style={{ color: colors.textPrimary, fontSize: 15, fontWeight: "800" }}>{t("indCases").replace("{count}", String(report.cases))}</Text>

            <Section title={t("indActivity")}>
              <Row label={t("indChildrenShare")} value={share(report.caseMix.pediatric)} />
              <Row label={t("indCancelled")} value={share(report.activity.cancelled)} />
              <Row label={t("indTopTechnique")} value={report.activity.byTechnique[0] ? `${displayClinicalCode("option:TECHNIQUE", report.activity.byTechnique[0].key, language, { label: report.activity.byTechnique[0].key })} · ${report.activity.byTechnique[0].count ?? fewer}` : "—"} />
              {report.activity.byTheatre.some(row => row.id) ? (
                <Row label={t("indBusiestTheatre")} value={(() => { const top = report.activity.byTheatre.find(row => row.id); return top ? `${top.name} · ${top.cases ?? fewer}` : "—" })()} />
              ) : null}
            </Section>

            <Section title={t("indTime")}>
              <Row label={t("indMedianDuration")} value={median(report.time.duration, "min")} />
              <Row label={t("indTurnover")} value={median(report.time.turnover, "min")} />
            </Section>

            <Section title={t("indCaseMix")}>
              <Row label={t("indAsa")} value={report.caseMix.asa.map(row => `${row.key}: ${row.count ?? fewer}`).join(" · ") || "—"} />
            </Section>

            <Section title={t("indAirway")}>
              <Row label={t("indVideoLaryngoscope")} value={share(report.airway.videoLaryngoscope)} />
              <Row label={t("indCl34")} value={share(report.airway.cormackLehane3or4)} />
              <Row label={t("indAirwayComplications")} value={share(report.airway.airwayComplications)} />
            </Section>

            <Section title={t("indDrugs")}>
              <Row label={t("indMorphine")} value={`${t("indWard")} ${median(report.drugs.morphineMg, "mg")}`} />
              {(() => {
                const me = report.drugs.byClinician.find(row => row.isMe)
                return me ? <Row label={`${t("indMorphine")} · ${t("indYou")}`} value={`${median(me.morphineMg, "mg")} · ${median(me.morphineMgPerKg, "mg/kg")}`} /> : null
              })()}
              <Row label={t("indMorphinePerKg")} value={`${t("indWard")} ${median(report.drugs.morphineMgPerKg, "mg/kg")}`} />
              <Row label={t("indTiva")} value={share(report.drugs.tiva)} />
              <Row label={t("indSugammadex")} value={share(report.drugs.sugammadex)} />
              <Row label={t("indPonvProphylaxis")} value={share(report.drugs.ponvProphylaxisHighRisk)} />
            </Section>

            <Section title={t("indEnvironment")}>
              <Row label={t("indCo2eTotal")} value={report.environment.totalKgCo2e == null ? fewer : `${report.environment.totalKgCo2e} kg CO₂e`} />
              <Row label={t("indCo2ePerCase")} value={median(report.environment.kgCo2ePerCase, "kg CO₂e")} />
              <Row label={t("indDesflurane")} value={share(report.environment.desflurane)} />
            </Section>

            <Section title={t("indFluids")}>
              <Row label={t("indCrystalloid")} value={median(report.fluids.crystalloidMlPerKgH)} />
              <Row label={t("indTransfused")} value={share(report.fluids.transfused)} />
            </Section>

            <Section title={t("indEvents")}>
              <Text style={{ color: colors.textMuted, fontSize: 12, marginBottom: 2 }}>{t("indHypotension")}</Text>
              {report.intraopEvents.hypotension.filter(row => row.cases > 0).map(row => (
                <Row key={row.band} label={bandLabel(row.band)} value={`${share(row.withHypotension)} · ${median(row.minutes, "min")}`} />
              ))}
              <Row label={`${t("indDesaturation")} (< ${data!.config.spo2Below} %)`} value={share(report.intraopEvents.desaturation)} />
              <Row label={`${t("indHypothermia")} (< ${data!.config.tempBelow} °C)`} value={share(report.intraopEvents.hypothermia)} />
              <Row label={t("indComplicationsPer100")} value={report.intraopEvents.complicationsPer100 == null ? fewer : String(report.intraopEvents.complicationsPer100)} />
            </Section>

            <Section title={t("indRecovery")}>
              <Row label={`${t("indPain")} (> ${data!.config.painAbove})`} value={share(report.recovery.painAboveThreshold)} />
              <Row label={t("indPonv")} value={share(report.recovery.ponv)} />
              <Row label={t("indDelirium")} value={share(report.recovery.emergenceDelirium)} />
              <Row label={t("indIcu")} value={share(report.recovery.icu)} />
            </Section>

            <Section title={t("indDocumentation")}>
              <Row label={t("indFinalised")} value={share(report.documentation.finalised)} />
              <Row label={t("indHoursToFinalise")} value={median(report.documentation.hoursToFinalise, "h")} />
              <Row label={t("indAwaitingReview")} value={report.documentation.awaitingReview == null ? fewer : String(report.documentation.awaitingReview)} />
            </Section>

            <Text style={{ color: colors.textMuted, fontSize: 12, textAlign: "center" }}>{t("indMoreOnWeb")}</Text>
          </>
        ) : null}
      </ScrollView>
    </View>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ backgroundColor: colors.surfaceRaised, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 14, gap: 8 }}>
      <Text style={{ color: colors.primary, fontSize: 12, fontWeight: "900", textTransform: "uppercase", letterSpacing: 0.6 }}>{title}</Text>
      {children}
    </View>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 12, borderTopWidth: 1, borderTopColor: withAlpha(colors.border, "66"), paddingTop: 7 }}>
      <Text style={{ color: colors.textSecondary, fontSize: 13, flex: 1 }}>{label}</Text>
      <Text style={{ color: colors.textPrimary, fontSize: 13, fontWeight: "800", fontVariant: ["tabular-nums"], textAlign: "right", flexShrink: 1 }}>{value}</Text>
    </View>
  )
}
