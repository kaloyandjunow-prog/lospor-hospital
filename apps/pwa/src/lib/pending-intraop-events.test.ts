import { describe, expect, it, vi } from "vitest"
import {
  mergeLogWithPendingIntraopEvents,
  markIntraopEventFailed,
  markIntraopEventSynced,
  prependPendingIntraopEvent,
  removePendingIntraopEvent,
  serializeIntraopEventForServer,
  serializeIntraopLogForServer,
  stripIntraopLogSyncStatuses,
  stripIntraopEventSyncStatus,
} from "./pending-intraop-events"

vi.mock("expo-secure-store", () => ({
  getItemAsync: vi.fn(),
  setItemAsync: vi.fn(),
  deleteItemAsync: vi.fn(),
}))

describe("mergeLogWithPendingIntraopEvents", () => {
  it("keeps pending events ahead of duplicate server events and sorts newest first", () => {
    const pending = [
      { id: "same", ts: "2026-07-01T10:03:00.000Z", label: "pending version" },
      { id: "pending-only", ts: "2026-07-01T10:04:00.000Z", label: "pending only" },
    ]
    const server = [
      { id: "server-only", ts: "2026-07-01T10:05:00.000Z", label: "server only" },
      { id: "same", ts: "2026-07-01T10:06:00.000Z", label: "server duplicate" },
    ]

    expect(mergeLogWithPendingIntraopEvents(server, pending)).toEqual([
      { id: "server-only", ts: "2026-07-01T10:05:00.000Z", label: "server only" },
      { id: "pending-only", ts: "2026-07-01T10:04:00.000Z", label: "pending only" },
      { id: "same", ts: "2026-07-01T10:03:00.000Z", label: "pending version" },
    ])
  })
})

describe("pending intraop event list helpers", () => {
  it("prepends pending events and replaces duplicate ids", () => {
    expect(prependPendingIntraopEvent([
      { id: "same", ts: "old" },
      { id: "other", ts: "other" },
    ], {
      id: "same",
      ts: "new",
    })).toEqual([
      { id: "same", ts: "new" },
      { id: "other", ts: "other" },
    ])
  })

  it("removes pending events by id", () => {
    expect(removePendingIntraopEvent([
      { id: "remove", ts: "a" },
      { id: "keep", ts: "b" },
    ], "remove")).toEqual([{ id: "keep", ts: "b" }])
  })

  it("marks log events synced or failed by id", () => {
    expect(markIntraopEventSynced([
      { id: "event", ts: "a", syncStatus: "pending" },
      { id: "other", ts: "b", syncStatus: "pending" },
    ], "event")).toEqual([
      { id: "event", ts: "a" },
      { id: "other", ts: "b", syncStatus: "pending" },
    ])

    expect(markIntraopEventFailed([
      { id: "event", ts: "a", syncStatus: "pending" },
      { id: "other", ts: "b" },
    ], "event")).toEqual([
      { id: "event", ts: "a", syncStatus: "failed" },
      { id: "other", ts: "b" },
    ])
  })

  it("strips sync statuses from an entire log", () => {
    expect(stripIntraopLogSyncStatuses([
      { id: "a", ts: "1", syncStatus: "pending" },
      { id: "b", ts: "2", syncStatus: "failed" },
    ])).toEqual([
      { id: "a", ts: "1" },
      { id: "b", ts: "2" },
    ])
  })

  it("serializes logs oldest-first for server PUT bodies", () => {
    expect(serializeIntraopLogForServer([
      { id: "new", ts: "2026-01-01T08:05:00.000Z", syncStatus: "pending" },
      { id: "old", ts: "2026-01-01T08:00:00.000Z", syncStatus: "failed" },
    ])).toEqual({
      log: [
        { id: "old", ts: "2026-01-01T08:00:00.000Z" },
        { id: "new", ts: "2026-01-01T08:05:00.000Z" },
      ],
    })
  })
})

describe("stripIntraopEventSyncStatus", () => {
  it("removes local-only syncStatus before sending an event to the API", () => {
    expect(stripIntraopEventSyncStatus({
      id: "event-1",
      ts: "2026-07-01T10:00:00.000Z",
      syncStatus: "pending",
      type: "drug",
    })).toEqual({
      id: "event-1",
      ts: "2026-07-01T10:00:00.000Z",
      type: "drug",
    })
  })
})

describe("serializeIntraopEventForServer", () => {
  it("uses the same server-safe shape for persisted replay and route writes", () => {
    expect(serializeIntraopEventForServer({
      id: "event-2",
      ts: "2026-07-01T10:05:00.000Z",
      syncStatus: "failed",
      type: "drug",
      name: "Fentanyl",
      dose: "25",
      unit: "mcg",
      drugRoute: "IV",
      concentration: "50 mcg/mL",
      formulation: "ISOBARIC",
      drugId: "drug-fentanyl",
      atcCode: "N01AH01",
      inn: "fentanyl",
      clinicalRuleKey: "PED_FENTANYL_IV",
      clinicalRuleVersion: "3",
      clinicalRuleSourceIds: ["source-a"],
    })).toEqual({
      id: "event-2",
      ts: "2026-07-01T10:05:00.000Z",
      type: "drug",
      name: "Fentanyl",
      dose: "25",
      unit: "mcg",
      drugRoute: "IV",
      concentration: "50 mcg/mL",
      formulation: "ISOBARIC",
      drugId: "drug-fentanyl",
      atcCode: "N01AH01",
      inn: "fentanyl",
      clinicalRuleKey: "PED_FENTANYL_IV",
      clinicalRuleVersion: "3",
      clinicalRuleSourceIds: ["source-a"],
    })
  })

  it("preserves canonical rate-fluid and actual-volume fields for offline replay", () => {
    expect(serializeIntraopEventForServer({
      id: "fluid-rate-1",
      ts: "2026-08-02T10:05:00.000Z",
      syncStatus: "pending",
      type: "fluid_rate",
      fluidId: "fluid-1",
      name: "Ringer",
      fluidEntryMode: "RATE",
      rate: "70",
      unit: "mL/h",
      administeredVolumeMl: 35,
    })).toEqual({
      id: "fluid-rate-1",
      ts: "2026-08-02T10:05:00.000Z",
      type: "fluid_rate",
      fluidId: "fluid-1",
      name: "Ringer",
      fluidEntryMode: "RATE",
      rate: "70",
      unit: "mL/h",
      administeredVolumeMl: 35,
    })
  })
})
