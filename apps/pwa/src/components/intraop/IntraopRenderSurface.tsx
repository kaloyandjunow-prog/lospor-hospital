import { memo, useCallback } from "react"
import { View, type PanResponderInstance } from "react-native"

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
  const tabContent = useStableRenderModel(
    buildIntraopTabContentProps({ ...props, logEventText, logBuildSummary }),
  )
  const sheets = useStableRenderModel(buildIntraopSheetsProps(props))

  return (
    <>
      <View style={{ flex:1, width: screenWidth, overflow: "hidden" }} {...tabSwipeResponder.panHandlers}>
        <MemoizedIntraopTabContentHost {...tabContent} />
      </View>
      <MemoizedIntraopSheetsHost {...sheets} />
    </>
  )
}
