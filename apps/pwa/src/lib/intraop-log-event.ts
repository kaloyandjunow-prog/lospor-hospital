import { randomHex } from "@/lib/random-id"

export type {
  ActiveFluid,
  ActiveGasSettings,
  ActiveInfusion,
  EventType,
  LogEvent,
} from "@lospor/core/intraop-types"

// Local id generator for in-memory infusion/fluid/log entries. Uses the
// crypto-backed randomHex (with a React Native fallback) so concurrent entries
// in the clinical event log cannot collide.
export function uid() {
  return randomHex(8)
}
