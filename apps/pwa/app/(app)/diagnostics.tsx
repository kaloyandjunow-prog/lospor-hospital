import { useCallback, useEffect, useState } from "react"
import { ScrollView, Text, TouchableOpacity, View } from "react-native"

import { AppHeader } from "@/components/AppHeader"
import { formatMessage } from "@/i18n/locale"
import { autosaveNetworkState } from "@/lib/autosave-manager"
import { clearTimings, recentTimings, timingSummary, type TimingSample } from "@/lib/diagnostics"
import { getQueuedCasePatchSummary } from "@/lib/offline-case-patches"
import { offlineVocabularyVersion } from "@/lib/offline-vocabulary"
import {
  usePreferences,
  type ClinicalStringKey,
  type TranslationKey,
} from "@/lib/preferences-context"
import { colors } from "@/theme/colors"

/**
 * What the app is doing right now, in numbers.
 *
 * Performance complaints arrive as impressions ("tabs take 5-10 seconds") from
 * a phone that cannot be profiled remotely, and the PWA does not reproduce
 * native timing. This screen turns the impression into a figure that can be
 * read out, which is the difference between diagnosing and guessing.
 */
const TAB_LABEL_KEYS: Record<string, ClinicalStringKey> = {
  equipment: "tabEquipment",
  technique: "tabTechnique",
  timing: "tabTiming",
  position: "tabPosition",
  monitoring: "tabMonitoring",
  airway: "tabAirway",
  vascular: "tabVascular",
  premedication: "tabPremedication",
  log: "tabLog",
  events: "tabEvents",
}

function localizedTiming(
  sample: TimingSample,
  t: (key: TranslationKey) => string,
  tc: (key: ClinicalStringKey) => string,
): { label: string; note?: string } {
  if (!sample.intraopTab) return { label: sample.label, ...(sample.note ? { note: sample.note } : {}) }
  const details = sample.intraopTab
  const tabKey = TAB_LABEL_KEYS[details.tab]
  const tab = tabKey ? tc(tabKey) : details.tab
  const phase = (value: number | undefined) => value === undefined ? "?" : Math.round(value)
  return {
    label: formatMessage(t("diagnosticsTabSample"), { tab }),
    note: [
      formatMessage(t("diagnosticsTimingNote"), {
        blocked: Math.round(details.blockedMs),
        render: Math.round(details.renderMs),
        saves: details.pendingSaves,
      }),
      formatMessage(t("diagnosticsRenderPhases"), {
        buildTab: phase(details.renderPhases.buildTab),
        buildSheets: phase(details.renderPhases.buildSheets),
        walkTab: phase(details.renderPhases.walkTab),
        walkSheets: phase(details.renderPhases.walkSheets),
        tabTree: phase(details.renderPhases.tabTree),
        sheetTree: phase(details.renderPhases.sheetTree),
      }),
    ].join("\n"),
  }
}

export default function DiagnosticsScreen() {
  const { t, tc } = usePreferences()
  const [timings, setTimings] = useState<readonly TimingSample[]>(recentTimings())
  const [queued, setQueued] = useState<number | null>(null)
  const [vocabulary, setVocabulary] = useState<string | null>(null)
  const [network, setNetwork] = useState(autosaveNetworkState())

  const refresh = useCallback(() => {
    setTimings([...recentTimings()])
    setNetwork(autosaveNetworkState())
    void getQueuedCasePatchSummary().then(s => setQueued(s.count)).catch(() => setQueued(null))
  }, [])

  useEffect(() => {
    refresh()
    void offlineVocabularyVersion().then(setVocabulary).catch(() => setVocabulary(null))
    const timer = setInterval(refresh, 2_000)
    return () => clearInterval(timer)
  }, [refresh])

  const summary = timingSummary()

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <AppHeader title={t("diagnosticsTitle")} showNewCase={false} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 14 }}>
        <Card title={t("diagnosticsSaving")}>
          <Row label={t("diagnosticsQueued")} value={queued == null ? "—" : String(queued)} />
          <Row
            label={t("diagnosticsNetwork")}
            value={network.down ? t("diagnosticsNetworkDown") : t("diagnosticsNetworkOk")}
            tone={network.down ? "warn" : "ok"}
          />
        </Card>

        <Card title={t("diagnosticsVocabulary")}>
          <Row label={t("diagnosticsVocabularyVersion")} value={vocabulary ?? "—"} />
        </Card>

        <Card title={t("diagnosticsTabTimings")}>
          {summary.count === 0 ? (
            <Text style={{ color: colors.textMuted, fontSize: 13 }}>
              {t("diagnosticsNoSamples")}
            </Text>
          ) : (
            <>
              <Row label={t("diagnosticsMedian")} value={`${summary.median} ms`} />
              <Row
                label={t("diagnosticsWorst")}
                value={`${summary.worst} ms`}
                tone={summary.worst > 1000 ? "warn" : "ok"}
              />
              <View style={{ height: 8 }} />
              {timings.map((sample, index) => {
                const localized = localizedTiming(sample, t, tc)
                return (
                <View key={`${sample.at}-${index}`}>
                  <Row
                    label={localized.label}
                    value={`${sample.ms} ms`}
                    tone={sample.ms > 1000 ? "warn" : undefined}
                  />
                  {localized.note ? (
                    <Text style={{
                      color: colors.textMuted, fontSize: 10, marginTop: -2, marginBottom: 4,
                      fontVariant: ["tabular-nums"],
                    }}>
                      {localized.note}
                    </Text>
                  ) : null}
                </View>
                )
              })}
            </>
          )}
        </Card>

        <TouchableOpacity
          onPress={() => { clearTimings(); refresh() }}
          style={{
            borderWidth: 1, borderColor: colors.border, borderRadius: 12,
            paddingVertical: 12, alignItems: "center",
          }}
        >
          <Text style={{ color: colors.textMuted, fontSize: 13, fontWeight: "800" }}>
            {t("diagnosticsReset")}
          </Text>
        </TouchableOpacity>

        <Text style={{ color: colors.textMuted, fontSize: 11, lineHeight: 16 }}>
          {t("diagnosticsFootnote")}
        </Text>
      </ScrollView>
    </View>
  )
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{
      backgroundColor: colors.surface, borderRadius: 14,
      borderWidth: 1, borderColor: colors.border, padding: 14, gap: 6,
    }}>
      <Text style={{
        color: colors.textMuted, fontSize: 10, fontWeight: "800",
        letterSpacing: 1.1, textTransform: "uppercase", marginBottom: 4,
      }}>
        {title}
      </Text>
      {children}
    </View>
  )
}

function Row({ label, value, tone }: { label: string; value: string; tone?: "ok" | "warn" }) {
  const color = tone === "warn" ? colors.warning : tone === "ok" ? colors.success : colors.textPrimary
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 3 }}>
      <Text style={{ color: colors.textMuted, fontSize: 13, flexShrink: 1 }} numberOfLines={1}>
        {label}
      </Text>
      <Text style={{
        color, fontSize: 13, fontWeight: "800", flex: 1, minWidth: 0,
        textAlign: "right", fontVariant: ["tabular-nums"],
      }}>
        {value}
      </Text>
    </View>
  )
}

export const unstable_settings = { headerShown: false }
