import { describe, expect, it } from "vitest"

import type { CaseDetailDto } from "@lospor/core/case-detail"
import type { EventMutation } from "@lospor/core/sync"

import { buildLoadedIntraopCaseState } from "./intraop-case-hydration"

function caseWithKeyEvents(
  keyEvents: unknown,
  timing: Partial<NonNullable<CaseDetailDto["intraop"]>> = {},
): CaseDetailDto {
  return {
    id: "case-1",
    caseCode: "DEMO-1",
    notes: null,
    userId: "user-1",
    institutionId: null,
    status: "IN_PROGRESS",
    finalizedAt: null,
    createdAt: "2026-07-24T08:00:00.000Z",
    updatedAt: "2026-07-24T08:00:00.000Z",
    preop: null,
    postop: null,
    institution: null,
    intraop: {
      id: "intraop-1",
      caseId: "case-1",
      startTime: "08:00",
      keyEvents,
      techniques: [],
      updatedAt: "2026-07-24T08:00:00.000Z",
      syncRevision: 1,
      ...timing,
    } as CaseDetailDto["intraop"],
  }
}

describe("buildLoadedIntraopCaseState", () => {
  it("hydrates valid legacy rows while dropping malformed snapshot and queued events", () => {
    const data = caseWithKeyEvents({
      drugs: [
        { colIdx: 1, name: "Propofol", dose: 100, unit: "mg" },
        { colIdx: "invalid", name: "Broken", dose: "1", unit: "mg" },
      ],
      log: [{ id: "invalid-log", type: "drug" }],
    })
    const pendingMutations = [{
      kind: "event.update",
      eventId: "invalid-mutation",
      event: { id: "invalid-mutation", type: "drug" },
    }] as unknown as EventMutation[]

    const loaded = buildLoadedIntraopCaseState(data, [], [], [], pendingMutations)

    expect(loaded.rawLog).toHaveLength(0)
    expect(loaded.loadedTimetable.startDate).toBeNull()
    expect(loaded.loadedTimetable.timetable?.drugs[0]).toMatchObject({
      name: "Propofol",
      dose: "100",
      unit: "mg",
    })
  })

  it("uses startedAt as the chart anchor in the persisted timezone", () => {
    const data = caseWithKeyEvents({
      log: [{
        id: "start",
        type: "clinical_event",
        ts: "2026-07-24T08:45:00.000Z",
        label: "Anaesthesia start",
      }],
    }, {
      startTime: "11:45",
      startedAt: "2026-07-24T08:45:00.000Z",
      timezone: "Europe/Sofia",
    })
    const loaded = buildLoadedIntraopCaseState(
      data,
      [],
      [],
      [],
      [],
      new Date("2026-07-24T10:00:00.000Z"),
    )

    expect(loaded.timing.startTime).toBe("11:45")
    expect(loaded.loadedTimetable.startDate?.toISOString()).toBe("2026-07-24T08:45:00.000Z")
  })

  it("hydrates a running rate fluid and derives its current delivered volume from real time", () => {
    const data = caseWithKeyEvents({
      log: [
        {
          id:"fluid-start",
          type:"fluid_start",
          ts:"2026-07-24T08:00:00.000Z",
          fluidId:"fluid-1",
          name:"Ringer",
          category:"Crystalloids",
          color:"#06b6d4",
          fluidEntryMode:"RATE",
          rate:"100",
          unit:"mL/h",
        },
        {
          id:"fluid-rate",
          type:"fluid_rate",
          ts:"2026-07-24T08:30:00.000Z",
          fluidId:"fluid-1",
          name:"Ringer",
          fluidEntryMode:"RATE",
          rate:"200",
          unit:"mL/h",
        },
      ],
    }, {
      startedAt:"2026-07-24T08:00:00.000Z",
      timezone:"Europe/Sofia",
    })

    const loaded = buildLoadedIntraopCaseState(
      data,
      [],
      [],
      [],
      [],
      new Date("2026-07-24T09:00:00.000Z"),
    )

    expect(loaded.active.fluids[0]).toMatchObject({
      fluidEntryMode:"RATE",
      startTs:"2026-07-24T08:00:00.000Z",
      initialRate:"100",
      rate:"200",
    })
    expect(loaded.loadedTimetable.timetable?.fluids[0]).toMatchObject({
      fluidEntryMode:"RATE",
      volume:"150",
    })
  })

  it("keeps future legacy columns readable but never turns them into events", () => {
    const vitals = Array.from({ length: 37 }, () => ({}))
    vitals[0] = { systolic: 150 }
    vitals[36] = { systolic: 150 }
    const data = caseWithKeyEvents({ vitals }, {
      startTime: "11:45",
      startedAt: "2026-07-24T08:45:00.000Z",
      timezone: "Europe/Sofia",
    })
    const loaded = buildLoadedIntraopCaseState(
      data,
      [],
      [],
      [],
      [],
      new Date("2026-07-24T10:00:00.000Z"),
    )

    expect(loaded.rawLog).toHaveLength(0)
    expect(loaded.legacyWebLogNeedsSync).toBe(false)
    expect(loaded.loadedTimetable.timetable?.vitals[36]).toMatchObject({ systolic: 150 })
  })

  it("preserves drug selector fields from snapshots and durable offline edits", () => {
    const data = caseWithKeyEvents({
      log: [{
        id: "drug-1",
        type: "drug",
        ts: "2026-07-24T08:45:00.000Z",
        name: "Bupivacaine",
        dose: "12",
        unit: "mg",
        drugRoute: "INTRATHECAL",
        concentration: "0.5%",
        formulation: "HYPERBARIC",
        clinicalRuleKey: "PED_BUPIVACAINE",
        clinicalRuleVersion: "2",
        clinicalRuleSourceIds: ["source-a"],
      }],
    })
    const pendingMutations = [{
      kind: "event.update",
      eventId: "drug-1",
      event: {
        id: "drug-1",
        type: "drug",
        ts: "2026-07-24T08:46:00.000Z",
        name: "Bupivacaine",
        dose: "15",
        unit: "mg",
        drugRoute: "EPIDURAL",
        concentration: "0.25%",
        formulation: "ISOBARIC",
        clinicalRuleKey: "PED_BUPIVACAINE",
        clinicalRuleVersion: "2",
        clinicalRuleSourceIds: ["source-a"],
      },
    }] as unknown as EventMutation[]

    const loaded = buildLoadedIntraopCaseState(data, [], [], [], pendingMutations)

    expect(loaded.rawLog[0]).toMatchObject({
      id: "drug-1",
      dose: "15",
      drugRoute: "EPIDURAL",
      concentration: "0.25%",
      formulation: "ISOBARIC",
      clinicalRuleKey: "PED_BUPIVACAINE",
      clinicalRuleVersion: "2",
      clinicalRuleSourceIds: ["source-a"],
    })
  })
})
