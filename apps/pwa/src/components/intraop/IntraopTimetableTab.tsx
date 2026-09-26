import { useCallback, useMemo, type RefObject } from "react"
import type { IntraopLabDraw } from "@lospor/core/labs"
import { FlatList, Platform, View } from "react-native"
import type { TimetableData, VitalsEntry } from "@/components/IntraopTimetable"
import type { ActiveFluid, ActiveGasSettings, ActiveInfusion, LogEvent } from "@/lib/intraop-log-event"
import { runningItemsByCol, type RunningItem, type RowSummary } from "@/lib/intraop-running"
import { TimetableFooter } from "./TimetableFooter"
import { TimetableRow, type QuickAddAction } from "./TimetableRow"
import { IntraopUndoBar } from "./IntraopUndoBar"

type Props = {
  screenWidth: number
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
  isWatching: boolean
  listRef: RefObject<FlatList<number> | null>
  onUndo: () => void
  onDismissUndo: () => void
  onSetExpandedRow: (row: number | null) => void
  eventText: (event: LogEvent) => string
  buildSummary: (vital: VitalsEntry | undefined, events: LogEvent[]) => RowSummary
  onManageInfusion: (infusion: ActiveInfusion, col?: number) => void
  onEndFluid: (fluid: ActiveFluid, col?: number) => void
  onEditGas: (col: number) => void
  onStopAgent: (name: string, col?: number) => void
  onQuickAdd: (col: number, action: QuickAddAction) => void
  onJumpToNow: () => void
  onEndCase: () => void
  /** Opens the read-only chart view. Optional so the tab still renders without it. */
  onViewChart?: () => void
}

export function IntraopTimetableTab({
  screenWidth,
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
  isWatching,
  listRef,
  onUndo,
  onDismissUndo,
  onSetExpandedRow,
  eventText,
  buildSummary,
  onManageInfusion,
  onEndFluid,
  onEditGas,
  onStopAgent,
  onQuickAdd,
  onJumpToNow,
  onEndCase,
  onViewChart,
}: Props) {
  const rowDataByCol = useMemo(() => {
    const runningByCol = runningItemsByCol(timetable, chartRows)
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
  }, [buildSummary, chartRows, eventRows, timetable])

  const labDrawsByCol = useMemo(() => {
    const byCol = new Map<number, IntraopLabDraw[]>()
    for (const draw of labDraws ?? []) byCol.set(draw.col, [...(byCol.get(draw.col) ?? []), draw])
    return byCol
  }, [labDraws])

  const collapseExpandedRow = useCallback(() => onSetExpandedRow(null), [onSetExpandedRow])

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
        activeInfusions={activeInfusions}
        activeFluids={activeFluids}
        activeAgents={activeAgents}
        activeGas={activeGas}
        onExpand={onSetExpandedRow}
        onCollapse={collapseExpandedRow}
        onManageInfusion={onManageInfusion}
        onEndFluid={onEndFluid}
        onEditGas={onEditGas}
        onStopAgent={onStopAgent}
        onQuickAdd={onQuickAdd}
      />
    )
  }, [
    activeAgents,
    labDrawsByCol,
    onOpenLabs,
    activeFluids,
    activeGas,
    activeInfusions,
    buildSummary,
    chartStart,
    collapseExpandedRow,
    currentCol,
    eventText,
    expandedRow,
    nowSlotPercent,
    onEditGas,
    onEndFluid,
    onManageInfusion,
    onQuickAdd,
    onSetExpandedRow,
    onStopAgent,
    rowDataByCol,
    rowHeight,
  ])

  return (
    <View style={{ flex:1, ...(Platform.OS === "web" ? { width: screenWidth } : {}) }}>
      {undoEvent && (
        <IntraopUndoBar
          text={eventText(undoEvent)}
          onUndo={onUndo}
          onDismiss={onDismissUndo}
        />
      )}

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
        onScrollToIndexFailed={info => {
          const wait = new Promise(resolve => setTimeout(resolve, 100))
          wait.then(() => {
            listRef.current?.scrollToIndex({ index: info.highestMeasuredFrameIndex, animated: false })
          })
        }}
        renderItem={renderRow}
      />

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
