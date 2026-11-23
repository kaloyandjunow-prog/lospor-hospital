"use client"

import type { ReactNode } from "react"
import { serverNow } from "@/lib/intraop-clock"
import type { WebIntraopAttention } from "@/lib/use-intraop-attention"
import { TimetableMenuHost, useTimetableMenu, type LaneDialogs } from "./TimetableMenuHost"

/**
 * The event log's own copy of the chart's menu (10.8.0, rule 10): a tap on an
 * entry opens the same Repeat dose / Edit / Move / Delete as on the chart and
 * on the PWA, with Undo, and no separate Delete button. Away from the chart
 * there is no dose sheet, so Edit sets the time and Repeat dose repeats it now.
 */
const NO_LANE_DIALOGS: LaneDialogs = {
  changeDose: () => {},
  changeSyringe: () => {},
  switchAgent: () => {},
  stopWithData: () => false,
  editPoint: () => false,
  repeatDose: () => {},
}

export function EventLogMenuHost({ attention, locale, children }: { attention: WebIntraopAttention | null | undefined; locale: string; children: ReactNode }) {
  if (!attention) return <>{children}</>
  return (
    <TimetableMenuHost
      log={attention.log}
      applyOps={ops => attention.applyOps(ops)}
      gridStartMs={null}
      startedAt={null}
      endedAt={null}
      timeZone={attention.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone}
      locale={locale === "bg" ? "bg" : "en"}
      readOnly={!attention.canAnswer}
      now={serverNow}
      dialogs={NO_LANE_DIALOGS}
      cursor={false}
    >
      {children}
    </TimetableMenuHost>
  )
}

/** From a row of the log: opens that entry's menu, or null where no menu is around (read-only). */
export function useLogEntryMenu(): ((eventId: string, title: string, element: HTMLElement) => boolean) | null {
  const menu = useTimetableMenu()
  return menu ? (eventId, title, element) => menu.openPoint({ eventId, rect: element.getBoundingClientRect(), title }) : null
}