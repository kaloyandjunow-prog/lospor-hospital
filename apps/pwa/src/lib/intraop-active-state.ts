import type { LogEvent } from "@/lib/intraop-log-event"
import {
  rebuildIntraopActiveState,
  type ActiveAgent,
  type IntraopActiveState,
} from "@lospor/core/intraop-engine"

export type { ActiveAgent }

// The caller may pass either chronological or newest-first data; Core owns
// deterministic ordering and the active-state transition rules.
// Read at `asOf` (now, or the case end): a future-dated (planned) start is
// not running yet.
export function rebuildActiveState(
  log: LogEvent[],
  asOf: Date | string | number = new Date(),
): IntraopActiveState {
  return rebuildIntraopActiveState(log, asOf)
}
