import type { AirwayDeviceEntry } from "@lospor/core/airway-device-entries"
import { airwayToolsFromEntries } from "@lospor/core/airway-device-entries"
import { clinicalRelationForEventLabel } from "@lospor/core/intraop-automation-actions"
import type { SaveIntraopEvent } from "@/lib/intraop-stamp"
import { AIRWAY_EVENT_COLORS } from "@/lib/use-phone-airway-charting"

const text = (value: unknown) => (value == null || value === "" ? null : String(value))
const num = (value: unknown) => (typeof value === "number" ? value : value == null || value === "" ? null : Number(value))

type Setter<T> = (value: T) => void
type Setters = {
  setAwDevices: Setter<string[]>; setAwLmaSize: Setter<string | null>; setAwOralTubeSize: Setter<string | null>; setAwOralCuffed: Setter<boolean | null>
  setAwNasalTubeSize: Setter<string | null>; setAwNasalCuffed: Setter<boolean | null>; setAwDltType: Setter<never>; setAwDltSide: Setter<never>
  setAwDltSize: Setter<number | null>; setAwEbSize: Setter<number | null>
  setAwTools: (updater: ((prev: string[]) => string[]) | string[]) => void
}

/**
 * What the airway exchange writes: the legacy fields on screen, the tool list
 * the new entries imply, and the record patch, either inside the clinical event
 * (one atomic write) or on its own when there is no event.
 */
export function airwayExchangePersist({ setters, awTools, save, patchIntraopSection }: {
  setters: Setters
  awTools: string[]
  save: SaveIntraopEvent
  patchIntraopSection: (patch: Record<string, unknown>) => unknown
}) {
  return (
    entries: AirwayDeviceEntry[],
    fields: Record<string, unknown>,
    atomicEvent?: { id?: string; label: string; ts: string; suggestion?: string },
  ) => {
    setters.setAwDevices(Array.isArray(fields.airwayDevices) ? fields.airwayDevices as string[] : [])
    setters.setAwLmaSize(text(fields.lmaSize)); setters.setAwOralTubeSize(text(fields.oralTubeSize)); setters.setAwOralCuffed(fields.oralCuffed as boolean | null)
    setters.setAwNasalTubeSize(text(fields.nasalTubeSize)); setters.setAwNasalCuffed(fields.nasalCuffed as boolean | null)
    setters.setAwDltType(fields.dltType as never); setters.setAwDltSide(fields.dltSide as never); setters.setAwDltSize(num(fields.dltSize)); setters.setAwEbSize(num(fields.endobronchialSize))
    const tools = airwayToolsFromEntries(entries)
    const nextTools = entries.length === 0
      ? []
      : tools.length > 0 ? [...new Set([...awTools, ...tools])] : awTools
    if (entries.length === 0) setters.setAwTools([])
    else if (tools.length > 0) setters.setAwTools(prev => [...new Set([...prev, ...tools])])
    const patch = {
      airwayDeviceEntries: entries,
      ...fields,
      airwayTools: nextTools,
      ...(entries.length > 0 ? { airwayNotApplicable: false } : {}),
    }
    if (atomicEvent) {
      void save({
        ...(atomicEvent.id ? { id: atomicEvent.id } : {}),
        type: "clinical_event",
        label: atomicEvent.label,
        color: AIRWAY_EVENT_COLORS[atomicEvent.label] ?? "#6366f1",
        clinicalRelation: clinicalRelationForEventLabel(atomicEvent.label) ?? undefined,
        ...(atomicEvent.suggestion ? { suggestion: atomicEvent.suggestion } : {}),
        intraopPatch: patch,
      }, atomicEvent.ts)
    } else {
      void patchIntraopSection(patch)
    }
  }
}
