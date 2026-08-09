import { memo, Profiler, useCallback } from "react"
import { View, type PanResponderInstance } from "react-native"

import { recordRenderPhases } from "@/lib/diagnostics"

import type { VitalsEntry } from "@/components/IntraopTimetable"
import { IntraopSheetsHost } from "@/components/intraop/IntraopSheetsHost"
import { IntraopTabContentHost } from "@/components/intraop/IntraopTabContentHost"
import {
  buildIntraopSheetsProps,
  type IntraopSheetsBuilderProps,
} from "@/components/intraop/buildIntraopSheetsProps"
import {
  buildIntraopTabContentProps,
  type IntraopTabContentBuilderProps,
} from "@/components/intraop/buildIntraopTabContentProps"
import type { LogEvent } from "@/lib/intraop-log-event"
import { buildRowSummary } from "@/lib/intraop-running"
import { useStableRenderModel } from "@/lib/use-stable-render-model"

const MemoizedIntraopTabContentHost = memo(IntraopTabContentHost)
const MemoizedIntraopSheetsHost = memo(IntraopSheetsHost)

type IntraopRenderSurfaceProps = IntraopTabContentBuilderProps
  & IntraopSheetsBuilderProps
  & { tabSwipeResponder: PanResponderInstance }

export function IntraopRenderSurface(props: IntraopRenderSurfaceProps) {
  const { screenWidth, tabSwipeResponder, eventLabel } = props
  const logEventText = useCallback((event: LogEvent) => eventLabel(event).text, [eventLabel])
  const logBuildSummary = useCallback(
    (vital: VitalsEntry | undefined, rowEvents: LogEvent[]) => buildRowSummary(vital, rowEvents, logEventText),
    [logEventText],
  )
  // Timed so a slow switch can be attributed to a specific step rather than to
  // "the render". `Profiler` supplies React's own measure of each subtree.
  const t0 = performance.now()
  const builtTab = buildIntraopTabContentProps({ ...props, logEventText, logBuildSummary })
  const t1 = performance.now()
  const tabContent = useStableRenderModel(builtTab)
  const t2 = performance.now()
  const builtSheets = buildIntraopSheetsProps(props)
  const t3 = performance.now()
  const sheets = useStableRenderModel(builtSheets)
  const t4 = performance.now()
  recordRenderPhases({
    buildTab: t1 - t0,
    walkTab: t2 - t1,
    buildSheets: t3 - t2,
    walkSheets: t4 - t3,
  })

  return (
    <>
      <View style={{ flex:1, width: screenWidth, overflow: "hidden" }} {...tabSwipeResponder.panHandlers}>
        <Profiler
          id="tab"
          onRender={(_id, _phase, actualDuration) => recordRenderPhases({ tabTree: actualDuration })}
        >
          <MemoizedIntraopTabContentHost {...tabContent} />
        </Profiler>
      </View>
      <Profiler
        id="sheets"
        onRender={(_id, _phase, actualDuration) => recordRenderPhases({ sheetTree: actualDuration })}
      >
        <MemoizedIntraopSheetsHost {...sheets} />
      </Profiler>
    </>
  )
}
