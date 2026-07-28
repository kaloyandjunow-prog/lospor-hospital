// Field-level save support: compute which keys of a section payload actually
// changed since the last confirmed save, so clients PATCH only those fields.
//
// The server's section update mappers are partial-safe (absent/undefined keys
// are skipped, never cleared), so a diff sent through the normal PATCH body
// merges onto the stored section. Two clients editing different fields then
// never clobber each other: a stale writer's conflict-retry carries only its
// own changed fields.
//
// Semantics mirror today's wire format exactly:
//  - `undefined` values are treated as absent (JSON.stringify drops them from
//    a full payload today, so they were never "sent" before either)
//  - clearing a field to null/""/false IS a change and is included
//  - values compare by JSON serialization (arrays/objects compare by content)

// Canonical serialization: object keys are sorted recursively so two values
// that differ only in key insertion order compare EQUAL — a raw
// JSON.stringify would report them as changed and trigger a pointless save.
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical)
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {}
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      out[key] = canonical((value as Record<string, unknown>)[key])
    }
    return out
  }
  return value
}

function serialized(value: unknown): string | undefined {
  if (value === undefined) return undefined
  return JSON.stringify(canonical(value))
}

/**
 * Keys of `next` whose serialized value differs from `prev`. Returns null
 * when nothing changed (callers can skip the save entirely).
 */
export function diffChangedFields(
  prev: Record<string, unknown>,
  next: Record<string, unknown>,
): Record<string, unknown> | null {
  const changes: Record<string, unknown> = {}
  let changed = false
  for (const key of Object.keys(next)) {
    const nextVal = serialized(next[key])
    if (nextVal === undefined) continue // absent today, absent in the diff
    if (nextVal !== serialized(prev[key])) {
      changes[key] = next[key]
      changed = true
    }
  }
  return changed ? changes : null
}

/**
 * In-memory snapshot store for "last payload the server confirmed", keyed by
 * caseId+section. Feed `confirm` after a successful save; `diff` before the
 * next one. Never persisted — after a reload the first save is a full payload
 * again, which converges by design.
 */
export type SectionSnapshotStore = ReturnType<typeof createSectionSnapshotStore>

export function createSectionSnapshotStore() {
  const snapshots = new Map<string, Record<string, unknown>>()
  const keyOf = (caseId: string, section: string) => `${caseId}:${section}`

  return {
    /** Changed keys vs the confirmed snapshot; the full payload when no snapshot exists; null when nothing changed. */
    diff(caseId: string, section: string, payload: Record<string, unknown>): Record<string, unknown> | null {
      const prev = snapshots.get(keyOf(caseId, section))
      if (!prev) return payload
      return diffChangedFields(prev, payload)
    },
    /** Record the payload the server just confirmed. */
    confirm(caseId: string, section: string, payload: Record<string, unknown>): void {
      snapshots.set(keyOf(caseId, section), payload)
    },
    /** Merge a server-confirmed partial PATCH into the known full snapshot. */
    merge(caseId: string, section: string, payload: Record<string, unknown>): void {
      const key = keyOf(caseId, section)
      snapshots.set(key, { ...(snapshots.get(key) ?? {}), ...payload })
    },
    /** Drop snapshots (case deleted / cache wiped / test reset). */
    clear(caseId?: string): void {
      if (caseId === undefined) {
        snapshots.clear()
        return
      }
      for (const key of [...snapshots.keys()]) {
        if (key.startsWith(`${caseId}:`)) snapshots.delete(key)
      }
    },
  }
}
