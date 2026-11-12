import type { IntraopEventOps } from "@lospor/core/intraop-timetable-edit"

/**
 * A saved event can carry the change it makes to the record (`intraopPatch`): an answer to "which technique?"
 * names the technique, an airway event the device. The server applies it the moment the event is saved. The form
 * has to take it too, or the screen keeps showing the old value until it is reloaded: the sidebar says "Technique
 * -", the readiness check says it is missing, and the suggestions go on asking for what was just answered (found
 * 2026-11-11: Propofol asked "which exact technique?" after the technique had been given).
 *
 * Only what a suggestion answer writes is taken here (Core's context links, the only cards whose answers carry a
 * patch): the technique and its sides, and -- when the answer also names an airway device ("Propofol: which technique
 * and which airway?") -- the airway fields the airway panel itself would set. The panels set their own fields when
 * they save, so their events do not come through here.
 */
export const EVENT_PATCH_FORM_FIELDS = [
  "techniques", "techniqueSides",
  "airwayDeviceEntries", "airwayDevices", "airwayTools", "airwayNotApplicable",
  "lmaSize", "oralTubeSize", "oralCuffed", "nasalTubeSize", "nasalCuffed", "dltType", "dltSide", "dltSize", "endobronchialSize",
] as const
export type EventPatchFormField = typeof EVENT_PATCH_FORM_FIELDS[number]

/** The form values the added and updated events of `ops` set, the latest event winning each field. */
export function formPatchFromEventOps(ops: Pick<IntraopEventOps, "add" | "update">): Partial<Record<EventPatchFormField, unknown>> {
  const patch: Partial<Record<EventPatchFormField, unknown>> = {}
  const events = [...ops.add, ...ops.update]
    .filter(event => event.intraopPatch && typeof event.intraopPatch === "object")
    .sort((a, b) => Date.parse(a.recordedAt ?? a.ts) - Date.parse(b.recordedAt ?? b.ts))
  for (const event of events) {
    for (const field of EVENT_PATCH_FORM_FIELDS) {
      if (field in event.intraopPatch!) patch[field] = event.intraopPatch![field]
    }
  }
  return patch
}
