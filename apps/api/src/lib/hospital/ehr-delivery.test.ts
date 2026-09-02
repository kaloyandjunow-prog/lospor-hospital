import { describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))
vi.mock("@/lib/prisma", () => ({ prisma: {} }))

import { FINALIZE_UNDO_WINDOW_MS } from "@/lib/constants"
import {
  deliverAfterFor,
  deliveriesFor,
  dueEhrDeliveries,
  queueCaseSignal,
  queueFinalizationDeliveries,
  type EhrDeliveryClient,
} from "./ehr-delivery"

/**
 * The queue decides *when* a message may go and *whether* it still should. The
 * sending is a transport's work, so what is worth pinning here is the timing
 * and the supersession — the two places where a hospital can end up holding a
 * version of a case the appliance no longer has.
 */

const NOW = new Date("2026-09-02T09:00:00.000Z")
type Row = Record<string, unknown>

function client(seed: Row[] = []) {
  const rows: Row[] = [...seed]
  let n = 1
  const matches = (row: Row, where: Row): boolean =>
    Object.entries(where).every(([k, want]) => {
      if (k === "OR") {
        return (want as Row[]).some(clause => matches(row, clause))
      }
      const have = row[k]
      if (want && typeof want === "object") {
        const c = want as Record<string, unknown>
        if ("in" in c) return (c.in as unknown[]).includes(have)
        if ("lte" in c) return have != null && (have as Date) <= (c.lte as Date)
      }
      return have === want
    })

  const db = {
    rows,
    ehrDelivery: {
      findUnique: vi.fn(async (args: { where: Row }) => {
        const key = args.where.finalizationId_kind as Row | undefined
        if (!key) return null
        return rows.find(r => r.finalizationId === key.finalizationId && r.kind === key.kind) ?? null
      }),
      findMany: vi.fn(async (args: { where: Row; take?: number; orderBy?: unknown }) => {
        const hit = rows.filter(r => matches(r, args.where))
        hit.sort((a, b) =>
          (a.deliverAfter as Date).getTime() - (b.deliverAfter as Date).getTime()
          || String(a.id).localeCompare(String(b.id)))
        return hit.slice(0, args.take ?? 20)
      }),
      create: vi.fn(async (args: { data: Row }) => {
        const row = { id: `d-${n++}`, status: "PENDING", attemptCount: 0, nextAttemptAt: null, ...args.data }
        rows.push(row)
        return row
      }),
      updateMany: vi.fn(async (args: { where: Row; data: Row }) => {
        const hit = rows.filter(r => matches(r, args.where))
        for (const r of hit) Object.assign(r, args.data)
        return { count: hit.length }
      }),
    },
  }
  return db as typeof db & EhrDeliveryClient
}

const base = {
  institutionId: "inst-1",
  caseId: "case-1",
  transport: "FOLDER" as const,
  finalizedAt: NOW,
  sequence: 1,
  hasSafetyFindings: false,
}

describe("nothing leaves before the undo window closes", () => {
  // A case finalized at 09:00 once reached Central at 09:01 and was undone at
  // 09:10, still inside the permitted window, leaving Central holding a
  // finalized version the hospital no longer had. Nothing detected it.

  it("holds a message for the full undo window", () => {
    expect(deliverAfterFor(NOW).getTime() - NOW.getTime()).toBe(FINALIZE_UNDO_WINDOW_MS)
  })

  it("does not offer a message whose window is still open", async () => {
    const db = client()
    await queueFinalizationDeliveries(db, { ...base, finalizationId: "fin-1" })

    const fiveMinutesLater = new Date(NOW.getTime() + 5 * 60_000)
    expect(await dueEhrDeliveries(db, { now: fiveMinutesLater })).toEqual([])
  })

  it("offers it once the window has closed", async () => {
    const db = client()
    await queueFinalizationDeliveries(db, { ...base, finalizationId: "fin-1" })

    const after = new Date(NOW.getTime() + FINALIZE_UNDO_WINDOW_MS)
    const due = await dueEhrDeliveries(db, { now: after })

    expect(due.map(d => d.kind)).toEqual(["PROTOCOL"])
  })

  it("drains a backlog oldest first", async () => {
    // Newest-first would starve the oldest message permanently, which is the
    // failure Central's delivery had.
    const db = client()
    await queueFinalizationDeliveries(db, { ...base, finalizationId: "old", finalizedAt: new Date(NOW.getTime() - 3600_000) })
    await queueFinalizationDeliveries(db, { ...base, finalizationId: "new" })

    const after = new Date(NOW.getTime() + FINALIZE_UNDO_WINDOW_MS)
    const due = await dueEhrDeliveries(db, { now: after })

    expect(due).toHaveLength(2)
    expect(db.rows.find(r => r.id === due[0].id)?.finalizationId).toBe("old")
  })
})

describe("a correction supersedes rather than edits", () => {
  it("stops an unsent message describing a version that no longer exists", async () => {
    const db = client()
    await queueFinalizationDeliveries(db, { ...base, finalizationId: "fin-1" })

    const result = await queueFinalizationDeliveries(db, {
      ...base, finalizationId: "fin-2", sequence: 2, supersedesFinalizationId: "fin-1",
    })

    expect(result.superseded).toBe(1)
    expect(db.rows.find(r => r.finalizationId === "fin-1")?.status).toBe("SUPERSEDED")
    expect(db.rows.find(r => r.finalizationId === "fin-2")?.status).toBe("PENDING")
  })

  it("leaves an already-sent message alone, so it stays reconstructable", async () => {
    // What was sent was sent. The correction is a second message the hospital
    // receives, not a rewriting of the first.
    const db = client()
    await queueFinalizationDeliveries(db, { ...base, finalizationId: "fin-1" })
    db.rows[0].status = "SENT"

    const result = await queueFinalizationDeliveries(db, {
      ...base, finalizationId: "fin-2", sequence: 2, supersedesFinalizationId: "fin-1",
    })

    expect(result.superseded).toBe(0)
    expect(db.rows.find(r => r.finalizationId === "fin-1")?.status).toBe("SENT")
  })

  it("does not offer a superseded message to a worker", async () => {
    const db = client()
    await queueFinalizationDeliveries(db, { ...base, finalizationId: "fin-1" })
    await queueFinalizationDeliveries(db, {
      ...base, finalizationId: "fin-2", sequence: 2, supersedesFinalizationId: "fin-1",
    })

    const after = new Date(NOW.getTime() + FINALIZE_UNDO_WINDOW_MS)
    const due = await dueEhrDeliveries(db, { now: after })

    expect(due).toHaveLength(1)
    expect(db.rows.find(r => r.id === due[0].id)?.finalizationId).toBe("fin-2")
  })
})

describe("finalizing twice does not send twice", () => {
  it("is idempotent on the finalization and kind", async () => {
    // Clients retry a finalize. A retry must not become a second message the
    // hospital files twice.
    const db = client()
    const first = await queueFinalizationDeliveries(db, { ...base, finalizationId: "fin-1" })
    const second = await queueFinalizationDeliveries(db, { ...base, finalizationId: "fin-1" })

    expect(first.queued).toEqual(["PROTOCOL"])
    expect(second.queued).toEqual([])
    expect(db.rows).toHaveLength(1)
  })
})

describe("an empty safety message is never queued", () => {
  it("queues only the protocol when there is nothing to warn about", () => {
    expect(deliveriesFor({ hasSafetyFindings: false })).toEqual(["PROTOCOL"])
  })

  it("queues the safety message as its own message when there is", () => {
    // Its own message because it is the part that changes what happens at the
    // next admission, and is wasted inside a document nobody opens until then.
    expect(deliveriesFor({ hasSafetyFindings: true }))
      .toEqual(["PROTOCOL", "SAFETY_FINDINGS"])
  })

  it("queues both for a case that has findings", async () => {
    const db = client()
    const result = await queueFinalizationDeliveries(db, {
      ...base, finalizationId: "fin-1", hasSafetyFindings: true,
    })

    expect(result.queued).toEqual(["PROTOCOL", "SAFETY_FINDINGS"])
  })
})

describe("start and end signals are not held", () => {
  it("goes immediately, because a signal describes a moment not a record", async () => {
    // There is no finalized record to undo, so there is no window to wait out.
    const db = client()
    await queueCaseSignal(db, {
      institutionId: "inst-1", caseId: "case-1", kind: "CASE_START",
      at: NOW, transport: "FOLDER",
    })

    expect(await dueEhrDeliveries(db, { now: NOW })).toHaveLength(1)
  })

  it("a case starts once", async () => {
    const db = client()
    const first = await queueCaseSignal(db, {
      institutionId: "inst-1", caseId: "case-1", kind: "CASE_START", at: NOW, transport: "FOLDER",
    })
    const again = await queueCaseSignal(db, {
      institutionId: "inst-1", caseId: "case-1", kind: "CASE_START", at: NOW, transport: "FOLDER",
    })

    expect(first.queued).toBe(true)
    expect(again.queued).toBe(false)
    expect(db.rows).toHaveLength(1)
  })

  it("keeps start and end apart", async () => {
    const db = client()
    await queueCaseSignal(db, { institutionId: "inst-1", caseId: "case-1", kind: "CASE_START", at: NOW, transport: "FOLDER" })
    await queueCaseSignal(db, { institutionId: "inst-1", caseId: "case-1", kind: "CASE_END", at: NOW, transport: "FOLDER" })

    expect(db.rows.map(r => r.kind).sort()).toEqual(["CASE_END", "CASE_START"])
  })
})
