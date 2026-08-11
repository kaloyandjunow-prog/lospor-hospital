/**
 * Timetable types and the empty value, shared by the intraop surfaces.
 *
 * This module used to also export an `IntraopTimetable` component: a second,
 * phone-side timetable editor of about 820 lines. It was unreachable. The tab
 * bar can only select a key from `INTRAOP_TAB_KEYS`, that list never contained
 * "chart", and the one caller rendered it with `showActions={false}`, which
 * disabled seven of its branches anyway. It was removed rather than restored,
 * because `IntraopTimetableTab` is the timetable clinicians actually use.
 *
 * The types stayed here. Eleven modules import them from this path, and they
 * are re-exports of `@lospor/core/intraop-types` — the canonical definitions
 * live in core, so web and phone cannot drift apart on the shape of a chart.
 */
import type {
  AgentSegment,
  GasSettingsSegment,
  TimetableData,
  TimetableDrug,
  TimetableFluid,
  TimetableInfusion,
  VitalsEntry,
} from "@lospor/core/intraop-types"

export type {
  AgentSegment,
  GasSettingsSegment,
  TimetableData,
  TimetableDrug,
  TimetableFluid,
  TimetableInfusion,
  VitalsEntry,
}

export function emptyTimetable(): TimetableData {
  return { vitals: [], drugs: [], fluids: [], infusions: [], agents: [], gasSettings: [] }
}
