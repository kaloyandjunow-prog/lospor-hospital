import { describe, expect, it } from "vitest"
import {
  activeTechniquesForCase,
  addMonitoringDefaultsForTechniques,
  buildMonitoringSelectionPatch,
  buildTechniqueMonitoringUpdate,
  hasAdvancedMonitoringSelected,
  isGeneralAnesthesiaTechnique,
  isGeneralAnesthesiaCase,
  isNeuraxialTechnique,
  isTivaTechnique,
  monitoringDefaultFieldsForTechniques,
  requiredMonitoringFieldsForTechniques,
  selectedMonitoringFieldsFromRecord,
} from "./intraop-monitoring-defaults"

describe("intraop monitoring defaults", () => {
  it("requires standard general anesthesia monitoring plus temperature", () => {
    expect(requiredMonitoringFieldsForTechniques(["GENERAL_INHALATION"])).toEqual([
      "ecg",
      "spO2Monitor",
      "nbpMonitor",
      "etco2Monitor",
      "tempMonitor",
    ])
  })

  it("adds BIS for TIVA", () => {
    expect(requiredMonitoringFieldsForTechniques(["GENERAL_TIVA"])).toEqual([
      "ecg",
      "spO2Monitor",
      "nbpMonitor",
      "etco2Monitor",
      "tempMonitor",
      "bis",
    ])
  })

  it("requires basic monitoring for neuraxial techniques", () => {
    for (const technique of ["SPINAL_SINGLE_SHOT", "EPIDURAL_LUMBAR", "CSE", "DPE"]) {
      expect(requiredMonitoringFieldsForTechniques([technique])).toEqual([
        "ecg",
        "spO2Monitor",
        "nbpMonitor",
        "etco2Monitor",
      ])
    }
  })

  it("does not require monitoring for unrelated techniques", () => {
    expect(requiredMonitoringFieldsForTechniques(["PERIPHERAL_NERVE_BLOCK"])).toEqual([])
  })

  it("classifies technique families", () => {
    expect(isGeneralAnesthesiaTechnique("GENERAL_COMBINED")).toBe(true)
    expect(isTivaTechnique("GENERAL_TIVA")).toBe(true)
    expect(isNeuraxialTechnique("EPIDURAL_THORACIC")).toBe(true)
  })

  it("uses local techniques before case techniques", () => {
    expect(activeTechniquesForCase(["LOCAL"], ["GENERAL_TIVA"])).toEqual(["LOCAL"])
    expect(activeTechniquesForCase([], ["GENERAL_TIVA"])).toEqual(["GENERAL_TIVA"])
    expect(activeTechniquesForCase([], undefined)).toEqual([])
  })

  it("detects general anesthesia cases for vitals visibility", () => {
    expect(isGeneralAnesthesiaCase(["GENERAL_TIVA"])).toBe(true)
    expect(isGeneralAnesthesiaCase(["TIVA"])).toBe(true)
    expect(isGeneralAnesthesiaCase(["LMA"])).toBe(true)
    expect(isGeneralAnesthesiaCase(["SPINAL_SINGLE_SHOT"])).toBe(false)
  })

  it("maps techniques to additive monitoring field IDs", () => {
    expect(monitoringDefaultFieldsForTechniques(["GENERAL_TIVA"])).toEqual([
      "ecg",
      "spO2Monitor",
      "nbpMonitor",
      "etco2Monitor",
      "tempMonitor",
      "bis",
    ])
    expect(monitoringDefaultFieldsForTechniques(["SPINAL_SINGLE_SHOT"])).toEqual([
      "ecg",
      "spO2Monitor",
      "nbpMonitor",
      "etco2Monitor",
    ])
  })

  it("adds monitoring fields without removing current selections", () => {
    expect(addMonitoringDefaultsForTechniques(["GENERAL_INHALATION"], ["customMonitor", "ecg"])).toEqual([
      "customMonitor",
      "ecg",
      "spO2Monitor",
      "nbpMonitor",
      "etco2Monitor",
      "tempMonitor",
    ])
    expect(addMonitoringDefaultsForTechniques(["LOCAL"], ["customMonitor"])).toBeNull()
  })

  it("maps selected monitoring fields to field booleans", () => {
    expect(buildMonitoringSelectionPatch([
      { field: "ecg", label: "ECG" },
      { field: "bis", label: "BIS" },
    ], ["bis"])).toEqual({
      ecg: false,
      bis: true,
    })
  })

  it("maps stored monitoring booleans back to field IDs", () => {
    expect(selectedMonitoringFieldsFromRecord([
      { field: "ecg", label: "ECG" },
      { field: "bis", label: "BIS" },
      { field: "tempMonitor", label: "Temperature" },
    ], {
      ecg: true,
      bis: false,
      tempMonitor: 1,
    })).toEqual(["ecg", "tempMonitor"])
    expect(selectedMonitoringFieldsFromRecord([{ field: "ecg", label: "ECG" }], null)).toEqual([])
  })

  it("detects selected advanced monitoring fields", () => {
    const options = [
      { field: "ecg", label: "ECG", section: "standard" },
      { field: "bis", label: "BIS", section: "advanced" },
    ]
    expect(hasAdvancedMonitoringSelected(options, { ecg: true })).toBe(false)
    expect(hasAdvancedMonitoringSelected(options, { bis: true })).toBe(true)
    expect(hasAdvancedMonitoringSelected(options, null)).toBe(false)
  })

  it("builds technique patches without monitoring changes when no defaults are required", () => {
    expect(buildTechniqueMonitoringUpdate([
      { field: "ecg", label: "ECG" },
    ], ["customMonitor"], ["LOCAL"])).toEqual({
      patch: { techniques: ["LOCAL"] },
      monitoring: null,
    })
  })

  it("builds technique monitoring patches and preserves current field IDs", () => {
    expect(buildTechniqueMonitoringUpdate([
      { field: "ecg", label: "ECG" },
      { field: "spO2Monitor", label: "SpO2" },
      { field: "nbpMonitor", label: "NIBP" },
      { field: "etco2Monitor", label: "Capnography (EtCO2)" },
      { field: "tempMonitor", label: "Temperature" },
      { field: "bis", label: "BIS" },
    ], ["customMonitor"], ["GENERAL_TIVA"])).toEqual({
      patch: {
        techniques: ["GENERAL_TIVA"],
        ecg: true,
        spO2Monitor: true,
        nbpMonitor: true,
        etco2Monitor: true,
        tempMonitor: true,
        bis: true,
      },
      monitoring: [
        "customMonitor",
        "ecg",
        "spO2Monitor",
        "nbpMonitor",
        "etco2Monitor",
        "tempMonitor",
        "bis",
      ],
    })
  })
})