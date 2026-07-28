import { describe, expect, it } from "vitest"
import type { LibraryOption } from "./use-option-library"
import {
  mapAirwayOptions,
  mapMonitoringOptions,
  mapPositionOptions,
  mapPremedicationCategories,
} from "./intraop-option-mappers"

const row = (overrides: Partial<LibraryOption>): LibraryOption => ({
  id: overrides.id ?? overrides.value ?? "id",
  value: overrides.value ?? "VALUE",
  label: overrides.label ?? "Label",
  labelBg: overrides.labelBg ?? null,
  group: overrides.group ?? null,
  parentId: overrides.parentId ?? null,
  color: overrides.color ?? null,
  description: overrides.description ?? null,
  drugId: overrides.drugId ?? null,
  atcCode: overrides.atcCode ?? null,
  inn: overrides.inn ?? null,
  metadata: overrides.metadata ?? null,
})

describe("intraop option mappers", () => {
  it("maps position rows with fallback descriptions and colors", () => {
    expect(mapPositionOptions([
      row({ value: "SUPINE", label: "Supine", description: "Back" }),
      row({ value: "CUSTOM", label: "Custom" }),
    ])).toEqual([
      { code: "SUPINE", label: "Supine", desc: "Back", color: "#3b82f6" },
      { code: "CUSTOM", label: "Custom", desc: "", color: "#64748b" },
    ])
  })

  it("maps monitoring rows with other fallback section", () => {
    expect(mapMonitoringOptions([
      row({ value: "ecg", label: "ECG", group: "standard" }),
      row({ value: "bis", label: "BIS" }),
    ])).toEqual([
      { field: "ecg", label: "ECG", section: "standard" },
      { field: "bis", label: "BIS", section: "other" },
    ])
  })

  it("filters airway tools and devices by group", () => {
    const rows = [
      row({ value: "DIRECT", label: "Direct", group: "Instrument" }),
      row({ value: "LMA", label: "LMA", group: "Device" }),
    ]
    expect(mapAirwayOptions(rows, "Instrument")).toEqual([{ code: "DIRECT", label: "Direct" }])
    expect(mapAirwayOptions(rows, "Device")).toEqual([{ code: "LMA", label: "LMA" }])
  })

  it("groups premedication drugs and applies metadata defaults", () => {
    expect(mapPremedicationCategories([
      row({
        label: "Midazolam",
        group: "Benzodiazepines",
        metadata: { dose: 7.5, unit: "mg", min: 1, max: 15, step: 0.5, routes: ["PO"], defaultRoute: "PO", hint: "usual" },
      }),
      row({ label: "Omeprazole" }),
    ])).toEqual([
      {
        category: "Benzodiazepines",
        drugs: [{ name: "Midazolam", dose: 7.5, unit: "mg", min: 1, max: 15, step: 0.5, routes: ["PO"], defaultRoute: "PO", hint: "usual" }],
      },
      {
        category: "Other",
        drugs: [{ name: "Omeprazole", dose: 1, unit: "mg", min: 0, max: 100, step: 1, routes: ["PO"], defaultRoute: "PO", hint: "" }],
      },
    ])
  })
})
