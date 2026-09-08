import { beforeEach, describe, expect, it, vi } from "vitest"

const capabilityState = vi.hoisted(() => vi.fn())

vi.mock("server-only", () => ({}))
vi.mock("@/lib/prisma", () => ({ prisma: {} }))
vi.mock("./ehr-transport-policy", () => ({ ehrTransportCapabilityState: capabilityState }))

import { queueEhrDeliveriesSafe } from "./ehr-delivery-hook"

/**
 * The one line of appliance behaviour that reaches into finalization.
 *
 * What has to hold is not that it queues correctly — ehr-delivery.test.ts
 * covers that — but that it can never take a finalization down with it. The
 * attested record is the thing that matters, and a clinician who cannot
 * finalize because an integration is misconfigured has been handed a worse
 * problem than the one the integration solves.
 */

const NOW = new Date("2026-09-02T09:00:00.000Z")

function db() {
  const rows: Record<string, unknown>[] = []
  return {
    rows,
    ehrDelivery: {
      findUnique: vi.fn(async () => null),
      findMany: vi.fn(async () => []),
      create: vi.fn(async (args: { data: Record<string, unknown> }) => {
        rows.push(args.data)
        return { id: `d-${rows.length}` }
      }),
      updateMany: vi.fn(async () => ({ count: 0 })),
    },
  } as never as { rows: Record<string, unknown>[] } & Parameters<typeof queueEhrDeliveriesSafe>[0]
}

const base = {
  caseId: "case-1",
  institutionId: "inst-1",
  finalizationId: "fin-1",
  sequence: 1,
  finalizedAt: NOW,
  supersedesFinalizationId: null,
  preop: {},
  intraop: {},
}

describe("a misconfigured adapter cannot fail a finalization", () => {
  beforeEach(() => {
    capabilityState.mockReset()
    vi.spyOn(console, "error").mockImplementation(() => {})
  })

  it("swallows a policy lookup that throws", async () => {
    capabilityState.mockRejectedValue(new Error("sealed credential unavailable"))

    await expect(queueEhrDeliveriesSafe(db(), base)).resolves.toBeUndefined()
  })

  it("swallows a queue write that throws", async () => {
    capabilityState.mockResolvedValue({ enabled: true, transport: "FHIR" })
    const client = db()
    client.ehrDelivery.create = vi.fn(async () => { throw new Error("database is gone") }) as never

    await expect(queueEhrDeliveriesSafe(client, base)).resolves.toBeUndefined()
  })

  it("queues nothing when no adapter is configured", async () => {
    // The common case: most sites never turn this on, and finalization must be
    // untouched for them.
    capabilityState.mockResolvedValue({ enabled: false, transport: null })
    const client = db()

    await queueEhrDeliveriesSafe(client, base)

    expect(client.rows).toEqual([])
  })

  it("queues nothing for a case with no institution", async () => {
    // An adapter's identifier scope is the institution — ИЗ № 42 means nothing
    // without knowing whose 42 it is.
    capabilityState.mockResolvedValue({ enabled: true, transport: "FOLDER" })
    const client = db()

    await queueEhrDeliveriesSafe(client, { ...base, institutionId: null })

    expect(client.rows).toEqual([])
    expect(capabilityState).not.toHaveBeenCalled()
  })
})

describe("what it queues when an adapter is configured", () => {
  beforeEach(() => {
    capabilityState.mockReset()
    capabilityState.mockResolvedValue({ enabled: true, transport: "FOLDER" })
  })

  it("queues the protocol for an ordinary case", async () => {
    const client = db()

    await queueEhrDeliveriesSafe(client, base)

    expect(client.rows.map(r => r.kind)).toEqual(["PROTOCOL"])
    expect(client.rows[0].transport).toBe("FOLDER")
  })

  it("adds the safety message when this case learned something", async () => {
    // An unanticipated grade IV: nobody will predict it next time either
    // unless this message says so.
    const client = db()

    await queueEhrDeliveriesSafe(client, {
      ...base,
      preop: { mallampati: "I" },
      intraop: { cormackLehane: "IV" },
    })

    expect(client.rows.map(r => r.kind)).toEqual(["PROTOCOL", "SAFETY_FINDINGS"])
  })

  it("does not queue a safety message for a routine case", async () => {
    const client = db()

    await queueEhrDeliveriesSafe(client, {
      ...base,
      preop: { mallampati: "I", allergies: false },
      intraop: { cormackLehane: "I" },
    })

    expect(client.rows.map(r => r.kind)).toEqual(["PROTOCOL"])
  })

  it("holds delivery until the undo window closes", async () => {
    const client = db()

    await queueEhrDeliveriesSafe(client, base)

    expect((client.rows[0].deliverAfter as Date).getTime()).toBeGreaterThan(NOW.getTime())
  })
})
