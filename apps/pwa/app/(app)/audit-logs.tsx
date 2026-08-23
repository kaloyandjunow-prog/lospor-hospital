import { useCallback, useEffect, useState } from "react"
import { ActivityIndicator, FlatList, RefreshControl, ScrollView, Text, TouchableOpacity, View } from "react-native"
import { Stack } from "expo-router"
import { ApiError, apiJson } from "@/lib/api"
import { usePreferences } from "@/lib/preferences-context"
import { ScreenState } from "@/components/clinical-ui"
import { colors, withAlpha } from "@/theme/colors"
import {
  auditActionLabel,
  parseAuditPage,
  type AuditActionDefinition,
  type SafeAuditRow,
} from "@/lib/audit-actions"

function userLabel(user: SafeAuditRow["user"] | undefined, fallback: string) {
  if (!user) return fallback
  const composed = [user.title, user.firstName, user.lastName].filter(Boolean).join(" ")
  return user.name || composed || fallback
}

export default function AuditLogsScreen() {
  const { language, t } = usePreferences()
  const [logs, setLogs] = useState<SafeAuditRow[]>([])
  const [actions, setActions] = useState<AuditActionDefinition[]>([])
  const [selectedAction, setSelectedAction] = useState("")
  const [page, setPage] = useState(0)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [forbidden, setForbidden] = useState(false)

  const load = useCallback(async (
    nextPage = 0,
    mode: "initial" | "refresh" | "more" = "initial",
    requestedAction = "",
  ) => {
    if (mode === "refresh") setRefreshing(true)
    else if (mode === "more") setLoadingMore(true)
    else setLoading(true)
    try {
      setError(null)
      const suffix = requestedAction ? `&action=${encodeURIComponent(requestedAction)}` : ""
      const raw = await apiJson<unknown>(`/api/admin/audit-logs?page=${nextPage}${suffix}`)
      const data = parseAuditPage(raw)
      if (!data) throw new Error("AUDIT_CONTRACT_UNAVAILABLE")
      setForbidden(false)
      setPage(data.page)
      setTotal(data.total)
      setActions(data.actions)
      setLogs((prev) => nextPage === 0 ? data.logs : [...prev, ...data.logs])
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) {
        setForbidden(true)
        setError(t("auditAdminOnly"))
      } else {
        setError(t("auditUnavailable"))
      }
    } finally {
      setLoading(false)
      setRefreshing(false)
      setLoadingMore(false)
    }
  }, [t])

  useEffect(() => {
    load(0, "initial", "")
  }, [load])

  function loadMore() {
    if (loadingMore || logs.length >= total) return
    load(page + 1, "more", selectedAction)
  }

  function chooseAction(code: string) {
    setSelectedAction(code)
    void load(0, "initial", code)
  }

  return (
    <>
      <Stack.Screen options={{ title: t("auditLogs") }} />
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        {loading ? (
          <ScreenState title={t("loadingAuditLogs")} loading />
        ) : forbidden || error ? (
          <ScreenState title={forbidden ? t("adminOnly") : t("auditUnavailable")} message={error ?? undefined} action={t("retry")} onAction={() => load(0, "refresh", selectedAction)} />
        ) : (
          <FlatList
            data={logs}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{ padding: 20, paddingBottom: 60 }}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(0, "refresh", selectedAction)} tintColor={colors.primary} />}
            onEndReached={loadMore}
            onEndReachedThreshold={0.4}
            ListHeaderComponent={
              <View style={{ marginBottom: 14 }}>
                <Text style={{ color: colors.textPrimary, fontSize: 20, fontWeight: "900" }}>{total} {t("events")}</Text>
                <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 3 }}>{t("newestAuditFirst")}</Text>
                <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 3 }}>{t("auditPrivacyNotice")}</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ gap: 8, paddingTop: 12, paddingBottom: 2 }}
                >
                  {[{ code: "", labels: { bg: t("auditAllActions"), en: t("auditAllActions") } }, ...actions].map(option => {
                    const selected = option.code === selectedAction
                    const label = option.code ? option.labels[language] : t("auditAllActions")
                    return (
                      <TouchableOpacity
                        key={option.code || "all"}
                        onPress={() => chooseAction(option.code)}
                        accessibilityRole="button"
                        accessibilityState={{ selected }}
                        style={{
                          paddingHorizontal: 12,
                          paddingVertical: 7,
                          borderRadius: 999,
                          backgroundColor: selected ? colors.primary : colors.surfaceRaised,
                          borderWidth: 1,
                          borderColor: selected ? colors.primary : colors.border,
                        }}
                      >
                        <Text style={{ color: selected ? colors.background : colors.textSecondary, fontSize: 12, fontWeight: "800" }}>{label}</Text>
                      </TouchableOpacity>
                    )
                  })}
                </ScrollView>
              </View>
            }
            renderItem={({ item }) => (
              <View style={{ backgroundColor: colors.surfaceRaised, borderRadius: 14, borderCurve: "continuous", borderWidth: 1, borderColor: colors.border, padding: 14, marginBottom: 10 }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 10, marginBottom: 6 }}>
                  <Text style={{ color: colors.primary, fontSize: 13, fontWeight: "900", flex: 1 }}>
                    {auditActionLabel(actions, item.action, language, t("auditUnknownAction"))}
                  </Text>
                  <Text style={{ color: colors.textMuted, fontSize: 11 }}>{new Date(item.createdAt).toLocaleString()}</Text>
                </View>
                <Text style={{ color: colors.textPrimary, fontSize: 13, fontWeight: "700" }}>{userLabel(item.user, t("unknownUser"))}</Text>
              </View>
            )}
            ListFooterComponent={loadingMore ? (
              <View style={{ paddingVertical: 16 }}>
                <ActivityIndicator color={colors.primary} />
              </View>
            ) : logs.length < total ? (
              <TouchableOpacity onPress={loadMore} style={{ alignItems: "center", paddingVertical: 14, borderRadius: 12, borderWidth: 1, borderColor: withAlpha(colors.primary, "66") }}>
                <Text style={{ color: colors.primary, fontWeight: "800" }}>{t("loadMore")}</Text>
              </TouchableOpacity>
            ) : null}
          />
        )}
      </View>
    </>
  )
}
