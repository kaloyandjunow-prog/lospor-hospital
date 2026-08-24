import { useCallback, useEffect, useState } from "react"
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native"
import { Stack } from "expo-router"
import { ApiError, apiJson } from "@/lib/api"
import { usePreferences } from "@/lib/preferences-context"
import { ScreenState } from "@/components/clinical-ui"
import { colors, withAlpha } from "@/theme/colors"
import {
  auditActionLabel,
  parseAuditActionDefinitions,
  type AuditActionDefinition,
} from "@/lib/audit-actions"

type AuditLog = {
  id: string
  createdAt: string
  action: string
  entityId: string
  detail?: unknown
  user?: { name?: string; firstName?: string; lastName?: string; title?: string }
}

type AuditResponse = {
  logs: AuditLog[]
  total: number
  page: number
  pageSize: number
  actions?: unknown
}

function userLabel(user: AuditLog["user"] | undefined, fallback: string) {
  if (!user) return fallback
  return user.name || [user.title, user.firstName, user.lastName].filter(Boolean).join(" ") || fallback
}

function detailLabel(detail: unknown) {
  if (!detail) return null
  if (typeof detail === "string") return detail
  try {
    return JSON.stringify(detail)
  } catch {
    return null
  }
}

export default function AuditLogsScreen() {
  const { t, language } = usePreferences()
  const [logs, setLogs] = useState<AuditLog[]>([])
  const [page, setPage] = useState(0)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [forbidden, setForbidden] = useState(false)
  const [action, setAction] = useState("")
  const [actionCatalog, setActionCatalog] = useState<AuditActionDefinition[]>([])
  const [filterOpen, setFilterOpen] = useState(false)
  const [filterQuery, setFilterQuery] = useState("")

  const load = useCallback(async (nextPage = 0, mode: "initial" | "refresh" | "more" = "initial") => {
    if (mode === "refresh") setRefreshing(true)
    else if (mode === "more") setLoadingMore(true)
    else setLoading(true)
    try {
      setError(null)
      const params = new URLSearchParams({
        page: String(nextPage),
        ...(action ? { action } : {}),
      })
      const data = await apiJson<AuditResponse>(`/api/admin/audit-logs?${params}`)
      setForbidden(false)
      setPage(data.page)
      setTotal(data.total)
      setLogs((prev) => nextPage === 0 ? data.logs : [...prev, ...data.logs])
      setActionCatalog(parseAuditActionDefinitions(data.actions))
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
  }, [action, t])

  useEffect(() => {
    load()
  }, [load])

  function loadMore() {
    if (loadingMore || logs.length >= total) return
    load(page + 1, "more")
  }

  const filteredActions = actionCatalog.filter(item => {
    const query = filterQuery.trim().toLowerCase()
    if (!query) return true
    return `${item.code} ${item.labels.bg} ${item.labels.en}`.toLowerCase().includes(query)
  })

  const selectedActionLabel = action
    ? auditActionLabel(actionCatalog, action, language)
    : t("allAuditActions")

  return (
    <>
      <Stack.Screen options={{ title: t("auditLogs") }} />
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        {loading ? (
          <ScreenState title={t("loadingAuditLogs")} loading />
        ) : forbidden || error ? (
          <ScreenState title={forbidden ? t("adminOnly") : t("auditUnavailable")} message={error ?? undefined} action={t("retry")} onAction={() => load(0, "refresh")} />
        ) : (
          <FlatList
            data={logs}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{ padding: 20, paddingBottom: 60 }}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(0, "refresh")} tintColor={colors.primary} />}
            onEndReached={loadMore}
            onEndReachedThreshold={0.4}
            ListHeaderComponent={
              <View style={{ marginBottom: 14 }}>
                <Text style={{ color: colors.textPrimary, fontSize: 20, fontWeight: "900" }}>{total} {t("events")}</Text>
                <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 3 }}>{t("newestAuditFirst")}</Text>
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityLabel={t("auditActionFilter")}
                  onPress={() => setFilterOpen(true)}
                  style={{
                    marginTop: 12,
                    borderWidth: 1,
                    borderColor: colors.border,
                    borderRadius: 12,
                    paddingHorizontal: 12,
                    paddingVertical: 10,
                    backgroundColor: colors.surfaceRaised,
                  }}
                >
                  <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: "700" }}>{t("auditActionFilter")}</Text>
                  <Text style={{ color: colors.textPrimary, fontSize: 13, fontWeight: "800", marginTop: 2 }}>{selectedActionLabel}</Text>
                </TouchableOpacity>
              </View>
            }
            renderItem={({ item }) => (
              <View style={{ backgroundColor: colors.surfaceRaised, borderRadius: 14, borderCurve: "continuous", borderWidth: 1, borderColor: colors.border, padding: 14, marginBottom: 10 }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 10, marginBottom: 6 }}>
                  <Text style={{ color: colors.primary, fontSize: 13, fontWeight: "900", flex: 1 }}>{auditActionLabel(actionCatalog, item.action, language)}</Text>
                  <Text style={{ color: colors.textMuted, fontSize: 11 }}>{new Date(item.createdAt).toLocaleString(language === "bg" ? "bg-BG" : "en-GB")}</Text>
                </View>
                <Text style={{ color: colors.textPrimary, fontSize: 13, fontWeight: "700" }}>{userLabel(item.user, t("unknownUser"))}</Text>
                <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 3 }}>{t("entity")} {item.entityId}</Text>
                {detailLabel(item.detail) ? (
                  <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 6 }} numberOfLines={3}>{detailLabel(item.detail)}</Text>
                ) : null}
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
        <Modal visible={filterOpen} transparent animationType="slide" onRequestClose={() => setFilterOpen(false)}>
          <Pressable
            onPress={() => setFilterOpen(false)}
            style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.65)", justifyContent: "flex-end" }}
          >
            <Pressable
              onPress={() => {}}
              style={{
                maxHeight: "82%",
                width: "100%",
                maxWidth: 560,
                alignSelf: "center",
                backgroundColor: colors.surfaceRaised,
                borderTopLeftRadius: 22,
                borderTopRightRadius: 22,
                padding: 18,
              }}
            >
              <Text style={{ color: colors.textPrimary, fontSize: 18, fontWeight: "900", marginBottom: 12 }}>{t("auditActionFilter")}</Text>
              <TextInput
                value={filterQuery}
                onChangeText={setFilterQuery}
                accessibilityLabel={t("searchAuditActions")}
                placeholder={t("searchAuditActions")}
                placeholderTextColor={colors.textMuted}
                style={{
                  color: colors.textPrimary,
                  borderWidth: 1,
                  borderColor: colors.border,
                  borderRadius: 12,
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                  marginBottom: 10,
                }}
              />
              <TouchableOpacity
                onPress={() => {
                  setAction("")
                  setFilterOpen(false)
                  setFilterQuery("")
                }}
                style={{ padding: 12, borderBottomWidth: 1, borderBottomColor: colors.border }}
              >
                <Text style={{ color: action === "" ? colors.primary : colors.textPrimary, fontWeight: "800" }}>{t("allAuditActions")}</Text>
              </TouchableOpacity>
              <FlatList
                data={filteredActions}
                keyExtractor={item => item.code}
                ListEmptyComponent={<Text style={{ color: colors.textMuted, padding: 16 }}>{t("noAuditActions")}</Text>}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    onPress={() => {
                      setAction(item.code)
                      setFilterOpen(false)
                      setFilterQuery("")
                    }}
                    style={{ padding: 12, borderBottomWidth: 1, borderBottomColor: colors.border }}
                  >
                    <Text style={{ color: action === item.code ? colors.primary : colors.textPrimary, fontWeight: "800" }}>
                      {auditActionLabel(actionCatalog, item.code, language)}
                    </Text>
                    <Text style={{ color: colors.textMuted, fontSize: 10, marginTop: 2 }}>{item.code}</Text>
                  </TouchableOpacity>
                )}
              />
              <TouchableOpacity onPress={() => setFilterOpen(false)} style={{ paddingVertical: 14, alignItems: "center" }}>
                <Text style={{ color: colors.textMuted, fontWeight: "800" }}>{t("cancel")}</Text>
              </TouchableOpacity>
            </Pressable>
          </Pressable>
        </Modal>
      </View>
    </>
  )
}
