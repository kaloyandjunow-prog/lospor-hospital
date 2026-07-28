import { describe, expect, it } from "vitest"
import { createCaseWriteQueue } from "@lospor/core/sync"

// Regression guard for the R7 fix (v5.1): the intraop conflict-base timestamp
// (`intraopUpdatedAtRef`) must be advanced INSIDE the enqueued write operation,
// not after `await enqueue(...)`.
//
// The single-flight queue releases the next operation the instant the current
// operation's promise settles. If an event POST advances the base only in the
// caller's continuation (after the await), a section autosave queued behind it
// starts before the base is current, reads the stale timestamp, and 409s the
// user against their own write — the false "Edit conflict" this locks down.
describe("write queue conflict-base ordering", () => {
  it("a base advanced inside the enqueued op is visible to the next queued op", async () => {
    const queue = createCaseWriteQueue()
    const caseId = "case-1"
    const baseRef = { current: "T0" }

    // Op A (the event POST): does async work, THEN advances the base — all
    // inside the enqueued function, mirroring the fixed handleLogEvent.
    const opA = queue.enqueue(caseId, async () => {
      await Promise.resolve() // mimics res.json()
      baseRef.current = "T1"
      return "A"
    })

    // Op B (the section autosave) is enqueued while A is still in flight, so it
    // is strictly serialized behind A. It captures the base at execution time.
    let baseSeenByB: string | null = null
    const opB = queue.enqueue(caseId, async () => {
      baseSeenByB = baseRef.current
      return "B"
    })

    await Promise.all([opA, opB])
    expect(baseSeenByB).toBe("T1")
  })

  it("event write advances the base before the queued section save reads it — no false conflict", async () => {
    const queue = createCaseWriteQueue()
    const caseId = "case-2"
    const baseRef = { current: null as string | null }
    // Stands in for the server's intraop.updatedAt; the event write bumps it.
    let serverUpdatedAt = "T0"

    // Event POST: bumps the server projection, then advances the client base to
    // the echoed value — both INSIDE the op. Moving the base advance outside the
    // op (the bug) leaves baseRef stale here while serverUpdatedAt is already T1.
    queue.enqueue(caseId, async () => {
      await Promise.resolve() // res.json()
      serverUpdatedAt = "T1"
      baseRef.current = serverUpdatedAt
    })

    // Section autosave queued behind the event: the server rejects (409) a base
    // older than its current updatedAt. With the fix, the base is already fresh.
    let conflict = false
    const section = queue.enqueue(caseId, async () => {
      const sentBase = baseRef.current
      conflict = sentBase !== serverUpdatedAt
    })

    await section
    expect(conflict).toBe(false)
  })
})
