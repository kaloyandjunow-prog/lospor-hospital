import type { ComponentProps, ReactNode } from "react"

import { Stack } from "expo-router"

import { AppHeader } from "@/components/AppHeader"
import { EditWindowBanner } from "@/components/EditWindowBanner"
import { WatchingOverlay } from "@/components/WatchingOverlay"
import { CaseEndedBanner } from "@/components/intraop/CaseEndedBanner"
import { IntraopMonitorHeader } from "@/components/intraop/IntraopMonitorHeader"
import { IntraopTabBar } from "@/components/intraop/IntraopTabBar"
import { usePreferences } from "@/lib/preferences-context"

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
  const { t } = usePreferences()
  return (
    <>
      <Stack.Screen options={SCREEN_OPTIONS} />
      <AppHeader title={t("intraoperative")} showNewCase={false} />
      {status === "COMPLETE" && finalizedAt ? (
        <EditWindowBanner finalizedAt={finalizedAt} caseId={caseId} showBackButton />
      ) : null}
      {isWatching ? <WatchingOverlay onTakeover={onTakeover} /> : null}
      <IntraopMonitorHeader {...monitor} />
      {ended ? <CaseEndedBanner {...ended} /> : null}
      <IntraopTabBar {...tabBar} />
      {children}
    </>
  )
}
