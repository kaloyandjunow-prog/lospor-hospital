import { useEffect, useState } from "react"
import { Linking, Platform, ScrollView, Share, Text, TouchableOpacity, View } from "react-native"
import Constants from "expo-constants"
import { Stack, useRouter } from "expo-router"

import { AppHeader } from "@/components/AppHeader"
import { SupportDiagnosticPreview } from "@/components/SupportDiagnosticPreview"
import { API_BASE, getLastApiError, getLastOkRequest } from "@/lib/api"
import { LOSPOR_MOBILE_CLIENT_VERSION } from "@/lib/client-version"
import {
  loadDeploymentSupport,
  NO_DEPLOYMENT_SUPPORT,
  supportContactUrlWithReport,
  type DeploymentSupport,
} from "@/lib/deployment-support"
import { timingSummary } from "@/lib/diagnostics"
import { notify } from "@/lib/notify"
import { getQueuedCasePatchSummary } from "@/lib/offline-case-patches"
import { getDroppedIntraopEvents } from "@/lib/pending-intraop-events"
import { usePreferences } from "@/lib/preferences-context"
import { buildPrivacySafeDiagnosticReport } from "@/lib/support-report"
import { colors } from "@/theme/colors"

export default function SupportScreen() {
  const router = useRouter()
  const { language, t } = usePreferences()
  const [report, setReport] = useState<string | null>(null)
  const [support, setSupport] = useState<DeploymentSupport>(NO_DEPLOYMENT_SUPPORT)

  useEffect(() => {
    let active = true
    const generatedAt = new Date().toISOString()
    void Promise.all([
      getLastOkRequest().catch(() => null),
      getLastApiError().catch(() => null),
      getQueuedCasePatchSummary().catch(() => ({ count: 0 })),
      getDroppedIntraopEvents().catch(() => []),
      loadDeploymentSupport(),
    ]).then(([lastSuccessfulRequest, lastRequestError, queued, dropped, configuredSupport]) => {
      if (!active) return
      setSupport(configuredSupport)
      setReport(buildPrivacySafeDiagnosticReport({
        generatedAt,
        appVersion: Constants.expoConfig?.version ?? "?",
        clientVersion: LOSPOR_MOBILE_CLIENT_VERSION,
        platform: Platform.OS,
        language,
        apiMode: API_BASE ? "configured-native-origin" : "same-origin",
        lastSuccessfulRequest,
        lastRequestError,
        queuedSaves: queued.count,
        droppedEvents: dropped.length,
        timingSamples: timingSummary().count,
      }, t))
    })
    return () => { active = false }
  }, [language, t])

  async function copyOrShare() {
    if (!report) return
    try {
      if (
        Platform.OS === "web"
        && typeof navigator !== "undefined"
        && navigator.clipboard?.writeText
      ) {
        await navigator.clipboard.writeText(report)
        notify(t("diagnosticCopied"))
        return
      }
      await Share.share({ message: report, title: t("problemReportTitle") })
    } catch {
      notify(
        t("error"),
        Platform.OS === "web" ? t("diagnosticCopyFailed") : t("diagnosticShareFailed"),
      )
    }
  }

  function openSupport() {
    if (!report || !support.contactUrl) return
    try {
      const url = supportContactUrlWithReport(
        support.contactUrl,
        report,
        `LOSPOR — ${t("problemReportTitle")}`,
      )
      void Linking.openURL(url).catch(() => notify(t("error"), t("supportLinkFailed")))
    } catch {
      notify(t("error"), t("supportLinkFailed"))
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Stack.Screen options={{ headerShown: false }} />
      <AppHeader title={t("problemReportTitle")} showNewCase={false} onBack={() => router.back()} />
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 48, gap: 16 }}>
        <Text style={{ color: colors.textSecondary, fontSize: 14, lineHeight: 21 }}>
          {t("problemReportIntro")}
        </Text>
        {report ? (
          <SupportDiagnosticPreview
            title={t("diagnosticPreviewTitle")}
            notice={t("diagnosticPrivacyNotice")}
            report={report}
          />
        ) : (
          <Text style={{ color: colors.textMuted, fontSize: 13 }}>{t("diagnosticLoading")}</Text>
        )}

        <TouchableOpacity
          accessibilityRole="button"
          disabled={!report}
          onPress={() => { void copyOrShare() }}
          style={{
            alignItems: "center",
            backgroundColor: colors.primary,
            borderRadius: 14,
            opacity: report ? 1 : 0.5,
            paddingVertical: 14,
          }}
        >
          <Text style={{ color: colors.background, fontSize: 14, fontWeight: "900" }}>
            {Platform.OS === "web" ? t("copyDiagnosticReport") : t("shareDiagnosticReport")}
          </Text>
        </TouchableOpacity>

        {support.contactUrl ? (
          <TouchableOpacity
            accessibilityRole="link"
            disabled={!report}
            onPress={openSupport}
            style={{ alignItems: "center", borderColor: colors.border, borderRadius: 14, borderWidth: 1, opacity: report ? 1 : 0.5, paddingVertical: 13 }}
          >
            <Text style={{ color: colors.primary, fontSize: 13, fontWeight: "800" }}>
              {t("openSupportContact")}
            </Text>
          </TouchableOpacity>
        ) : (
          <Text style={{ color: colors.textMuted, fontSize: 12, lineHeight: 18 }}>
            {t("supportNotConfigured")}
          </Text>
        )}
      </ScrollView>
    </View>
  )
}
