import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { ActivityIndicator, Animated, FlatList, RefreshControl, ScrollView, Text, TouchableOpacity, View } from "react-native"
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
import { ASABadge, DispositionBadge, StatusBadge, statusLabel } from "@/components/ui"
import { ScreenState, WorkflowPill } from "@/components/clinical-ui"
import { AppHeader } from "@/components/AppHeader"
import { LocalCaseDraftCard } from "@/components/LocalCaseDraftCard"
import { colors, withAlpha } from "@/theme/colors"
import { deriveCaseStage } from "@lospor/core/case-status"
import { dashboardCaseTarget, dashboardTabCounts, caseMatchesDashboardTab, type DashboardServerCounts } from "@/lib/dashboard-case-routing"
import { preopReadyForAllocation } from "@lospor/core/clinical-validation"
import { useDashboardPagination } from "@/lib/use-dashboard-pagination"
import { caseIsWritable } from "@lospor/core/case-capabilities"
import { isSameCalendarDay, isSameCalendarMonth } from "@lospor/core/dashboard-date-scope"
import type { CaseTheatreView } from "@lospor/core/operating-theatres"
import { assignCaseTheatre, dashboardFilterQuery, TheatreChangedError, useOperatingTheatres, type DashboardFilter } from "@/lib/use-operating-theatres"
import { type CancellationReason } from "@lospor/core/case-cancellation"
import { dashboardMenuActions } from "@/lib/case-actions"
import { plannedProcedureLabel } from "@lospor/core/procedure-codes"
import { DashboardCaseMenu } from "@/components/dashboard/DashboardCaseMenu"
import { DashboardSheets } from "@/components/dashboard/DashboardSheets"

const USE_NATIVE_DRIVER = Platform.OS !== "web"

type CaseItem = {
  id: string
  userId?: string
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
    procedureUndetermined?: boolean
    diagnoses?: { label: string }[]
    procedures?: { label: string }[]
  }
  intraop?: { monthYear?: string; endTime?: string | null; startedAt?: string | null; startTime?: string | null }
  postop?: { disposition?: string }
  user?: { name?: string }
  // Any handover on this case still waiting to be answered. The list endpoint
  // has always returned this; it was simply not read.
  transfers?: { id: string }[]
  capabilities?: { canWrite: boolean } | null
  /** The operating theatre (10.0.0); null while the site does not use them. */
  theatre?: CaseTheatreView | null
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

function getCaseLabel(item: CaseItem, unnamedCase: string, language?: string): string {
  return (
    (item.preop?.procedureUndetermined ? plannedProcedureLabel(item.preop, language) : null) ??
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
  const { identity, logout } = useAuth()
  const { t, tc, language, shade } = usePreferences()
  const draftOwner = useMemo(() => localDraftOwnerFromIdentity(identity), [identity])

  const [cases, setCases] = useState<CaseItem[]>([])
  // The theatre and anaesthesiologist filters (10.0.0), applied by the API.
  const [filter, setFilter] = useState<DashboardFilter>({ theatre: null, assignee: null })
  const [filterSheet, setFilterSheet] = useState<"theatre" | "assignee" | null>(null)
  const [people, setPeople] = useState<{ id: string; name: string }[]>([])
  const filterQuery = dashboardFilterQuery(filter)
  const { config: theatreConfig } = useOperatingTheatres()
  const { counts, setCounts, setHospitalWide, hospitalWide, caseTotal, setCaseTotal, loadingMore, loadMoreCases } = useDashboardPagination(cases, setCases, t, DASHBOARD_REQUEST_TIMEOUT_MS, filterQuery)
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
  const [menuMode, setMenuMode] = useState<"menu" | "assign" | "theatre" | "cancel" | "confirmDelete">("menu")
  // A cancelled procedure (10.0.0): the reason chosen, and a note for "Other".
  const [cancelReason, setCancelReason] = useState<CancellationReason | null>(null)
  const [cancelNote, setCancelNote] = useState("")
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
      const data = await apiJson<CaseItem[] | { cases: CaseItem[]; counts?: DashboardServerCounts; total?: number; hospitalWide?: boolean }>(
        `/api/cases?take=200${filterQuery}`,
        { timeoutMs: DASHBOARD_REQUEST_TIMEOUT_MS },
      )
      setCases(Array.isArray(data) ? data : (Array.isArray(data?.cases) ? data.cases : []))
      setCounts(Array.isArray(data) ? null : (data?.counts ?? null))
      setCaseTotal(Array.isArray(data) ? null : (data?.total ?? null))
      setHospitalWide(Array.isArray(data) ? false : data?.hospitalWide === true)
      setNetworkLoadFailed(false)
      networkErrorNotifiedRef.current = false
    } catch (err) {
      const message = t("couldNotLoadCases")
      const isNetworkFailure = err instanceof ApiError && err.code === "NETWORK"
      setLoadError(message)
      setNetworkLoadFailed(isNetworkFailure)
      if (err instanceof ApiError && err.status === 401) {
        // Expiry retains account-bound unsynced work; only explicit sign-out clears it.
        await logout()
        notify(t("sessionExpired"), t("signInAgainPrompt"))
        return
      }
      if (!isNetworkFailure || !networkErrorNotifiedRef.current) {
        notify(t("error"), message)
      }
      networkErrorNotifiedRef.current = isNetworkFailure
    }
  }, [filterQuery, draftOwner, logout, t, setCounts, setCaseTotal])

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
    Animated.spring(scale, { toValue: 0.95, useNativeDriver: USE_NATIVE_DRIVER, speed: 50, bounciness: 0 }).start()
    setMenuCase(item)
    setMenuMode("menu")
  }, [])

  function closeMenu() {
    if (menuCase) {
      const scale = getCardScale(menuCase.id)
      Animated.spring(scale, { toValue: 1, useNativeDriver: USE_NATIVE_DRIVER, speed: 40, bounciness: 5 }).start()
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

  // The case's theatre (10.0.0): anyone who can open it, until intraop starts.
  async function handleAssignTheatre(theatreId: string | null) {
    if (!menuCase) return
    setActionLoading(true)
    try {
      await assignCaseTheatre(menuCase.id, theatreId, menuCase.theatre?.id ?? null)
      closeMenu()
      await loadCases()
    } catch (err) {
      if (err instanceof TheatreChangedError) {
        // Someone chose another meanwhile: show it, keep the list open, say who.
        const theatreName = err.current?.name ?? t("noTheatre")
        setMenuCase(prev => prev && prev.theatre ? { ...prev, theatre: { ...prev.theatre, id: err.current?.id ?? null, name: err.current?.name ?? null } } : prev)
        notify(t("theatreLabel"), (err.changedBy ? t("theatreChangedMeanwhileBy").replace("{name}", err.changedBy) : t("theatreChangedMeanwhile")).replace("{theatre}", theatreName))
        void loadCases()
        return
      }
      notify(t("error"), err instanceof Error && err.message ? err.message : t("theatreChangeFailed"))
    } finally {
      setActionLoading(false)
    }
  }

  async function handleCancelProcedure() {
    if (!menuCase || !cancelReason || (cancelReason === "OTHER" && !cancelNote.trim())) return
    setActionLoading(true)
    try {
      await apiJson(`/api/cases/${menuCase.id}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: cancelReason, ...(cancelNote.trim() ? { note: cancelNote.trim() } : {}) }),
      })
      closeMenu()
      await loadCases()
    } catch (err) {
      notify(t("error"), err instanceof ApiError && err.sourceMessage === "CANCELLATION_TOO_LATE" ? t("cancellationTooLate") : err instanceof Error && err.message ? err.message : t("cancellationFailed"))
    } finally {
      setActionLoading(false)
    }
  }

  async function handleUndoCancellation() {
    if (!menuCase) return
    setActionLoading(true)
    try {
      await apiJson(`/api/cases/${menuCase.id}/cancel`, { method: "DELETE" })
      closeMenu()
      await loadCases()
    } catch (err) {
      notify(t("error"), err instanceof Error && err.message ? err.message : t("actionFailed"))
    } finally {
      setActionLoading(false)
    }
  }

  async function openFilterSheet(kind: "theatre" | "assignee") {
    setFilterSheet(kind)
    if (kind === "assignee" && people.length === 0) {
      const [me, colleagues] = await Promise.all([
        apiJson<{ id: string; name: string }>("/api/user").catch(() => null),
        apiJson<{ id: string; name: string }[]>("/api/users/colleagues").catch(() => []),
      ])
      setPeople([...(me ? [{ id: me.id, name: me.name }] : []), ...(Array.isArray(colleagues) ? colleagues : []).filter(item => item.id !== me?.id)])
    }
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
  const menuCaseTheatreChangeable = theatreConfig.enabled && menuCase?.theatre?.changeable === true
  // What the held case offers (case-actions.ts, shared with the case screen).
  const menuActions = dashboardMenuActions({
    status: menuCase?.status, intraop: menuCase?.intraop, writable: menuCaseWritable,
    pendingTransfer: menuCasePending, theatreChangeable: menuCaseTheatreChangeable,
  })

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
  const filteredCases = useMemo(() => {
    const visible = cases.filter((c) => {
      if (trimmedQuery) {
        const haystack = [getCaseLabel(c, t("unnamedCase"), language), c.preop?.diagnosis, c.preop?.plannedProcedure, c.caseCode, c.user?.name]
          .filter(Boolean).join(" ").toLowerCase()
        if (!haystack.includes(trimmedQuery)) return false
      }
      return caseMatchesDashboardTab(c, activeTab, isToday, isThisMonth)
    })
    return hospitalWide
      ? [...visible].sort((a, b) => Number(b.userId === identity?.userId) - Number(a.userId === identity?.userId))
      : visible
  }, [cases, activeTab, language, t, trimmedQuery, hospitalWide, identity?.userId])

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
              {getCaseLabel(item, t("unnamedCase"), language)}
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
          {item.theatre?.name ? (
            <View style={{ backgroundColor: withAlpha(colors.primary, "16"), borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }}>
              <Text style={{ color: colors.primary, fontSize: 11, fontWeight: "800" }} numberOfLines={1}>{item.theatre.name}</Text>
            </View>
          ) : null}
          {item.user?.name ? <Text style={{ color: colors.textMuted, fontSize: 11 }}>{item.user.name}</Text> : null}
          <Text style={{ color: colors.textMuted, fontSize: 11, fontVariant: ["tabular-nums"] }}>{item.caseCode}</Text>
        </View>
      </TouchableOpacity>
      </Animated.View>
    )
  }, [queuedCaseIds, queuedIntraopCaseIds, router, handleLongPress, language, t])

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

              {/* The unit indicators (10.0.0). */}
              <TouchableOpacity
                testID="open-indicators"
                accessibilityRole="button"
                onPress={() => router.push("/(app)/indicators" as Href)}
                style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 12, borderCurve: "continuous", paddingHorizontal: 14, paddingVertical: 11, marginBottom: 14 }}
              >
                <Text style={{ color: colors.textPrimary, fontSize: 14, fontWeight: "800" }}>{t("indTitle")}</Text>
                <Text style={{ color: colors.textMuted, fontSize: 18 }}>›</Text>
              </TouchableOpacity>

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

              {/* The theatre and anaesthesiologist filters (10.0.0). */}
              <View testID="dashboard-filters" style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
                {theatreConfig.enabled ? (
                  <WorkflowPill
                    label={`${t("filterTheatre")}: ${filter.theatre === "none" ? t("noTheatre") : theatreConfig.theatres.find(item => item.id === filter.theatre)?.name ?? t("allTheatres")} ▾`}
                    selected={filter.theatre !== null}
                    onPress={() => void openFilterSheet("theatre")}
                  />
                ) : null}
                <WorkflowPill
                  label={`${t("filterAnaesthesiologist")}: ${people.find(item => item.id === filter.assignee)?.name ?? t("allAnaesthesiologists")} ▾`}
                  selected={filter.assignee !== null}
                  onPress={() => void openFilterSheet("assignee")}
                />
                {filter.theatre || filter.assignee ? (
                  <WorkflowPill label={`× ${t("clearFilters")}`} selected={false} onPress={() => setFilter({ theatre: null, assignee: null })} />
                ) : null}
              </View>
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
        <Text style={{ color: shade("#fff"), fontSize: 22, fontWeight: "800", lineHeight: 24 }}>＋</Text>
        <Text style={{ color: shade("#fff"), fontSize: 13, fontWeight: "900" }}>{t("newCase")}</Text>
      </TouchableOpacity>

      <DashboardCaseMenu
        menuCase={menuCase}
        menuMode={menuMode}
        menuActions={menuActions}
        caseLabel={menuCase ? getCaseLabel(menuCase, t("unnamedCase"), language) : ""}
        language={language}
        t={t}
        tc={tc}
        closeMenu={closeMenu}
        setMenuMode={setMenuMode}
        actionLoading={actionLoading}
        handoverBusy={handoverBusy}
        loadingColleagues={loadingColleagues}
        colleagues={colleagues}
        onPrint={() => { const printId = menuCase?.id; const printCode = menuCase?.caseCode; closeMenu(); if (printId) { notify(tc("actionPrintCase"), tc("printGenerating")); void openPrintCase(printId, language, printCode).then(ok => { if (!ok) notify(tc("errorLabel"), tc("printFailed")) }) } }}
        onDelete={handleDeleteCase}
        onShowAssign={() => { void handleShowAssign() }}
        onAssignTo={id => { void handleAssignTo(id) }}
        onWithdraw={() => { void handleWithdrawHandover() }}
        onCancelProcedure={() => { void handleCancelProcedure() }}
        onUndoCancellation={() => { void handleUndoCancellation() }}
        onAssignTheatre={id => { void handleAssignTheatre(id) }}
        onConfirmDelete={() => { void confirmDeleteCase() }}
        cancelReason={cancelReason}
        setCancelReason={setCancelReason}
        cancelNote={cancelNote}
        setCancelNote={setCancelNote}
        theatres={theatreConfig.theatres}
      />
      <DashboardSheets
        filterSheet={filterSheet}
        filterOptions={filterSheet === "theatre" ? [{ id: "", name: t("allTheatres") }, ...theatreConfig.theatres, { id: "none", name: t("noTheatre") }] : [{ id: "", name: t("allAnaesthesiologists") }, ...people]}
        currentFilter={filterSheet === "theatre" ? filter.theatre : filter.assignee}
        onCloseFilter={() => setFilterSheet(null)}
        onSelectFilter={id => { setFilter(prev => filterSheet === "theatre" ? { ...prev, theatre: id || null } : { ...prev, assignee: id || null }); setFilterSheet(null) }}
        searchOpen={searchOpen}
        query={query}
        setQuery={setQuery}
        onCloseSearch={() => { setSearchOpen(false); if (!query.trim()) setQuery("") }}
        searchResults={filteredCases.slice(0, 20).map(c => ({ id: c.id, label: getCaseLabel(c, t("unnamedCase"), language), caseCode: c.caseCode, status: statusLabel(c.status, language), href: routeFor(c, queuedIntraopCaseIds.has(c.id)) }))}
        onOpenResult={href => router.push(href)}
        t={t}
      />
    </View>
  )
}
