import { preopAgeDays } from "@lospor/core/vital-questions"
import type { LogEvent } from "@/lib/intraop-log-event"
import type { IntraopPreopSummary } from "@/lib/intraop-preop-summary"
import type { SaveIntraopEvent } from "@/lib/intraop-stamp"
import { DefibrillationHost } from "./DefibrillationHost"
import { JetHost } from "./JetHost"
import { TourniquetHost } from "./TourniquetHost"

/**
 * The sheets of the one-off clinical entries -- defibrillation, jet ventilation, tourniquet. Rendered beside the chart rather
 * than threaded through IntraopRenderSurface: each needs only the draw list and a few facts of the case, and passing them
 * through that props object would add names to a list that is already the reason the screen is hard to read.
 */
export function IntraopClinicalHosts({ log, save, saveTagged, preop, isWatching, clockOf }: {
  log: LogEvent[]
  save: SaveIntraopEvent
  saveTagged: SaveIntraopEvent
  preop: IntraopPreopSummary | null
  isWatching: boolean
  clockOf: (iso: string) => string
}) {
  return (
    <>
      <DefibrillationHost log={log} save={saveTagged} preop={preop} />
      {!isWatching ? <JetHost log={log} save={save} clockOf={clockOf} /> : null}
      {!isWatching ? <TourniquetHost log={log} save={save} sex={preop?.sex} clockOf={clockOf}
        ageDays={preopAgeDays(preop ? { ageValue: preop.ageValue, ageUnit: preop.ageUnit, ageYears: preop.age, ageApproxDays: preop.ageApproxDays } : null)} /> : null}
    </>
  )
}
