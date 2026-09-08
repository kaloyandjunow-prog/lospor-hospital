import { describe, expect, it } from "vitest"
import {
  monitoringPatchForTechniques,
  requiredMonitoringFieldsForTechniques,
} from "./intraop-domain"
import { MONITORING } from "./catalog"

describe("the monitoring a technique implies", () => {
  it("monitors a general anaesthetic as one", () => {
    expect(requiredMonitoringFieldsForTechniques(["GENERAL_INHALATION"]).sort()).toEqual(
      ["ecg", "etco2Monitor", "nbpMonitor", "spO2Monitor", "tempMonitor"],
    )
  })

  it("adds depth of anaesthesia for TIVA", () => {
    expect(requiredMonitoringFieldsForTechniques(["GENERAL_TIVA"])).toContain("bis")
  })

  it("asks for nothing when no technique has been chosen", () => {
    expect(requiredMonitoringFieldsForTechniques([])).toEqual([])
  })

  /**
   * An arterial line is a decision about this patient, taken by the person at
   * the table. Pre-ticking it on an emergency case documented a line that may
   * never have been sited -- and an emergency is the case least likely to have
   * had time for one. It was on the web form and never on the phone, so the
   * two apps disagreed about the same case.
   */
  it("never pre-ticks invasive arterial pressure", () => {
    for (const techniques of [["GENERAL_INHALATION"], ["GENERAL_TIVA"], ["SPINAL"], []]) {
      expect(requiredMonitoringFieldsForTechniques(techniques)).not.toContain("invasiveBP")
    }
  })

  // Everything it asks for has to be a real monitor, or the patch writes a
  // field the record has no column for.
  it("only names monitors the catalogue carries", () => {
    const known = new Set(MONITORING.map(option => option.field))
    for (const techniques of [["GENERAL_INHALATION"], ["GENERAL_TIVA"], ["EPIDURAL"]]) {
      for (const field of requiredMonitoringFieldsForTechniques(techniques)) {
        expect(known).toContain(field)
      }
    }
  })
})

describe("switching those monitors on", () => {
  it("leaves alone what is already recorded", () => {
    expect(monitoringPatchForTechniques(["GENERAL_INHALATION"], {
      ecg: true, spO2Monitor: true, nbpMonitor: true, etco2Monitor: true, tempMonitor: true,
    })).toEqual({})
  })

  it("switches on only what is missing", () => {
    expect(monitoringPatchForTechniques(["GENERAL_TIVA"], { ecg: true })).toMatchObject({
      spO2Monitor: true, nbpMonitor: true, etco2Monitor: true, tempMonitor: true, bis: true,
    })
  })

  // A monitor explicitly turned off is not "missing"; it is a monitor somebody
  // decided against, and re-ticking it would overrule them.
  it("treats an explicit false as unrecorded rather than as a refusal", () => {
    expect(monitoringPatchForTechniques(["GENERAL_INHALATION"], { bis: false }).bis).toBeUndefined()
    expect(monitoringPatchForTechniques(["GENERAL_TIVA"], { bis: false }).bis).toBe(true)
  })
})
