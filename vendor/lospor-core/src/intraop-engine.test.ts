import { describe, expect, it } from "vitest"
import {
  projectIntraopEvents,
  rebuildIntraopActiveState,
  reverseProjectIntraop,
  sortIntraopEvents,
} from "./intraop-engine"
import {
  describeIntraopEvent,
  gasSettingsAtColumn,
  runningItemsAt,
  runningItemsByColumn,
} from "./intraop-summary"
import { parseLogEvents, type LogEvent } from "./intraop-types"

const at = (minutes: number) => new Date(Date.UTC(2026, 6, 24, 8, minutes)).toISOString()

function event(id: string, minutes: number, value: Omit<LogEvent, "id" | "ts">): LogEvent {
  return { id, ts: at(minutes), ...value }
}

const completeLog: LogEvent[] = [
  event("vital", 5, { type: "vital", systolic: 120, diastolic: 70, heartRate: 60 }),
  event("drug", 10, {
    type: "drug",
    name: "Bupivacaine",
    dose: "12",
    unit: "mg",
    drugRoute: "INTRATHECAL",
    concentration: "0.5%",
    concentrationValue: 0.5,
    concentrationUnit: "PERCENT",
    formulation: "HYPERBARIC",
    calculationBasis: "IBW",
    calculationWeightKg: 30,
    calculationMethod: "MCLAREN_CDC_2000",
    clinicalRuleKey: "bupivacaine-pediatric",
    clinicalRuleVersion: "hospital-a.v2",
    clinicalRuleSourceIds: ["LOCAL_POLICY"],
    clinicalPresetId: "preset-a",
    clinicalPresetVersion: 2,
  }),
  event("inf-start", 0, {
    type: "infusion_start",
    infId: "inf-1",
    name: "Lidocaine",
    rate: "2",
    unit: "ml/hr",
    concentration: "1%",
    formulation: "ISOBARIC",
    clinicalRuleKey: "PEDIATRIC_INFUSION_PROFILE:LIDOCAINE:730.485-6574.365:ANY-ANY",
    clinicalRuleVersion: "LOSPOR_PEDIATRICS.v1.draft1",
    clinicalRuleSourceIds: ["LOCAL_POLICY"],
    clinicalPresetId: "pediatric-platform",
    clinicalPresetVersion: 1,
    clinicalPresetScope: "PLATFORM",
  }),
  event("inf-rate", 10, { type: "infusion_rate", infId: "inf-1", rate: "4", unit: "ml/hr" }),
  event("inf-stop", 20, { type: "infusion_stop", infId: "inf-1" }),
  event("fluid-start", 5, {
    type: "fluid_start",
    fluidId: "fluid-1",
    name: "Plasma-Lyte",
    volume: "500",
    category: "Crystalloids",
    clinicalRuleKey: "PEDIATRIC_FLUID_PROFILE:PLASMA_LYTE:0-6574.365",
    clinicalRuleVersion: "pediatric-fluid.v1",
    clinicalRuleSourceIds: ["NICE_NG29"],
    clinicalPresetId: "pediatric-platform",
    clinicalPresetVersion: 1,
    clinicalPresetScope: "PLATFORM",
  }),
  event("agent-start", 0, { type: "agent_start", name: "Sevoflurane", value: "2" }),
  event("agent-change", 10, { type: "agent_start", name: "Sevoflurane", value: "1.7" }),
  event("agent-stop", 25, { type: "agent_stop", name: "Sevoflurane" }),
  event("gas-start", 0, { type: "gas_start", carrierGas: "air", fio2: 50, fgf: 2 }),
  event("gas-change", 10, { type: "gas_change", carrierGas: "air", fio2: 60, fgf: 1 }),
  event("event", 15, { type: "clinical_event", label: "Incision" }),
  event("position-1", 0, { type: "position_change", name: "Supine" }),
  event("position-2", 15, { type: "position_change", name: "Trendelenburg" }),
  event("phase-1", 0, { type: "phase_change", name: "Induction" }),
  event("phase-2", 15, { type: "phase_change", name: "Maintenance" }),
]

describe("canonical intraoperative engine", () => {
  it("projects every event lane with one shared five-minute clock", () => {
    const timetable = projectIntraopEvents([...completeLog].reverse(), {
      start: at(0),
      openThrough: at(30),
    })

    expect(timetable.vitals[1]).toMatchObject({ systolic: 120, heartRate: 60 })
    expect(timetable.drugs).toEqual([
      expect.objectContaining({
        colIdx: 2,
        name: "Bupivacaine",
        dose: "12",
        route: "INTRATHECAL",
        concentration: "0.5%",
        concentrationValue: 0.5,
        concentrationUnit: "PERCENT",
        formulation: "HYPERBARIC",
        calculationBasis: "IBW",
        calculationWeightKg: 30,
        calculationMethod: "MCLAREN_CDC_2000",
        clinicalRuleKey: "bupivacaine-pediatric",
        clinicalPresetId: "preset-a",
        clinicalPresetVersion: 2,
      }),
    ])
    expect(timetable.infusions).toEqual([
      expect.objectContaining({
        id: "inf-1",
        startCol: 0,
        endCol: 4,
        stopped: true,
        rate: 2,
        concentration: "1%",
        formulation: "ISOBARIC",
        clinicalRuleKey: "PEDIATRIC_INFUSION_PROFILE:LIDOCAINE:730.485-6574.365:ANY-ANY",
        clinicalRuleVersion: "LOSPOR_PEDIATRICS.v1.draft1",
        clinicalRuleSourceIds: ["LOCAL_POLICY"],
        clinicalPresetId: "pediatric-platform",
        clinicalPresetVersion: 1,
        clinicalPresetScope: "PLATFORM",
        rateChanges: [{ col: 2, rate: 4, unit: "ml/hr" }],
      }),
    ])
    expect(timetable.fluids).toEqual([
      expect.objectContaining({
        id: "fluid-1",
        startCol: 1,
        endCol: 7,
        stopped: false,
        clinicalRuleKey: "PEDIATRIC_FLUID_PROFILE:PLASMA_LYTE:0-6574.365",
        clinicalRuleVersion: "pediatric-fluid.v1",
        clinicalRuleSourceIds: ["NICE_NG29"],
        clinicalPresetId: "pediatric-platform",
        clinicalPresetVersion: 1,
        clinicalPresetScope: "PLATFORM",
      }),
    ])
    expect(timetable.agents).toEqual([
      expect.objectContaining({ name: "Sevoflurane", startCol: 0, endCol: 5, percent: 1.7, stopped: true }),
    ])
    expect(timetable.gasSettings).toEqual([
      expect.objectContaining({
        startCol: 0,
        endCol: 7,
        fio2: 50,
        fiAir: 50,
        settingsChanges: [expect.objectContaining({ col: 2, fio2: 60, fiAir: 40 })],
      }),
    ])
    const gas = timetable.gasSettings?.[0]
    expect(gas && gasSettingsAtColumn(gas, 1)).toMatchObject({
      fgf: 2,
      fio2: 50,
      fiAir: 50,
      changeCol: null,
    })
    expect(gas && gasSettingsAtColumn(gas, 2)).toMatchObject({
      fgf: 1,
      fio2: 60,
      fiAir: 40,
      changeCol: 2,
    })
    expect(gasSettingsAtColumn({
      id: "legacy-gas",
      startCol: 0,
      endCol: 2,
      fgf: 10,
      carrierGas: null,
      fio2: 100,
      settingsChanges: [{ col: 1, fgf: 1, carrierGas: "air", fio2: 50 }],
    }, 1)).toMatchObject({
      fgf: 1,
      fio2: 50,
      fiAir: 50,
      changeCol: 1,
    })
    expect(timetable.clinicalEvents).toEqual([
      expect.objectContaining({ colIdx: 3, label: "Incision" }),
    ])
    expect(timetable.positions).toEqual([
      { position: "Supine", startCol: 0, endCol: 3 },
      { position: "Trendelenburg", startCol: 3, endCol: 7 },
    ])
    expect(timetable.phases).toEqual([
      { phase: "Induction", startCol: 0, endCol: 3 },
      { phase: "Maintenance", startCol: 3, endCol: 7 },
    ])
  })

  it("uses timestamp, sequence, then id for deterministic ordering", () => {
    const sameTime = [
      event("z", 0, { type: "clinical_event", label: "third", sequence: 2 }),
      event("b", 0, { type: "clinical_event", label: "second", sequence: 1 }),
      event("a", 0, { type: "clinical_event", label: "first", sequence: 1 }),
    ]
    expect(sortIntraopEvents(sameTime).map(item => item.id)).toEqual(["a", "b", "z"])
  })

  it("orders one fluid's same-instant lifecycle as start, rate, then end", () => {
    const sameTime = [
      event("a-end", 0, {
        type: "fluid_end",
        fluidId: "fluid-1",
        administeredVolumeMl: 0,
        sequence: 1,
      }),
      event("b-rate", 0, {
        type: "fluid_rate",
        fluidId: "fluid-1",
        rate: "80",
        unit: "mL/h",
        sequence: 1,
      }),
      event("z-start", 0, {
        type: "fluid_start",
        fluidId: "fluid-1",
        name: "Plasma-Lyte",
        category: "Crystalloids",
        fluidEntryMode: "RATE",
        rate: "60",
        unit: "mL/h",
        sequence: 1,
      }),
    ]

    expect(sortIntraopEvents(sameTime).map(item => item.type)).toEqual([
      "fluid_start",
      "fluid_rate",
      "fluid_end",
    ])
    expect(projectIntraopEvents(sameTime, { start: at(0) }).fluids).toEqual([
      expect.objectContaining({ id: "fluid-1", stopped: true, volume: "0" }),
    ])
    expect(rebuildIntraopActiveState(sameTime).fluids).toEqual([])
  })

  it("normalizes the legacy event name without dropping clinical events", () => {
    const parsed = parseLogEvents([
      { id: "legacy", ts: at(0), type: "event", label: "Legacy incision" },
    ])
    expect(parsed).toEqual([
      expect.objectContaining({ id: "legacy", type: "clinical_event", label: "Legacy incision" }),
    ])
  })

  it("round-trips legacy stopped segments and reconstructs all event families", () => {
    const projected = projectIntraopEvents(completeLog, { start: at(0), openThrough: at(30) })
    const reconstructed = reverseProjectIntraop(projected, at(0))
    expect(reconstructed.map(item => item.type)).toEqual(expect.arrayContaining([
      "vital", "drug", "infusion_start", "infusion_rate", "infusion_stop",
      "fluid_start", "agent_start", "agent_stop", "gas_start", "gas_change",
      "clinical_event", "position_change", "phase_change",
    ]))
    expect(reconstructed.find(item => item.type === "fluid_start")).toMatchObject({
      clinicalRuleKey: "PEDIATRIC_FLUID_PROFILE:PLASMA_LYTE:0-6574.365",
      clinicalRuleVersion: "pediatric-fluid.v1",
      clinicalRuleSourceIds: ["NICE_NG29"],
      clinicalPresetId: "pediatric-platform",
      clinicalPresetVersion: 1,
      clinicalPresetScope: "PLATFORM",
    })
    expect(reconstructed.find(item => item.type === "infusion_start")).toMatchObject({
      formulation: "ISOBARIC",
      clinicalRuleKey: "PEDIATRIC_INFUSION_PROFILE:LIDOCAINE:730.485-6574.365:ANY-ANY",
      clinicalRuleVersion: "LOSPOR_PEDIATRICS.v1.draft1",
      clinicalRuleSourceIds: ["LOCAL_POLICY"],
      clinicalPresetId: "pediatric-platform",
      clinicalPresetVersion: 1,
      clinicalPresetScope: "PLATFORM",
    })
    const reprojected = projectIntraopEvents(reconstructed, { start: at(0), openThrough: at(30) })
    expect(reprojected.infusions[0]).toMatchObject({ startCol: 0, endCol: 4, stopped: true })
    expect(reprojected.agents[0]).toMatchObject({ startCol: 0, endCol: 5, stopped: true })
  })

  it("rebuilds the currently active clinical state", () => {
    const state = rebuildIntraopActiveState(completeLog)
    expect(state.infusions).toEqual([])
    expect(state.fluids).toEqual([
      expect.objectContaining({
        fluidId: "fluid-1",
        name: "Plasma-Lyte",
        clinicalRuleKey: "PEDIATRIC_FLUID_PROFILE:PLASMA_LYTE:0-6574.365",
        clinicalPresetScope: "PLATFORM",
      }),
    ])
    expect(state.agent).toBeNull()
    expect(state.gas).toMatchObject({ fgf: 1, fio2: 60, fiAir: 40 })
  })

  it("integrates rate fluids using exact timestamps and retains rate-change instants", () => {
    const start = Date.parse(at(0))
    const exact = (seconds: number) => new Date(start + seconds * 1_000).toISOString()
    const timetable = projectIntraopEvents([
      {
        id: "fluid-start-rate",
        ts: exact(0),
        type: "fluid_start",
        fluidId: "fluid-rate",
        name: "Plasma-Lyte",
        category: "Crystalloids",
        fluidEntryMode: "RATE",
        bagVolumeMl: 1_000,
        rate: "60",
        unit: "mL/h",
      },
      {
        id: "fluid-change-rate",
        ts: exact(450),
        type: "fluid_rate",
        fluidId: "fluid-rate",
        rate: "120",
        unit: "mL/h",
      },
      {
        id: "fluid-stop-rate",
        ts: exact(1_350),
        type: "fluid_end",
        fluidId: "fluid-rate",
      },
    ], { start: exact(0) })

    expect(timetable.fluids).toEqual([
      expect.objectContaining({
        id: "fluid-rate",
        fluidEntryMode: "RATE",
        startTs: exact(0),
        endTs: exact(1_350),
        rate: 60,
        unit: "mL/h",
        volume: "38",
        rateChanges: [{ col: 1, ts: exact(450), rate: 120, unit: "mL/h" }],
      }),
    ])
    expect(runningItemsAt(timetable, 0)).toContainEqual(expect.objectContaining({
      kind: "fluid",
      fluidEntryMode: "RATE",
      rate: 60,
      unit: "mL/h",
    }))
    expect(runningItemsAt(timetable, 2)).toContainEqual(expect.objectContaining({
      kind: "fluid",
      fluidEntryMode: "RATE",
      rate: 120,
      unit: "mL/h",
    }))
  })

  it("persists partial bag volume from the end event", () => {
    const timetable = projectIntraopEvents([
      event("partial-start", 0, {
        type: "fluid_start",
        fluidId: "partial",
        name: "Ringer",
        category: "Crystalloids",
        volume: "500",
      }),
      event("partial-end", 10, {
        type: "fluid_end",
        fluidId: "partial",
        volume: "125",
      }),
    ], { start: at(0) })

    expect(timetable.fluids[0]).toMatchObject({
      fluidEntryMode: "VOLUME",
      bagVolumeMl: 500,
      administeredVolumeMl: 125,
      volume: "125",
    })
  })

  it("forces blood products to volume mode", () => {
    const timetable = projectIntraopEvents([
      event("blood", 0, {
        type: "fluid_start",
        fluidId: "blood-1",
        name: "PRBC",
        category: "Blood products",
        fluidEntryMode: "RATE",
        bagVolumeMl: 250,
        rate: "100",
        unit: "mL/h",
      }),
    ], { start: at(0), openThrough: at(30) })
    expect(timetable.fluids[0]).toMatchObject({
      fluidEntryMode: "VOLUME",
      volume: "250",
    })
  })

  it("describes fluid rates and delivered-volume overrides in the audit log", () => {
    expect(describeIntraopEvent(event("rate-start", 0, {
      type: "fluid_start",
      fluidId: "fluid-1",
      name: "Plasma-Lyte",
      fluidEntryMode: "RATE",
      rate: "40",
      unit: "mL/h",
    }))).toMatchObject({ text: "Plasma-Lyte 40 mL/h", sub: "Fluid rate started" })
    expect(describeIntraopEvent(event("rate-change", 5, {
      type: "fluid_rate",
      fluidId: "fluid-1",
      rate: "60",
      unit: "mL/h",
    }))).toMatchObject({ text: "Fluid → 60 mL/h", sub: "Fluid rate changed" })
    expect(describeIntraopEvent(event("rate-end", 10, {
      type: "fluid_end",
      fluidId: "fluid-1",
      name: "Plasma-Lyte",
      administeredVolumeMl: 8,
    }))).toMatchObject({ text: "Plasma-Lyte complete · 8 mL" })
  })

  it("builds visible running rows without changing per-column results", () => {
    const timetable = projectIntraopEvents(completeLog, {
      start: at(0),
      openThrough: at(30),
    })
    const columns = [0, 1, 2, 4, 6]
    const rows = runningItemsByColumn(timetable, columns)
    for (const column of columns) {
      expect(rows.get(column)).toEqual(runningItemsAt(timetable, column))
    }
  })
})
