import { useState, type ComponentProps, type ReactNode } from "react"

import { Stack } from "expo-router"
import { Animated, Text, View } from "react-native"

import { AppHeader } from "@/components/AppHeader"
import { EditWindowBanner } from "@/components/EditWindowBanner"
import { WatchingOverlay } from "@/components/WatchingOverlay"
import { CaseEndedBanner } from "@/components/intraop/CaseEndedBanner"
import { IntraopMonitorHeader } from "@/components/intraop/IntraopMonitorHeader"
import { IntraopTabBar } from "@/components/intraop/IntraopTabBar"
import { usePreferences } from "@/lib/preferences-context"
import { colors, withAlpha } from "@/theme/colors"
import { IntraopHeaderCollapseProvider, useIntraopHeaderCollapse } from "./IntraopHeaderCollapse"

type Props = {
  caseId: string
  status?: string
  finalizedAt?: string | null
  isWatching: boolean
  onTakeover: ComponentProps<typeof WatchingOverlay>["onTakeover"]
  monitor: ComponentProps<typeof IntraopMonitorHeader>
  ended?: ComponentProps<typeof CaseEndedBanner>
  tabBar: ComponentProps<typeof IntraopTabBar>
  children: ReactNode
}

// One object for the life of the app: expo-router re-applies options whenever
// the object changes, and a new one on every render of this busy screen set
// the navigator's state on every render -- a loop that stopped the app.
const SCREEN_OPTIONS = { headerShown: false } as const

export function IntraopScreenChrome({
  caseId,
  status,
  finalizedAt,
  isWatching,
  onTakeover,
  monitor,
  ended,
  tabBar,
  children,
}: Props) {
  return (
    <IntraopHeaderCollapseProvider activeKey={`${caseId}:${tabBar.tab}`}>
      <IntraopScreenChromeBody
        caseId={caseId}
        status={status}
        finalizedAt={finalizedAt}
        isWatching={isWatching}
        onTakeover={onTakeover}
        monitor={monitor}
        ended={ended}
        tabBar={tabBar}
      >
        {children}
      </IntraopScreenChromeBody>
    </IntraopHeaderCollapseProvider>
  )
}

function IntraopScreenChromeBody({
  caseId,
  status,
  finalizedAt,
  isWatching,
  onTakeover,
  monitor,
  ended,
  tabBar,
  children,
}: Omit<Props, "children"> & { children: ReactNode }) {
  const { t } = usePreferences()
  const { progress, collapsed } = useIntraopHeaderCollapse()
  const [expandedHeight, setExpandedHeight] = useState(250)
  // The compact layer includes the safe-area inset and the home/settings
  // controls. Measure it instead of clipping it to a guessed 78 px: the old
  // transparent flash came from this frame becoming shorter than its own
  // content during the collapse animation.
  const [compactHeight, setCompactHeight] = useState(104)
  const frameHeight = progress.interpolate({ inputRange: [0, 1], outputRange: [expandedHeight, compactHeight] })
  const fullOpacity = progress.interpolate({ inputRange: [0, 0.78, 1], outputRange: [1, 1, 0] })
  const fullTranslateY = progress.interpolate({ inputRange: [0, 1], outputRange: [0, -18] })
  const compactOpacity = progress.interpolate({ inputRange: [0, 0.72, 1], outputRange: [0, 0, 1] })
  const compactTranslateY = progress.interpolate({ inputRange: [0, 1], outputRange: [12, 0] })
  return (
    <>
      <Stack.Screen options={SCREEN_OPTIONS} />
      <Animated.View
        style={{ height: frameHeight, overflow: "hidden", backgroundColor: colors.background }}
      >
        <Animated.View
          onLayout={event => {
            const next = event.nativeEvent.layout.height
            if (next > 100 && Math.abs(next - expandedHeight) > 1) setExpandedHeight(next)
          }}
          pointerEvents={collapsed ? "none" : "auto"}
          style={{ backgroundColor: colors.background, opacity: fullOpacity, transform: [{ translateY: fullTranslateY }] }}
        >
          <AppHeader title={t("intraoperative")} showNewCase={false} />
          <IntraopMonitorHeader {...monitor} />
        </Animated.View>
        <Animated.View
          onLayout={event => {
            const next = event.nativeEvent.layout.height
            if (next > 70 && Math.abs(next - compactHeight) > 1) setCompactHeight(next)
          }}
          pointerEvents={collapsed ? "auto" : "none"}
          style={{
            position: "absolute", left: 0, right: 0, bottom: 0,
            backgroundColor: colors.background,
            borderBottomWidth: 1, borderBottomColor: withAlpha(colors.border, "88"),
            opacity: compactOpacity, transform: [{ translateY: compactTranslateY }],
          }}
        >
          <AppHeader eyebrow="LOSPOR" title={monitor.procedure} showNewCase={false} compact />
          <View style={{ minHeight: 24, paddingHorizontal: 16, paddingBottom: 6, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10, backgroundColor: colors.background }}>
            <Text style={{ flex: 1, color: colors.primary, fontSize: 10, fontWeight: "800" }} numberOfLines={1}>
              {monitor.techniquesLabel}
            </Text>
            <Text style={{ color: colors.textPrimary, fontSize: 18, fontWeight: "300", fontVariant: ["tabular-nums"] }}>
              {monitor.timeStr}
            </Text>
          </View>
        </Animated.View>
      </Animated.View>
      {status === "COMPLETE" && finalizedAt ? (
        <EditWindowBanner finalizedAt={finalizedAt} caseId={caseId} showBackButton />
      ) : null}
      {isWatching ? <WatchingOverlay onTakeover={onTakeover} /> : null}
      {ended ? <CaseEndedBanner {...ended} /> : null}
      <IntraopTabBar {...tabBar} />
      {children}
    </>
  )
}
