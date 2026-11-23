import { describe, expect, it } from "vitest"
import { EMPTY_INTRAOP_HISTORY, intraopApplyRedo, intraopApplyUndo, intraopHistoryPush, intraopHistoryRedo, intraopHistoryUndo, intraopUndoEntry } from "./intraop-undo"
import type { LogEvent } from "./intraop-types"

const a: LogEvent = { id: "a", ts: "2026-11-21T08:00:00.000Z", type: "drug", name: "Fentanyl", dose: "100" }
const b: LogEvent = { id: "b", ts: "2026-11-21T08:05:00.000Z", type: "drug", name: "Propofol", dose: "150" }

const NOW = new Date("2026-11-21T09:00:00.000Z")
// What comes back is stamped as made now: the server keeps the last change made, so a restored entry with its old
// time would be refused as superseded by the deletion it undoes.
const made = (event: LogEvent): LogEvent => ({ ...event, recordedAt: NOW.toISOString() })

describe("intraop undo", () => {
  it("keeps only what an edit touched, and undoes and redoes it", () => {
    const moved = { ...a, ts: "2026-11-21T08:10:00.000Z" }
    const entry = intraopUndoEntry([a, b], [moved, b], "Fentanyl moved")!
    expect(entry.before).toEqual([a])
    expect(entry.after).toEqual([moved])
    expect(intraopApplyUndo([moved, b], entry, NOW)).toEqual([b, made(a)])
    expect(intraopApplyRedo([b, a], entry, NOW)).toEqual([b, made(moved)])
  })

  it("undoes an addition and a deletion", () => {
    const added = intraopUndoEntry([a], [a, b], "added")!
    expect(intraopApplyUndo([a, b], added, NOW)).toEqual([a])
    const removed = intraopUndoEntry([a, b], [a], "removed")!
    expect(intraopApplyUndo([a], removed, NOW)).toEqual([a, made(b)])
    expect(intraopUndoEntry([a], [a], "nothing")).toBeNull()
  })

  it("walks a history of many steps and clears redo on a new edit", () => {
    let history = intraopHistoryPush(EMPTY_INTRAOP_HISTORY, intraopUndoEntry([], [a], "1"))
    history = intraopHistoryPush(history, intraopUndoEntry([a], [a, b], "2"))
    const one = intraopHistoryUndo(history, [a, b])!
    expect(one.events.map(event => event.id)).toEqual(["a"])
    const two = intraopHistoryUndo(one.history, one.events)!
    expect(two.events).toEqual([])
    const again = intraopHistoryRedo(two.history, two.events)!
    expect(again.events.map(event => event.id)).toEqual(["a"])
    expect(again.events[0]!.recordedAt).toBeTruthy()
    expect(intraopHistoryPush(again.history, intraopUndoEntry([a], [], "3")).undone).toEqual([])
  })
})
