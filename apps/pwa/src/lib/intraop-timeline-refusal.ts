import type { IntraopTimelineIssue, IntraopTimelineIssueCode } from "@lospor/core/intraop-commands"

import type { ClinicalStringKey } from "@/i18n/clinical-strings"

const MESSAGE_KEYS: Record<IntraopTimelineIssueCode, ClinicalStringKey> = {
  STOP_BEFORE_START: "timelineStopBeforeStart",
  NOT_RUNNING: "timelineNotRunning",
  STOP_BEFORE_LATER_CHANGE: "timelineStopBeforeChange",
  ALREADY_RUNNING: "timelineAlreadyRunning",
  FUTURE_VITAL: "timelineFutureVital",
  BEFORE_CASE_START: "timelineOutsideCase",
  AFTER_CASE_END: "timelineOutsideCase",
}

/** The message for the first refused rule, as a clinical string key. */
export function timelineRefusalMessageKey(issues: IntraopTimelineIssue[]): ClinicalStringKey | null {
  return issues.length ? MESSAGE_KEYS[issues[0].code] : null
}
