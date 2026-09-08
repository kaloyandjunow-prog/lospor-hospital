import { Platform, Text } from "react-native"
import { usePreferences } from "@/lib/preferences-context"
import { API_BASE } from "@/lib/api"
import { Card, SectionHeader, SettingsRow } from "@/components/ui"
import { colors } from "@/theme/colors"

export type DiagState = {
  hasToken: boolean; expired: boolean; role?: string; userId?: string
  institution?: string; expiresAt?: string
  lastOk?: string | null; lastError?: string | null; queuedSaves: number
} | null

/** Split out of SettingsPreferencesView: pure display over a diagnostics snapshot the parent owns. */
export function DiagnosticsCard({
  diag, refreshDiagnostics, retryQueuedSaves,
}: {
  diag: DiagState
  refreshDiagnostics: () => Promise<void>
  retryQueuedSaves: () => Promise<void>
}) {
  const { t, language } = usePreferences()

  return (
    <>
      <SectionHeader title={t("diagnostics")} />
      <Card>
        <SettingsRow label={t("diagApiBase")} subtitle={API_BASE || t("diagSameOriginApi")} />
        <SettingsRow
          label={Platform.OS === "web" ? t("diagAuthSession") : t("diagAuthToken")}
          subtitle={Platform.OS === "web"
            ? t("diagHttpOnlyCookie")
            : diag?.hasToken
              ? (diag.expired ? t("diagTokenPresentExpired") : t("diagTokenPresentValid"))
              : t("diagTokenMissing")}
        />
        <SettingsRow label={t("diagRole")} subtitle={diag?.role ?? t("diagUnknown")} />
        <SettingsRow label={t("diagInstitution")} subtitle={diag?.institution ?? t("diagUnknown")} />
        <SettingsRow label={t("diagUserId")} subtitle={diag?.userId ?? t("diagUnknown")} />
        <SettingsRow label={t("diagExpires")} subtitle={diag?.expiresAt ?? t("diagUnknown")} />
        <SettingsRow label={t("diagQueuedSaves")} subtitle={diag ? String(diag.queuedSaves) : t("diagUnknown")} onPress={retryQueuedSaves} />
        <SettingsRow label={t("diagLastOk")} subtitle={diag?.lastOk ? new Date(diag.lastOk).toLocaleString(language === "bg" ? "bg-BG" : "en-GB") : t("diagNoneYet")} />
        <SettingsRow label={t("diagLastError")} subtitle={diag?.lastError ?? t("diagNone")} onPress={refreshDiagnostics} last />
        <Text style={{ color: colors.textMuted, fontSize: 11, paddingHorizontal: 16, paddingBottom: 12 }}>
          {t("diagRefreshHint")}
        </Text>
      </Card>
    </>
  )
}
