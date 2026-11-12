import type { IntraopEventOps } from "@lospor/core/intraop-timetable-edit"

/**
 * A saved event can carry the change it makes to the record (`intraopPatch`): an answer to "which technique?" names
 * the technique. The server applies it when the event is saved; the screen has to take it too, or it keeps the old
 * technique -- and the next suggestion asks again for what was just answered (the same defect as the web's, found
 * 2026-11-11 there). The airway and vascular panels set their own state when they save, so only what a suggestion
 * answer writes is taken here. The same function is in the web app (event-patch-form.ts); it belongs in Core.
 */
export type EventStatePatch = { techniques?: string[]; techniqueSides?: Record<string, string> }

export function statePatchFromEventOps(ops: Pick<IntraopEventOps, "add" | "update">): EventStatePatch {
  const patch: EventStatePatch = {}
  const events = [...ops.add, ...ops.update]
    .filter(event => event.intraopPatch && typeof event.intraopPatch === "object")
    .sort((a, b) => Date.parse(a.recordedAt ?? a.ts) - Date.parse(b.recordedAt ?? b.ts))
  for (const event of events) {
    const raw = event.intraopPatch as Record<string, unknown>
    if (Array.isArray(raw.techniques)) patch.techniques = raw.techniques.filter((code): code is string => typeof code === "string")
    if (raw.techniqueSides && typeof raw.techniqueSides === "object" && !Array.isArray(raw.techniqueSides)) {
      patch.techniqueSides = { ...(raw.techniqueSides as Record<string, string>) }
    }
  }
  return patch
}
