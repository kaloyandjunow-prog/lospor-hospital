import type { ComponentProps, ReactNode } from "react"

import { Stack } from "expo-router"

import { AppHeader } from "@/components/AppHeader"
import { EditWindowBanner } from "@/components/EditWindowBanner"
import { WatchingOverlay } from "@/components/WatchingOverlay"
import { CaseEndedBanner } from "@/components/intraop/CaseEndedBanner"
import { IntraopMonitorHeader } from "@/components/intraop/IntraopMonitorHeader"
import { IntraopTabBar } from "@/components/intraop/IntraopTabBar"

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
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <AppHeader title="Intraoperative" showNewCase={false} />
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
