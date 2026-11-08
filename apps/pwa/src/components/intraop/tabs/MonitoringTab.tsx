import { Text } from "react-native"
import type { ReactNode } from "react"
import { usePreferences } from "@/lib/preferences-context"
import { useShade } from "@/theme/shade"
import { MonitoringGroups } from "../MonitoringGroups"
import { useIntraopHeaderScroll } from "../IntraopHeaderCollapse"
import { OverflowCueScrollView } from "../OverflowCueScrollView"

type MonitoringOpt = { label: string; field: string; section: string }

/**
 * The Monitoring tab. Smart selection (10.2.0) arrives as `smart`; without it this is the Legacy tab,
 * every monitor grouped by what it tells you.
 */
export function MonitoringTab({
  monitoring, setMonitoring, saveMonitoring, fieldSaving, monitoringOpts, smart,
}: {
  monitoring: string[]
  setMonitoring: (next: string[]) => void
  saveMonitoring: (next: string[]) => void
  fieldSaving: string | null
  monitoringOpts: MonitoringOpt[]
  advMonOpen?: boolean
  setAdvMonOpen?: (updater: (v: boolean) => boolean) => void
  smart?: ReactNode
}) {
  const shade = useShade()
  const { tc } = usePreferences()
  const { onScroll, scrollEventThrottle } = useIntraopHeaderScroll()
  const toggle = (field: string) => {
    const next = monitoring.includes(field) ? monitoring.filter(item => item !== field) : [...monitoring, field]
    setMonitoring(next)
    saveMonitoring(next)
  }
  return (
    <OverflowCueScrollView style={{ flex: 1 }} scrollViewStyle={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 40 }} onScroll={onScroll} scrollEventThrottle={scrollEventThrottle}>
      {fieldSaving === "monitoring" ? <Text style={{ color: shade("#94a3b8"), fontSize: 11, marginBottom: 8 }}>{tc("draftSaving")}</Text> : null}
      {smart ?? <MonitoringGroups monitoring={monitoring} onToggle={toggle} monitoringOpts={monitoringOpts} />}
    </OverflowCueScrollView>
  )
}
