import { afterEach, describe, expect, it } from "vitest"
import { catalogOptions } from "../catalog"
import { FLUID_DISPLAY_NAMES, MEDICATION_NAMES_BG } from "../catalog/medication-names-bg"
import {
  bulgarianNamesVersion,
  displayedEventName,
  clinicalDisplayLabel,
  NO_BULGARIAN_NAMES,
  setBulgarianNameSwitches,
  subscribeBulgarianNames,
} from "./index"

afterEach(() => setBulgarianNameSwitches(NO_BULGARIAN_NAMES))

const ALL_ON = { premed: true, drugs: true, infusions: true, agents: true, fluids: true }

describe("Bulgarian names for drugs, infusions, agents and fluids", () => {
  it("has a Bulgarian name for every medication in the four catalogues", () => {
    const missing = (["PREMED_DRUG", "INTRAOP_DRUG", "INTRAOP_INFUSION", "INHALATIONAL_AGENT"] as const)
      .flatMap(category => catalogOptions(category).map(option => option.label))
      .filter(name => !/\p{Script=Cyrillic}/u.test(MEDICATION_NAMES_BG[name] ?? ""))
    expect(missing).toEqual([])
  })

  it("has display names for every fluid and nothing else", () => {
    const fluids = catalogOptions("INTRAOP_FLUID").map(option => option.label).sort()
    expect(Object.keys(FLUID_DISPLAY_NAMES).sort()).toEqual(fluids)
  })

  it("keeps the international names until the reader switches a catalogue on", () => {
    expect(clinicalDisplayLabel("option:INTRAOP_DRUG", "Rocuronium", "bg")).toBe("Rocuronium")
    setBulgarianNameSwitches({ drugs: true })
    expect(clinicalDisplayLabel("option:INTRAOP_DRUG", "Rocuronium", "bg")).toBe("Рокурониев бромид")
    expect(clinicalDisplayLabel("option:INTRAOP_DRUG", "Rocuronium", "en")).toBe("Rocuronium")
    // Each catalogue has its own switch.
    expect(clinicalDisplayLabel("option:INTRAOP_INFUSION", "Rocuronium", "bg")).toBe("Rocuronium")
    expect(clinicalDisplayLabel("option:PREMED_DRUG", "Midazolam", "bg")).toBe("Midazolam")
    expect(clinicalDisplayLabel("option:INHALATIONAL_AGENT", "SEVOFLURANE", "bg")).toBe("Sevoflurane")
  })

  it("shows a stored fluid by its new English name, and in Bulgarian when switched on", () => {
    // Records keep the catalogue name; only what is shown changes.
    expect(clinicalDisplayLabel("option:INTRAOP_FLUID", "Saline", "en")).toBe("NaCl")
    expect(clinicalDisplayLabel("option:INTRAOP_FLUID", "Dextrose 5% (D5W)", "bg")).toBe("Glucose 5%")
    setBulgarianNameSwitches({ fluids: true })
    expect(clinicalDisplayLabel("option:INTRAOP_FLUID", "Dextrose 5% (D5W)", "bg")).toBe("Глюкоза 5%")
    expect(clinicalDisplayLabel("option:INTRAOP_FLUID", "Ringer's acetate", "bg")).toBe("Рингер ацетат (Sterofundin)")
    expect(clinicalDisplayLabel("option:INTRAOP_FLUID", "Ringer's acetate", "en")).toBe("Ringer's acetate (Sterofundin)")
  })

  it("translates every catalogue once all switches are on", () => {
    setBulgarianNameSwitches(ALL_ON)
    expect(clinicalDisplayLabel("option:PREMED_DRUG", "Midazolam", "bg")).toBe("Мидазолам")
    expect(clinicalDisplayLabel("option:INTRAOP_INFUSION", "Norepinephrine / Noradrenaline", "bg")).toBe("Норадреналин")
    expect(clinicalDisplayLabel("option:INHALATIONAL_AGENT", "SEVOFLURANE", "bg")).toBe("Севофлуран")
  })

  it("tells subscribers only when a switch actually changes", () => {
    let calls = 0
    const unsubscribe = subscribeBulgarianNames(() => { calls += 1 })
    const before = bulgarianNamesVersion()
    setBulgarianNameSwitches({ fluids: true })
    setBulgarianNameSwitches({ fluids: true })
    unsubscribe()
    setBulgarianNameSwitches(NO_BULGARIAN_NAMES)
    expect(calls).toBe(1)
    expect(bulgarianNamesVersion()).toBe(before + 2)
  })

  it("names a timeline event with the switches given, whatever the app has set", () => {
    const drugsOnly = { ...NO_BULGARIAN_NAMES, drugs: true }
    expect(displayedEventName("drug", "Propofol", "bg", drugsOnly)).toBe("Пропофол")
    expect(displayedEventName("infusion_start", "Propofol", "bg", drugsOnly)).toBe("Propofol")
    expect(displayedEventName("fluid_start", "Saline", "bg", drugsOnly)).toBe("NaCl")
    expect(displayedEventName("agent_start", "Sevoflurane", "bg", { ...NO_BULGARIAN_NAMES, agents: true })).toBe("Севофлуран")
    expect(displayedEventName("drug", "Propofol", "en", drugsOnly)).toBe("Propofol")
    // Names outside the catalogue, and events without a catalogue name, are kept.
    expect(displayedEventName("drug", "OTHER:Local mix", "bg", drugsOnly)).toBe("OTHER:Local mix")
    expect(displayedEventName("clinical_event", "Induction", "bg", drugsOnly)).toBe("Induction")
  })
})
