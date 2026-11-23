import { useShade } from "@/theme/shade"
import type { WeightBasisMap } from "@lospor/core/intraop-totals"
import type { TciPatient } from "@lospor/core/tci"
import { useCallback, useMemo, type RefObject } from "react"
import type { IntraopLabDraw } from "@lospor/core/labs"
import { FlatList, Platform, View } from "react-native"
import type { TimetableData, VitalsEntry } from "@/components/IntraopTimetable"
import type { ActiveFluid, ActiveGasSettings, ActiveInfusion, LogEvent } from "@/lib/intraop-log-event"
import { runningItemsByCol, type RunningColorOf, type RunningItem, type RowSummary, type RunningNameOf } from "@/lib/intraop-running"
import { useCurrentDrugColors } from "@/lib/drug-colors"
import { usePreferences } from "@/lib/preferences-context"
import { displayedCatalogName } from "@lospor/core/display"
import { TimetableFooter } from "./TimetableFooter"
import { TimetableRow, type QuickAddAction } from "./TimetableRow"
import { IntraopUndoBar } from "./IntraopUndoBar"
import { formatDateHHMM, plannedRowTime, timeAtCol } from "@/lib/intraop-projection"
import { intraopStoppedItemsAt } from "@lospor/core/intraop-edits"
import { IntraopAttentionBanner, type IntraopAttentionView } from "./IntraopAttentionBanner"
import type { IntraopAttentionAction } from "@lospor/core/intraop-attention"
import { CaseSaveStateContext } from "@/lib/use-case-save-state"
import { useIntraopHeaderScroll } from "./IntraopHeaderCollapse"

type Props = {
  screenWidth: number
  /** For a running TCI infusion's predicted value in each row (2026-10-18). */
  tciPatient?: TciPatient | null
  /** 10.8.0: the patient's weights, for each running item's total in the open row. */
  runTotals?: { ibw: number | null; tbw: number | null; bodySurfaceAreaM2?: number | null; weightBasis?: WeightBasisMap }
  /** Questions the timeline is waiting on (Core intraop-attention). */
  attention?: IntraopAttentionView
  undoEvent: LogEvent | null
  chartRows: number[]
  rowHeight: number
  chartStart: Date
  currentCol: number
  expandedRow: number | null
  nowSlotPercent: number
  timetable: TimetableData
  eventRows: Record<number, LogEvent[]>
  activeInfusions: ActiveInfusion[]
  activeFluids: ActiveFluid[]
  activeAgents: { name: string; color: string; percent?: number }[]
  /** Lab draws placed in chart rows (Core projectLabDraws). */
  labDraws?: IntraopLabDraw[]
  onOpenLabs?: (takenAt: string) => void
  activeGas: ActiveGasSettings
  started: boolean
  /** Show running items in the rows after now (a live case not yet ended). */
  projectRunning?: boolean
  isWatching: boolean
  listRef: RefObject<FlatList<number> | null>
  onUndo: () => void
  onDismissUndo: () => void
  /** The last delete, offered back like an add is (9.14.2). */
  removalUndo?: { events: LogEvent[]; undo: () => void; dismiss: () => void } | null
  onSetExpandedRow: (row: number | null) => void
  eventText: (event: LogEvent) => string
  buildSummary: (vital: VitalsEntry | undefined, events: LogEvent[]) => RowSummary
  onManageInfusion: (infusion: ActiveInfusion, col?: number) => void
  onEndFluid: (fluid: ActiveFluid, col?: number) => void
  onEditGas: (col: number) => void
  onEditJet?: (col: number) => void
  onStopAgent: (name: string, col?: number) => void
  onQuickAdd: (col: number, action: QuickAddAction) => void
  onJumpToNow: () => void
  onEndCase: () => void
  /** Opens the read-only chart view. Optional so the tab still renders without it. */
  onViewChart?: () => void
  /** 10.8.0: the saved log, for the `"Stopped: ...`" line of an opened row. */
  log?: LogEvent[]
  /** 10.8.0: the menu of a running item at a row, of an entry, and of an item stopped earlier. */
  onOpenRunning?: (item: RunningItem, col: number) => void
  onOpenEvent?: (event: LogEvent) => void
  onOpenStopped?: (id: string, col: number, title?: string) => void
}

const NO_SAVE_STATE = { queuedEventIds: [], sendingEventId: null, refused: [], queuedSections: [], dismissRefused: () => {} }

const RUNNING_CATEGORY = { agent: "INHALATIONAL_AGENT", infusion: "INTRAOP_INFUSION", fluid: "INTRAOP_FLUID" } as const

export function IntraopTimetableTab({
  screenWidth,
  tciPatient = null,
  runTotals,
  attention,
  undoEvent,
  chartRows,
  rowHeight,
  chartStart,
  currentCol,
  expandedRow,
  nowSlotPercent,
  timetable,
  eventRows,
  activeInfusions,
  activeFluids,
  activeAgents,
  labDraws,
  onOpenLabs,
  activeGas,
  started,
  projectRunning = false,
  isWatching,
  listRef,
  onUndo,
  onDismissUndo,
  removalUndo = null,
  onSetExpandedRow,
  eventText,
  buildSummary,
  onManageInfusion,
  onEndFluid,
  onEditGas,
  onEditJet,
  onStopAgent,
  onQuickAdd,
  onJumpToNow,
  onEndCase,
  onViewChart,
  log,
  onOpenRunning,
  onOpenEvent,
  onOpenStopped,
}: Props) {
  // Running agents, infusions and fluids by the names the reader chose (Settings → UI).
  const { language, bulgarianNames } = usePreferences()
  const { onScroll, scrollEventThrottle } = useIntraopHeaderScroll()
  const nameOf = useCallback<RunningNameOf>((kind, name) => displayedCatalogName(RUNNING_CATEGORY[kind], name, language, bulgarianNames), [bulgarianNames, language])
  // Infusions in the colours in use, the hospital's own included (10.0.0).
  const drugColors = useCurrentDrugColors()
  // The totals' inputs by value: the object arrives new on every render of the screen, and the rows (every running item of every
  // column) were worked out again each time.
  const hasTotals = runTotals != null
  const { ibw: totalsIbw, tbw: totalsTbw, bodySurfaceAreaM2: totalsBsa, weightBasis: totalsBasis } = runTotals ?? {}
  const stableTotals = useMemo(() => hasTotals ? { ibw: totalsIbw ?? null, tbw: totalsTbw ?? null, bodySurfaceAreaM2: totalsBsa, weightBasis: totalsBasis } : undefined, [hasTotals, totalsIbw, totalsTbw, totalsBsa, totalsBasis])
  const colorOf = useCallback<RunningColorOf>((kind, name) => kind === "infusion" ? drugColors.infusion(name) : undefined, [drugColors])
  const shownInfusions = useMemo(
    () => activeInfusions.map(infusion => {
      const color = drugColors.infusion(infusion.name)
      return color && color !== infusion.color ? { ...infusion, color } : infusion
    }),
    [activeInfusions, drugColors],
  )
  const rowDataByCol = useMemo(() => {
    const runningByCol = runningItemsByCol(timetable, chartRows, { projectRunning, nameOf, colorOf, sameGroup: { groupOf: drugColors.infusionGroup, shade: drugColors.later }, tciPatient, totals: stableTotals ? { ...stableTotals, now: new Date(), language: language === "bg" ? "bg" : "en" } : undefined })
    const data = new Map<number, {
      vital: VitalsEntry | undefined
      rowEvents: LogEvent[]
      running: RunningItem[]
      summary: RowSummary
    }>()
    for (const col of chartRows) {
      const rowEvents = (eventRows[col] ?? []).slice().sort((a,b) =>
        new Date(a.ts).getTime() - new Date(b.ts).getTime())
      const vital = timetable.vitals[col]
      const running = runningByCol.get(col) ?? []
      data.set(col, {
        vital,
        rowEvents,
        running,
        summary: buildSummary(vital, rowEvents),
      })
    }
    return data
  }, [buildSummary, chartRows, colorOf, drugColors, eventRows, language, nameOf, projectRunning, stableTotals, tciPatient, timetable])

  const labDrawsByCol = useMemo(() => {
    const byCol = new Map<number, IntraopLabDraw[]>()
    for (const draw of labDraws ?? []) byCol.set(draw.col, [...(byCol.get(draw.col) ?? []), draw])
    return byCol
  }, [labDraws])

  // The items stopped before the opened row and not started again (10.8.0): only that row asks.
  const shade = useShade()
  const stoppedForExpanded = useMemo(() => {
    if (expandedRow === null || !log) return undefined
    const rowStart = timeAtCol(chartStart, expandedRow)
    return intraopStoppedItemsAt(log, rowStart.getTime() - 1).map(item => {
      const start = [...log].reverse().find(event => event.ts <= item.stopEvent.ts && (event.infId === item.key || event.fluidId === item.key || event.name === item.key) && event.type.endsWith("_start"))
      const kind = item.kind === "gas" || item.kind === "jet" ? null : item.kind
      return {
        id: `${item.kind}:${item.key}`,
        label: kind ? nameOf(kind, start?.name ?? item.key) : item.kind === "gas" ? "FGF" : "Jet",
        color: start?.color ?? shade("#94a3b8"),
        at: formatDateHHMM(new Date(item.stopEvent.ts)),
      }
    })
  }, [chartStart, expandedRow, log, nameOf, shade])

  const collapseExpandedRow = useCallback(() => onSetExpandedRow(null), [onSetExpandedRow])
  const resolveAttention = attention?.resolve
  const answerAttention = useMemo(
    () => isWatching || !resolveAttention ? undefined : (key: string, action: IntraopAttentionAction) => { void resolveAttention(key, action) },
    [isWatching, resolveAttention],
  )

  const renderRow = useCallback(({ item: col }: { item: number }) => {
    const rowData = rowDataByCol.get(col)
    const vital = rowData?.vital
    const rowEvents = rowData?.rowEvents ?? []
    const running = rowData?.running ?? []
    const summary = rowData?.summary ?? buildSummary(vital, rowEvents)
    return (
      <TimetableRow
        col={col}
        labDraws={labDrawsByCol.get(col)}
        onOpenLabs={onOpenLabs}
        chartStart={chartStart}
        rowHeight={rowHeight}
        isNow={col === currentCol}
        isQuarter={col % 3 === 0}
        isExpanded={col === expandedRow}
        nowSlotPercent={nowSlotPercent}
        vital={vital}
        rowEvents={rowEvents}
        running={running}
        summary={summary}
        labelOf={eventText}
        activeInfusions={shownInfusions}
        activeFluids={activeFluids}
        activeAgents={activeAgents}
        activeGas={activeGas}
        onExpand={onSetExpandedRow}
        onCollapse={collapseExpandedRow}
        onManageInfusion={onManageInfusion}
        onEndFluid={onEndFluid}
        onEditGas={onEditGas}
        onEditJet={onEditJet}
        onStopAgent={onStopAgent}
        onQuickAdd={onQuickAdd}
        onAnswerAttention={answerAttention}
        onOpenRunning={isWatching ? undefined : onOpenRunning}
        onOpenEvent={isWatching ? undefined : onOpenEvent}
        stopped={col === expandedRow ? stoppedForExpanded : undefined}
        onOpenStopped={isWatching ? undefined : onOpenStopped}
      />
    )
  }, [
    activeAgents,
    labDrawsByCol,
    onOpenLabs,
    activeFluids,
    activeGas,
    shownInfusions,
    buildSummary,
    chartStart,
    collapseExpandedRow,
    currentCol,
    eventText,
    expandedRow,
    nowSlotPercent,
    onEditGas,
    onEditJet,
    onEndFluid,
    onManageInfusion,
    onQuickAdd,
    answerAttention,
    onSetExpandedRow,
    onStopAgent,
    rowDataByCol,
    rowHeight,
    isWatching,
    onOpenRunning,
    onOpenEvent,
    onOpenStopped,
    stoppedForExpanded,
  ])

  return (
    <View style={{ flex:1, ...(Platform.OS === "web" ? { width: screenWidth } : {}) }}>
      {undoEvent && (
        <IntraopUndoBar
          text={eventText(undoEvent)}
          plannedAt={plannedRowTime(undoEvent.ts)}
          onUndo={onUndo}
          onDismiss={onDismissUndo}
        />
      )}
      {removalUndo && removalUndo.events[0] && (
        <IntraopUndoBar
          text={eventText(removalUndo.events[0])}
          removed
          onUndo={removalUndo.undo}
          onDismiss={removalUndo.dismiss}
        />
      )}

      {/* A screen watching another screen's case writes nothing, so it asks nothing. */}
      {attention && !isWatching && <IntraopAttentionBanner attention={attention} />}

      <CaseSaveStateContext.Provider value={attention?.saveState ?? NO_SAVE_STATE}>
      <FlatList
        ref={listRef}
        data={chartRows}
        keyExtractor={col => String(col)}
        style={{ flex:1, ...(Platform.OS === "web" ? { width: screenWidth } : {}) }}
        contentContainerStyle={Platform.OS === "web" ? { width: screenWidth } : undefined}
        getItemLayout={expandedRow === null ? (_data, index) => ({ length: rowHeight, offset: rowHeight * index, index }) : undefined}
        initialNumToRender={12}
        maxToRenderPerBatch={8}
        updateCellsBatchingPeriod={50}
        windowSize={7}
        removeClippedSubviews={Platform.OS !== "web"}
        onScroll={onScroll}
        scrollEventThrottle={scrollEventThrottle}
        onScrollToIndexFailed={info => {
          const wait = new Promise(resolve => setTimeout(resolve, 100))
          wait.then(() => {
            listRef.current?.scrollToIndex({ index: info.highestMeasuredFrameIndex, animated: false })
          })
        }}
        renderItem={renderRow}
      />
      </CaseSaveStateContext.Provider>

      <TimetableFooter
        started={started}
        isWatching={isWatching}
        onJumpToNow={onJumpToNow}
        onEndCase={onEndCase}
        onViewChart={onViewChart}
      />
    </View>
  )
}
