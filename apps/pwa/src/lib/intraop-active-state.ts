import type { LogEvent } from "@/lib/intraop-log-event"
import {
  rebuildIntraopActiveState,
  type ActiveAgent,
  type IntraopActiveState,
} from "@lospor/core/intraop-engine"

export type { ActiveAgent }

// The caller may pass either chronological or newest-first data; Core owns
// deterministic ordering and the active-state transition rules.
export function rebuildActiveState(
  log: LogEvent[],
): IntraopActiveState {
  return rebuildIntraopActiveState(log)
}
