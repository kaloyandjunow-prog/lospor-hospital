import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { ActivityIndicator, Animated, FlatList, Modal, RefreshControl, ScrollView, Text, TextInput, TouchableOpacity, View } from "react-native"
import { Stack, useRouter, type Href } from "expo-router"
import { ApiError, apiFetch, apiJson } from "@/lib/api"
import { notify } from "@/lib/notify"
import { useCaseHandover } from "@/lib/use-case-handover"
import { PendingHandovers, type PendingTransfer } from "@/components/PendingHandovers"
import { openPrintCase } from "@/lib/print-case"
import { useAuth } from "@/lib/auth-context"
import { useLiveRefresh } from "@/lib/use-live-refresh"
import { getQueuedCasePatchSummary, getQueuedCaseIds, clearAllQueuedPatchesForCase } from "@/lib/offline-case-patches"
import { getAllLocalCaseDrafts, localDraftOwnerFromIdentity, type LocalCaseDraft } from "@/lib/local-case-store"
import { localDraftRecoveryParams, shouldShowLocalDraft } from "@/lib/local-draft-review"
import { usePreferences } from "@/lib/preferences-context"
import { displayClinicalCode } from "@/lib/clinical-display"
import { ASABadge, DispositionBadge, StatusBadge, statusLabel } from "@/components/ui"
import { ScreenState, WorkflowPill } from "@/components/clinical-ui"
import { AppHeader } from "@/components/AppHeader"
import { LocalCaseDraftCard } from "@/components/LocalCaseDraftCard"
import { colors, withAlpha } from "@/theme/colors"
import { deriveCaseStage } from "@lospor/core/case-status"
import { dashboardCaseTarget, preopReadyForAllocation, dashboardTabCounts, type DashboardServerCounts } from "@/lib/dashboard-case-routing"
import { useDashboardPagination } from "@/lib/use-dashboard-pagination"
import { caseIsWritable } from "@lospor/core/case-capabilities"
import { isSameCalendarDay, isSameCalendarMonth } from "@lospor/core/dashboard-date-scope"

type CaseItem = {
  id: string
  caseCode: string
  status: string
  createdAt: string
  preop?: {
    diagnosis?: string
    plannedProcedure?: string
    ageYears?: number
    ageValue?: number
    ageUnit?: "DAYS" | "MONTHS" | "YEARS"
    sex?: string
    asaScore?: string
    diagnoses?: { label: string }[]
    procedures?: { label: string }[]
  }
  intraop?: { monthYear?: string; endTime?: string | null }
  postop?: { disposition?: string }
  user?: { name?: string }
  // Any handover on this case still waiting to be answered. The list endpoint
  // has always returned this; it was simply not read.
  transfers?: { id: string }[]
  capabilities?: { canWrite: boolean } | null
}

type FilterTab = "All" | "Today" | "Month" | "Active" | "Drafts" | "Awaiting Postop" | "Complete" | "Handovers"

const FILTER_TABS: FilterTab[] = ["All", "Today", "Month", "Active", "Drafts", "Awaiting Postop", "Complete", "Handovers"]
const DASHBOARD_REQUEST_TIMEOUT_MS = 8_000
const DASHBOARD_RETRY_INTERVAL_MS = 3_000

// Static English keys for filter tab identifiers — labels are translated via t() at render time
const FILTER_TAB_LABEL_KEYS: Record<FilterTab, "filterAll" | "filterToday" | "month" | "filterActive" | "filterDrafts" | "filterAwaitingPostop" | "filterComplete" | "filterHandovers"> = {
  All: "filterAll",
  Today: "filterToday",
  Month: "month",
  Active: "filterActive",
  Drafts: "filterDrafts",
  "Awaiting Postop": "filterAwaitingPostop",
  Complete: "filterComplete",
  Handovers: "filterHandovers",
}

function getCaseLabel(item: CaseItem, unnamedCase: string): string {
  return (
    item.preop?.procedures?.[0]?.label ??
    item.preop?.plannedProcedure ??
    item.preop?.diagnoses?.[0]?.label ??
    item.preop?.diagnosis ??
    unnamedCase
  )
}

// Europe/Sofia, not the phone's own timezone -- matches the boundary web reads
// from the server process, so the two stop disagreeing near local midnight.
function isToday(iso: string): boolean {
  return isSameCalendarDay(new Date(iso), new Date())
}

function isThisMonth(iso: string): boolean {
  return isSameCalendarMonth(new Date(iso), new Date())
}

function derivedStatus(item: CaseItem): string {
  return deriveCaseStage(item)
  // Postop submitted → awaiting review / closure
  // Case ended but no postop yet → awaiting postop documentation
  // Preop complete (diagnosis + procedure + ASA) → ready to schedule
  // Preop started but incomplete
}

// nextAction returns a translation key rather than a raw string
function nextActionKey(item: CaseItem, hasQueuedIntraop: boolean): "reviewCase" | "openIntraop" | "awaitingAllocation" | "continuePreop" {
  const target = dashboardCaseTarget(item, hasQueuedIntraop)
  if (target === "case") return "reviewCase"
  if (target === "intraop") return "openIntraop"
  return preopReadyForAllocation(item.preop) ? "awaitingAllocation" : "continuePreop"
}

function routeFor(item: CaseItem, hasQueuedIntraop: boolean): Href {
  const target = dashboardCaseTarget(item, hasQueuedIntraop)
  if (target === "case") return `/(app)/cases/${item.id}`
  if (target === "intraop") return `/(app)/cases/intraop/${item.id}`
  return `/(app)/cases/new?continue=${item.id}`
}

export default function DashboardScreen() {
  const router = useRouter()
  const { identity } = useAuth()
  const { t, tc, language } = usePreferences()
  const draftOwner = useMemo(() => localDraftOwnerFromIdentity(identity), [identity])

  const [cases, setCases] = useState<CaseItem[]>([])
  const { counts, setCounts, caseTotal, setCaseTotal, loadingMore, loadMoreCases } = useDashboardPagination(cases, setCases, t, DASHBOARD_REQUEST_TIMEOUT_MS)
  const [localDrafts, setLocalDrafts] = useState<LocalCaseDraft[]>([])
  const [transfers, setTransfers] = useState<PendingTransfer[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [networkLoadFailed, setNetworkLoadFailed] = useState(false)
  const [activeTab, setActiveTab] = useState<FilterTab>("All")
  const [query, setQuery] = useState("")
  const [actioningTransfer, setActioningTransfer] = useState<string | null>(null)
  const [queuedSaveCount, setQueuedSaveCount] = useState(0)
  const [queuedCaseIds, setQueuedCaseIds] = useState<Set<string>>(new Set())
  const [queuedIntraopCaseIds, setQueuedIntraopCaseIds] = useState<Set<string>>(new Set())
  const [searchOpen, setSearchOpen] = useState(false)
  const [menuCase, setMenuCase] = useState<CaseItem | null>(null)
  const [menuMode, setMenuMode] = useState<"menu" | "assign" | "confirmDelete">("menu")
  const { colleagues, loadingColleagues, busy: handoverBusy, loadColleagues, handOver, resolveHandover } =
    useCaseHandover(t)
  const [actionLoading, setActionLoading] = useState(false)
  const cardScales = useRef(new Map<string, Animated.Value>())
  const loadInFlightRef = useRef<Promise<void> | null>(null)
  const retryInFlightRef = useRef(false)
  const networkErrorNotifiedRef = useRef(false)

  const loadCases = useCallback(async () => {
    // Always reload local drafts (fast, no network)
    if (draftOwner) {
      getAllLocalCaseDrafts(draftOwner)
        .then(drafts => setLocalDrafts(drafts.filter(shouldShowLocalDraft)))
        .catch(() => {})
    } else {
      setLocalDrafts([])
    }
    try {
      setLoadError(null)
      // Explicit take: an unset request defaults to 50, silently undercounting
      // every stat tile for a clinic with more open work than that.
      const data = await apiJson<CaseItem[] | { cases: CaseItem[]; counts?: DashboardServerCounts; total?: number }>(
        "/api/cases?take=200",
        { timeoutMs: DASHBOARD_REQUEST_TIMEOUT_MS },
      )
      setCases(Array.isArray(data) ? data : (Array.isArray(data?.cases) ? data.cases : []))
      setCounts(Array.isArray(data) ? null : (data?.counts ?? null))
      setCaseTotal(Array.isArray(data) ? null : (data?.total ?? null))
      setNetworkLoadFailed(false)
      networkErrorNotifiedRef.current = false
    } catch (err) {
      const message = t("couldNotLoadCases")
      const isNetworkFailure = err instanceof ApiError && err.code === "NETWORK"
      setLoadError(message)
      setNetworkLoadFailed(isNetworkFailure)
      if (err instanceof ApiError && err.status === 401) {
        // Expiry retains account-bound unsynced work; only explicit sign-out clears it.
        notify(t("sessionExpired"), t("signInAgainPrompt"))
        return
      }
      if (!isNetworkFailure || !networkErrorNotifiedRef.current) {
        notify(t("error"), message)
      }
      networkErrorNotifiedRef.current = isNetworkFailure
    }
  }, [t, setCounts, setCaseTotal])

  const loadTransfers = useCallback(async () => {
    try {
      const data = await apiJson<PendingTransfer[]>("/api/cases/transfers/pending", {
        timeoutMs: DASHBOARD_REQUEST_TIMEOUT_MS,
      })
      setTransfers(Array.isArray(data) ? data : [])
    } catch {
      setTransfers([])
    }
  }, [])

  const loadQueuedSaves = useCallback(async () => {
    try {
      const [summary, caseIds] = await Promise.all([
        getQueuedCasePatchSummary(),
        getQueuedCaseIds(),
      ])
      setQueuedSaveCount(summary.count)
      setQueuedCaseIds(new Set(caseIds))
      setQueuedIntraopCaseIds(new Set(
        summary.entries
          .filter(entry => entry.section === "intraop")
          .map(entry => entry.caseId),
      ))
    } catch {
      // Local sync storage unavailable; leave counts at 0
    }
  }, [])

  const load = useCallback(
    async (isRefresh = false) => {
      if (isRefresh) setRefreshing(true)
      if (loadInFlightRef.current) return loadInFlightRef.current
      const request = (async () => {
        try {
          await Promise.all([loadCases(), loadTransfers(), loadQueuedSaves()])
        } catch {
          // individual loaders handle their own errors; this catches unexpected throws
        } finally {
          setLoading(false)
          setRefreshing(false)
          loadInFlightRef.current = null
        }
      })()
      loadInFlightRef.current = request
      return request
    },
    [loadCases, loadTransfers, loadQueuedSaves]
  )

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    if (!networkLoadFailed) return
    const retry = () => {
      if (retryInFlightRef.current) return
      retryInFlightRef.current = true
      void load().finally(() => {
        retryInFlightRef.current = false
      })
    }
    retry()
    const interval = setInterval(retry, DASHBOARD_RETRY_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [load, networkLoadFailed])

  // Evict Animated.Value entries for cases that no longer exist
  useEffect(() => {
    const caseIds = new Set(cases.map(c => c.id))
    for (const id of cardScales.current.keys()) {
      if (!caseIds.has(id)) cardScales.current.delete(id)
    }
  }, [cases])

  function getCardScale(id: string): Animated.Value {
    if (!cardScales.current.has(id)) {
      cardScales.current.set(id, new Animated.Value(1))
    }
    return cardScales.current.get(id)!
  }

  const handleLongPress = useCallback((item: CaseItem) => {
    const scale = getCardScale(item.id)
    Animated.spring(scale, { toValue: 0.95, useNativeDriver: true, speed: 50, bounciness: 0 }).start()
    setMenuCase(item)
    setMenuMode("menu")
  }, [])

  function closeMenu() {
    if (menuCase) {
      const scale = getCardScale(menuCase.id)
      Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 40, bounciness: 5 }).start()
    }
    setMenuCase(null)
    setMenuMode("menu")
  }

  function handleDeleteCase() {
    setMenuMode("confirmDelete")
  }

  async function confirmDeleteCase() {
    if (!menuCase) return
    setActionLoading(true)
    try {
      const res = await apiFetch(`/api/cases/${menuCase.id}`, { method: "DELETE" })
      if (!res.ok) throw new Error()
      // Clear any queued offline patches for this case so the badge disappears immediately
      await clearAllQueuedPatchesForCase(menuCase.id)
      closeMenu()
      await loadCases()
    } catch {
      notify(t("error"), t("actionFailed"))
    } finally {
      setActionLoading(false)
    }
  }

  async function handleShowAssign() {
    setMenuMode("assign")
    if (!await loadColleagues()) setMenuMode("menu")
  }

  async function handleAssignTo(userId: string) {
    if (!menuCase) return
    const outcome = await handOver(menuCase.id, userId)
    if (outcome === "failed") return
    closeMenu()
    await Promise.all([loadCases(), loadTransfers()])
    // A request is not an assignment: the case stays this clinician's until
    // somebody accepts it, and silence here would read as "done".
    if (outcome === "requested") notify(t("handOver"), t("handoverRequested"))
  }

  useLiveRefresh(() => load(true), { intervalMs: 20_000 })

  // Only the sender can withdraw, and the server matches on that, so a case
  // this person did not hand over simply has no pending row to cancel.
  const menuCasePending = (menuCase?.transfers?.length ?? 0) > 0
  // Fail-closed, like everywhere else `capabilities` is read: neither Delete nor Handover for a non-writable case.
  const menuCaseWritable = menuCase != null && caseIsWritable(menuCase)

  async function handleWithdrawHandover() {
    if (!menuCase) return
    if (!await resolveHandover(menuCase.id, "cancel")) {
      notify(t("error"), t("actionFailed"))
      return
    }
    closeMenu()
    await Promise.all([loadCases(), loadTransfers()])
  }

  async function handleTransferAction(item: PendingTransfer, action: "accept" | "decline") {
    setActioningTransfer(item.id)
    const ok = await resolveHandover(item.caseId, action)
    setActioningTransfer(null)
    if (!ok) {
      notify(t("error"), t("couldNotActionHandover").replace("{action}", action))
      return
    }
    await Promise.all([loadCases(), loadTransfers()])
  }

  const tabCounts = dashboardTabCounts(counts, cases, transfers.length, isToday, isThisMonth)

  const trimmedQuery = query.trim().toLowerCase()
  const filteredCases = useMemo(() => cases.filter((c) => {
    if (trimmedQuery) {
      const haystack = [getCaseLabel(c, t("unnamedCase")), c.preop?.diagnosis, c.preop?.plannedProcedure, c.caseCode, c.user?.name]
        .filter(Boolean).join(" ").toLowerCase()
      if (!haystack.includes(trimmedQuery)) return false
    }
    if (activeTab === "All") return true
    if (activeTab === "Today") return isToday(c.createdAt)
    if (activeTab === "Month") return isThisMonth(c.createdAt)
    if (activeTab === "Active") return c.status !== "COMPLETE"
    if (activeTab === "Drafts") return c.status === "DRAFT"
    if (activeTab === "Awaiting Postop") return c.status !== "COMPLETE" && !!c.intraop
    if (activeTab === "Complete") return c.status === "COMPLETE"
    if (activeTab === "Handovers") return false
    return true
  }), [cases, activeTab, t, trimmedQuery])

  const CASE_CARD_HEIGHT = 100 // approximate fixed height for getItemLayout

  const renderCase = useCallback(({ item }: { item: CaseItem }) => {
    const isComplete = item.status === "COMPLETE"
    const hasPendingSync = queuedCaseIds.has(item.id)
    const hasQueuedIntraop = queuedIntraopCaseIds.has(item.id)
    const scale = getCardScale(item.id)
    return (
      <Animated.View style={{ transform: [{ scale }] }}>
      <TouchableOpacity
        style={{
          backgroundColor: colors.surfaceRaised,
          borderRadius: 14,
          borderCurve: "continuous",
          paddingHorizontal: 16,
          paddingVertical: 14,
          marginBottom: 10,
          borderWidth: 1,
          borderColor: colors.border,
        }}
        onPress={() => router.push(routeFor(item, hasQueuedIntraop))}
        onLongPress={() => handleLongPress(item)}
        delayLongPress={400}
        activeOpacity={0.75}
      >
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
          <View style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 6, marginRight: 8 }}>
            <Text style={{ color: colors.textPrimary, fontWeight: "800", flex: 1, fontSize: 14 }} numberOfLines={2}>
              {getCaseLabel(item, t("unnamedCase"))}
            </Text>
            {hasPendingSync ? (
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.warning, flexShrink: 0 }} />
            ) : null}
          </View>
          <StatusBadge status={derivedStatus(item)} />
        </View>
        <Text style={{ color: colors.primary, fontSize: 12, fontWeight: "800", marginBottom: 8 }}>
          {t(nextActionKey(item, hasQueuedIntraop))}
        </Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <ASABadge asa={item.preop?.asaScore} />
          {isComplete && <DispositionBadge disposition={item.postop?.disposition} />}
          {item.user?.name ? <Text style={{ color: colors.textMuted, fontSize: 11 }}>{item.user.name}</Text> : null}
          <Text style={{ color: colors.textMuted, fontSize: 11, fontVariant: ["tabular-nums"] }}>{item.caseCode}</Text>
        </View>
      </TouchableOpacity>
      </Animated.View>
    )
  }, [queuedCaseIds, queuedIntraopCaseIds, router, handleLongPress, t])

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Stack.Screen options={{ title: t("dashboard"), headerShown: false }} />
      <AppHeader
        title={`${t(FILTER_TAB_LABEL_KEYS[activeTab])} ${t("cases")} · ${tabCounts[activeTab]}`}
        onSearch={() => setSearchOpen(true)}
      />

      {loading ? (
        <ScreenState title={t("loadingCases")} loading />
      ) : (
        <FlatList
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 120 }}
          data={activeTab === "Handovers" ? [] : filteredCases}
          keyExtractor={(c) => c.id}
          renderItem={renderCase}
          getItemLayout={(_, index) => ({ length: CASE_CARD_HEIGHT, offset: CASE_CARD_HEIGHT * index, index })}
          maxToRenderPerBatch={8}
          windowSize={5}
          removeClippedSubviews
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={colors.primary} />}
          ListHeaderComponent={
            <>
              {localDrafts.map(draft => (
                <LocalCaseDraftCard key={draft.localId} draft={draft} language={language}
                  localBadge={t("localBadge")} unsyncedTitle={t("unsyncedDraftTitle")}
                  onPress={() => router.push({ pathname: "/(app)/cases/new",
                    params: localDraftRecoveryParams(draft) } as Href)} />
              ))}

              {queuedSaveCount > 0 ? (
                <TouchableOpacity
                  onPress={loadQueuedSaves}
                  style={{ backgroundColor: withAlpha(colors.warning, "18"), borderColor: withAlpha(colors.warning, "66"), borderWidth: 1, borderRadius: 14, borderCurve: "continuous", padding: 12, marginBottom: 14 }}
                >
                  <Text style={{ color: colors.warning, fontSize: 13, fontWeight: "900" }}>
                    {queuedSaveCount} {queuedSaveCount === 1 ? t("offlineSave") : t("offlineSaves")}
                  </Text>
                  <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 3 }}>
                    {t("keepOpen")}
                  </Text>
                </TouchableOpacity>
              ) : null}

              {query.trim() ? (
                <TouchableOpacity
                  onPress={() => setSearchOpen(true)}
                  style={{
                    flexDirection: "row", alignItems: "center", gap: 8,
                    backgroundColor: withAlpha(colors.primary, "14"),
                    borderWidth: 1, borderColor: withAlpha(colors.primary, "55"),
                    borderRadius: 14, borderCurve: "continuous",
                    paddingHorizontal: 14, paddingVertical: 11, marginBottom: 12,
                  }}
                >
                  <Text style={{ color: colors.primary, fontSize: 13, fontWeight: "700", flex: 1 }} numberOfLines={1}>
                    {t("searchPrefix")} {query}
                  </Text>
                  <TouchableOpacity onPress={() => setQuery("")} hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}>
                    <Text style={{ color: colors.textMuted, fontSize: 16, fontWeight: "700" }}>×</Text>
                  </TouchableOpacity>
                </TouchableOpacity>
              ) : null}

              <View style={{ flexDirection: "row", gap: 8, marginBottom: 14 }}>
                {[
                  { labelKey: "filterAll" as const, value: tabCounts.All, tab: "All" as FilterTab },
                  { labelKey: "filterToday" as const, value: tabCounts.Today, tab: "Today" as FilterTab },
                  { labelKey: "month" as const, value: tabCounts.Month, tab: "Month" as FilterTab },
                ].map((stat) => (
                  <TouchableOpacity key={stat.tab} onPress={() => setActiveTab(stat.tab)} style={{ backgroundColor: activeTab === stat.tab ? colors.primarySoft : colors.surface, borderRadius: 12, borderCurve: "continuous", flex: 1, padding: 12, borderWidth: 1, borderColor: activeTab === stat.tab ? withAlpha(colors.primary, "88") : colors.border, boxShadow: activeTab === stat.tab ? `0 8px 22px ${withAlpha(colors.primary, "18")}` : undefined }}>
                    <Text style={{ color: colors.textMuted, fontSize: 11, marginBottom: 3 }}>{t(stat.labelKey)}</Text>
                    <Text style={{ color: colors.textPrimary, fontSize: 22, fontWeight: "900", fontVariant: ["tabular-nums"] }}>{stat.value}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <PendingHandovers
                transfers={transfers}
                actioning={actioningTransfer}
                onAction={handleTransferAction}
                t={t}
              />

              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingRight: 20 }} style={{ marginBottom: 14 }}>
                {FILTER_TABS.map((tab) => (
                  <WorkflowPill key={tab} label={`${t(FILTER_TAB_LABEL_KEYS[tab])} ${tabCounts[tab]}`} selected={activeTab === tab} onPress={() => setActiveTab(tab)} />
                ))}
              </ScrollView>
            </>
          }
          ListEmptyComponent={
            <ScreenState
              title={loadError ? t("casesCouldNotLoad") : activeTab === "Handovers" ? t("noHandoversPending") : t("noCasesHere")}
              message={loadError ?? (query ? t("tryAnotherSearch") : t("tapCreateCase"))}
              action={loadError ? t("retry") : undefined}
              onAction={loadError ? () => load(true) : undefined}
            />
          }
          ListFooterComponent={
            activeTab !== "Handovers" && caseTotal != null && cases.length < caseTotal ? (
              <TouchableOpacity
                onPress={loadMoreCases}
                disabled={loadingMore}
                style={{ marginTop: 8, marginBottom: 20, paddingVertical: 12, alignItems: "center", borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface }}
              >
                {loadingMore ? (
                  <ActivityIndicator color={colors.primary} />
                ) : (
                  <Text style={{ color: colors.primary, fontWeight: "800", fontSize: 14 }}>
                    {t("loadMore")} ({cases.length} / {caseTotal})
                  </Text>
                )}
              </TouchableOpacity>
            ) : null
          }
        />
      )}

      <TouchableOpacity
        style={{
          position: "absolute",
          bottom: 32,
          right: 24,
          backgroundColor: colors.primary,
          minWidth: 112,
          height: 54,
          borderRadius: 999,
          alignItems: "center",
          justifyContent: "center",
          flexDirection: "row",
          gap: 8,
          boxShadow: `0 12px 30px ${withAlpha(colors.primary, "44")}`,
        }}
        onPress={() => router.push("/(app)/cases/new")}
        activeOpacity={0.85}
      >
        <Text style={{ color: "#fff", fontSize: 22, fontWeight: "800", lineHeight: 24 }}>＋</Text>
        <Text style={{ color: "#fff", fontSize: 13, fontWeight: "900" }}>{t("newCase")}</Text>
      </TouchableOpacity>

      <Modal visible={menuCase !== null} transparent animationType="fade" onRequestClose={closeMenu}>
        <TouchableOpacity
          style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "flex-end" }}
          onPress={closeMenu}
          activeOpacity={1}
        >
          <View
            style={{ backgroundColor: colors.surfaceRaised, borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingHorizontal: 20, paddingTop: 8, paddingBottom: 40 }}
            onStartShouldSetResponder={() => true}
          >
            <View style={{ width: 38, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: "center", marginBottom: 16 }} />

            {menuMode === "menu" ? (
              <>
                <Text style={{ color: colors.textPrimary, fontSize: 15, fontWeight: "800", marginBottom: 2 }} numberOfLines={2}>
                  {menuCase ? getCaseLabel(menuCase, t("unnamedCase")) : ""}
                </Text>
                <Text style={{ color: colors.textMuted, fontSize: 12, marginBottom: 18 }}>{menuCase?.caseCode ?? ""}</Text>

                {menuCase?.status === "COMPLETE" ? (
                  <TouchableOpacity
                    style={{ paddingVertical: 16, borderTopWidth: 1, borderTopColor: colors.border, flexDirection: "row", alignItems: "center" }}
                    onPress={() => {
                      const printId = menuCase?.id
                      closeMenu()
                      if (printId) {
                        notify(tc("actionPrintCase"), tc("printGenerating"))
                        void openPrintCase(printId, language).then(ok => {
                          if (!ok) notify(tc("errorLabel"), tc("printFailed"))
                        })
                      }
                    }}
                    disabled={actionLoading || handoverBusy}
                  >
                    <Text style={{ color: colors.primary, fontSize: 16, fontWeight: "700" }}>🖨 {tc("actionPrintCase")}</Text>
                  </TouchableOpacity>
                ) : null}

                {menuCase?.status !== "COMPLETE" && menuCaseWritable ? (
                  <TouchableOpacity
                    style={{ paddingVertical: 16, borderTopWidth: 1, borderTopColor: colors.border, flexDirection: "row", alignItems: "center" }}
                    onPress={handleDeleteCase}
                    disabled={actionLoading || handoverBusy}
                  >
                    <Text style={{ color: colors.danger, fontSize: 16, fontWeight: "700" }}>{t("deleteCase")}</Text>
                  </TouchableOpacity>
                ) : null}

                {/*
                  Offered to everyone, and the server decides what it means: a
                  head of department or an administrator assigns and the case
                  moves at once; anyone else asks, and it moves when the
                  recipient accepts. Handing a case on at the end of a shift is
                  an ordinary clinical act, and a phone is where it happens.

                  This used to be gated on `userRoleRef.current === "HOD"`,
                  which is not a role the API has ever returned — the enum value
                  is HEAD_OF_DEPT and "HOD" is only a display label in
                  src/i18n/strings.ts. So the condition was never true for a
                  head of department, and this control was in practice
                  admin-only. Removing the gate fixes that too.
                */}
                {menuCase?.status !== "COMPLETE" && !menuCasePending && menuCaseWritable ? (
                  <TouchableOpacity
                    style={{ paddingVertical: 16, borderTopWidth: 1, borderTopColor: colors.border, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}
                    onPress={handleShowAssign}
                    disabled={actionLoading || handoverBusy}
                  >
                    <Text style={{ color: colors.textPrimary, fontSize: 16, fontWeight: "700" }}>{t("handOver")}…</Text>
                    <Text style={{ color: colors.textMuted, fontSize: 18 }}>›</Text>
                  </TouchableOpacity>
                ) : null}

                {/*
                  A handover nobody answers has to be escapable, and only the
                  sender may withdraw it. While one is outstanding the case
                  cannot be offered to anyone else, so without this a case
                  handed to a colleague on annual leave would be stuck.
                */}
                {menuCasePending ? (
                  <TouchableOpacity
                    style={{ paddingVertical: 16, borderTopWidth: 1, borderTopColor: colors.border, flexDirection: "row", alignItems: "center" }}
                    onPress={handleWithdrawHandover}
                    disabled={actionLoading || handoverBusy}
                  >
                    <Text style={{ color: colors.textPrimary, fontSize: 16, fontWeight: "700" }}>{t("withdrawHandover")}</Text>
                  </TouchableOpacity>
                ) : null}

                <TouchableOpacity
                  style={{ paddingVertical: 16, borderTopWidth: 1, borderTopColor: colors.border, alignItems: "center" }}
                  onPress={closeMenu}
                >
                  <Text style={{ color: colors.textSecondary, fontSize: 16 }}>{t("cancel")}</Text>
                </TouchableOpacity>
              </>
            ) : menuMode === "assign" ? (
              <>
                <Text style={{ color: colors.textPrimary, fontSize: 15, fontWeight: "800", marginBottom: 16 }}>{t("assignTo")}</Text>
                {loadingColleagues ? (
                  <ActivityIndicator color={colors.primary} style={{ marginVertical: 24 }} />
                ) : colleagues.length === 0 ? (
                  <Text style={{ color: colors.textMuted, fontSize: 14, marginBottom: 16 }}>{t("noColleaguesFound")}</Text>
                ) : (
                  <ScrollView style={{ maxHeight: 320 }} showsVerticalScrollIndicator={false}>
                    {colleagues.map((c) => (
                      <TouchableOpacity
                        key={c.id}
                        style={{ paddingVertical: 14, borderTopWidth: 1, borderTopColor: colors.border, flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}
                        onPress={() => handleAssignTo(c.id)}
                        disabled={actionLoading || handoverBusy}
                      >
                        <View>
                          <Text style={{ color: colors.textPrimary, fontSize: 15, fontWeight: "600" }}>{c.name}</Text>
                          <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }}>{displayClinicalCode("userRole", c.role, language)}</Text>
                        </View>
                        {actionLoading ? <ActivityIndicator size="small" color={colors.primary} /> : null}
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                )}
                <TouchableOpacity
                  style={{ paddingVertical: 16, marginTop: 4, borderTopWidth: 1, borderTopColor: colors.border, alignItems: "center" }}
                  onPress={() => setMenuMode("menu")}
                >
                  <Text style={{ color: colors.textSecondary, fontSize: 16 }}>{t("back")}</Text>
                </TouchableOpacity>
              </>
            ) : menuMode === "confirmDelete" ? (
              <>
                <Text style={{ color: colors.textPrimary, fontSize: 15, fontWeight: "800", marginBottom: 6 }}>
                  {t("deleteCaseTitle")}
                </Text>
                <Text style={{ color: colors.textMuted, fontSize: 13, marginBottom: 20 }} numberOfLines={2}>
                  {menuCase ? getCaseLabel(menuCase, t("unnamedCase")) : ""}
                </Text>
                <TouchableOpacity
                  style={{ paddingVertical: 16, borderTopWidth: 1, borderTopColor: colors.border, alignItems: "center", backgroundColor: "rgba(220,38,38,0.08)", borderRadius: 10, marginBottom: 8 }}
                  onPress={confirmDeleteCase}
                  disabled={actionLoading || handoverBusy}
                >
                  {actionLoading
                    ? <ActivityIndicator color={colors.danger} />
                    : <Text style={{ color: colors.danger, fontSize: 16, fontWeight: "700" }}>{t("deleteCase")}</Text>
                  }
                </TouchableOpacity>
                <TouchableOpacity
                  style={{ paddingVertical: 14, alignItems: "center" }}
                  onPress={() => setMenuMode("menu")}
                  disabled={actionLoading || handoverBusy}
                >
                  <Text style={{ color: colors.textSecondary, fontSize: 16 }}>{t("cancel")}</Text>
                </TouchableOpacity>
              </>
            ) : null}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ── Search popup ── */}
      <Modal visible={searchOpen} transparent animationType="fade" onRequestClose={() => { setSearchOpen(false); setQuery("") }}>
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-start" }}>
          <View style={{ backgroundColor: colors.surfaceRaised, borderBottomLeftRadius: 22, borderBottomRightRadius: 22, paddingTop: 60, paddingHorizontal: 20, paddingBottom: 20 }}>
            <Text style={{ color: colors.textPrimary, fontSize: 18, fontWeight: "900", marginBottom: 12 }}>{t("searchCases")}</Text>
            <TextInput
              autoFocus
              value={query}
              onChangeText={setQuery}
              placeholder={t("searchCasesPlaceholder")}
              placeholderTextColor={colors.textMuted}
              style={{
                backgroundColor: colors.surface, color: colors.textPrimary,
                borderWidth: 1, borderColor: colors.border, borderRadius: 14,
                paddingHorizontal: 14, paddingVertical: 11, fontSize: 14, marginBottom: 12,
              }}
            />
            {query.trim().length > 0 && (
              <ScrollView style={{ maxHeight: 380 }} keyboardShouldPersistTaps="handled">
                {filteredCases.slice(0, 20).map(c => (
                  <TouchableOpacity key={c.id}
                    onPress={() => {
                      setSearchOpen(false)
                      router.push(routeFor(c, queuedIntraopCaseIds.has(c.id)))
                    }}
                    style={{ paddingVertical: 12, borderTopWidth: 1, borderTopColor: colors.border }}>
                    <Text style={{ color: colors.textPrimary, fontSize: 14, fontWeight: "700" }} numberOfLines={1}>
                      {getCaseLabel(c, t("unnamedCase"))}
                    </Text>
                    <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }}>
                      {c.caseCode} · {statusLabel(c.status, language)}
                    </Text>
                  </TouchableOpacity>
                ))}
                {filteredCases.length === 0 && (
                  <Text style={{ color: colors.textMuted, fontSize: 14, paddingVertical: 16, textAlign: "center" }}>{t("noCasesFound")}</Text>
                )}
              </ScrollView>
            )}
            <TouchableOpacity
              style={{ marginTop: 10, paddingVertical: 12, alignItems: "center", borderRadius: 12, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}
              onPress={() => { setSearchOpen(false); if (!query.trim()) setQuery("") }}>
              <Text style={{ color: colors.textSecondary, fontSize: 15, fontWeight: "700" }}>
                {query.trim() ? t("showInDashboard") : t("cancel")}
              </Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setSearchOpen(false)} />
        </View>
      </Modal>
    </View>
  )
}
