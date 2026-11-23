import { intraopApplyDoseChange, type IntraopDoseKind } from "@lospor/core/intraop-edits"
import type { LogEvent } from "@/lib/intraop-log-event"

/**
 * A dose change entered in a cell goes through Core's one rule (10.8.0): in the
 * cell the item started in it replaces the start's own dose; in a cell that
 * already has a change it replaces that change; anywhere else it is a new
 * change. Written for every kind from here, so every sheet -- infusion rate,
 * fluid rate, agent percent, gas and jet settings -- behaves the same, and the
 * same as the web chart.
 */
const KIND_OF: Partial<Record<LogEvent["type"], IntraopDoseKind>> = {
  infusion_rate: "infusion", fluid_rate: "fluid", agent_start: "agent", gas_change: "gas", jet_change: "jet",
}

function keyOf(kind: IntraopDoseKind, event: Partial<LogEvent>): string | null {
  if (kind === "infusion") return event.infId ?? null
  if (kind === "fluid") return event.fluidId ?? null
  if (kind === "agent") return event.name ?? null
  return kind
}

/** The edited log when the change is an edit in place, null when a new change is to be written. */
export function editDoseInCell(log: LogEvent[], partial: Partial<LogEvent> & { type: LogEvent["type"] }, at: string, chartStart: Date): LogEvent[] | null {
  const kind = KIND_OF[partial.type]
  if (!kind) return null
  // An agent started again with no percent is not a dose change.
  if (kind === "agent" && partial.value == null) return null
  const key = keyOf(kind, partial)
  if (!key) return null
  // What identifies the item and its provenance stays on the start; only the dose itself is replaced.
  const {
    id: _id, type: _type, name: _name, color: _color, infId: _infId, fluidId: _fluidId, agentMode: _agentMode, recordedAt: _recordedAt, syncStatus: _syncStatus,
    suggestion: _suggestion, clinicalRuleKey: _ruleKey, clinicalRuleVersion: _ruleVersion, clinicalRuleSourceIds: _ruleSources,
    clinicalPresetId: _presetId, clinicalPresetVersion: _presetVersion, clinicalPresetScope: _presetScope, fluidEntryMode: _entryMode,
    ...fields
  } = partial as Record<string, unknown>
  return intraopApplyDoseChange(log, { kind, key, at, chartStart, fields: fields as Partial<LogEvent> })
}
