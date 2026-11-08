import { describe, expect, it } from "vitest"
import {
  applyClinicalPreferencesPatch,
  combineClinicalPreferencesPatches,
  DEFAULT_CLINICAL_PREFERENCES,
  mergeClinicalPreferences,
  normalizeClinicalPreferences,
} from "./clinical-preferences"
import {
  AUTOMATION_GROUPS,
  automationGroupEnabled,
  DEFAULT_INTRAOP_AUTOMATION,
  parseIntraopAutomation,
  personalAutomationDefaultEnabled,
  personalAutomationEnabled,
  vitalQuestionAutomationEnabled,
  vitalQuestionsEnabled,
} from "./intraop-automation"

describe("automation groups (10.2.0)", () => {
  it("start with every group on, with a 20 mg dantrolene vial", () => {
    for (const group of AUTOMATION_GROUPS) expect(DEFAULT_INTRAOP_AUTOMATION.groups[group]).toBe(true)
    expect(DEFAULT_INTRAOP_AUTOMATION.enabled).toBe(true)
    // Nothing saved is the default; settings that were saved are read as they are, a missing master switch is off.
    expect(parseIntraopAutomation(null)).toEqual(DEFAULT_INTRAOP_AUTOMATION)
    expect(parseIntraopAutomation({}).enabled).toBe(false)
    expect(parseIntraopAutomation({ enabled: true, groups: {} }).groups.reminders).toBe(true)
    expect(parseIntraopAutomation({ enabled: true, groups: { reminders: false } }).groups.reminders).toBe(false)
    expect(parseIntraopAutomation({ enabled: true, groups: { reminders: "yes" } }).groups.reminders).toBe(false)
    expect(DEFAULT_INTRAOP_AUTOMATION.dantroleneVialsMg).toEqual([20])
    // A missing group takes its default (on); an unreadable value reads as off.
    expect(parseIntraopAutomation(null).groups.treatmentSuggestions).toBe(true)
    expect(parseIntraopAutomation({ enabled: true, groups: {} }).groups.treatmentSuggestions).toBe(true)
    expect(parseIntraopAutomation({ enabled: true, groups: { treatmentSuggestions: "yes" } }).groups.treatmentSuggestions).toBe(false)
  })

  it("read each group the hospital switched on, and only the vial sizes on offer", () => {
    const settings = parseIntraopAutomation({ enabled: true, groups: { treatmentSuggestions: true, timers: true, labQuestions: false }, dantroleneVialMg: 250 })
    expect(settings.groups).toMatchObject({ treatmentSuggestions: true, timers: true, labQuestions: false })
    expect(settings.dantroleneVialsMg).toEqual([250])
    expect(parseIntraopAutomation({ dantroleneVialMg: 30 }).dantroleneVialsMg).toEqual([20])
    // The stocked sizes: a mix, sorted, without repeats or sizes that do not exist.
    expect(parseIntraopAutomation({ dantroleneVialsMg: [250, 20, 20, 30] }).dantroleneVialsMg).toEqual([20, 250])
    expect(parseIntraopAutomation({ dantroleneVialsMg: [] }).dantroleneVialsMg).toEqual([20])
  })

  it("run only when the master switch and the group are on, and the clinician has not turned it off", () => {
    const settings = parseIntraopAutomation({ enabled: true, groups: { reverseQuestions: true, labQuestions: false } })
    expect(automationGroupEnabled(settings, "reverseQuestions")).toBe(true)
    expect(automationGroupEnabled(settings, "reverseQuestions", {})).toBe(true)
    expect(automationGroupEnabled(settings, "reverseQuestions", { reverseQuestions: false })).toBe(false)
    // A clinician cannot turn on what the hospital has off.
    expect(automationGroupEnabled(settings, "labQuestions", { labQuestions: true })).toBe(false)
    // The master switch off silences every group.
    expect(automationGroupEnabled({ ...settings, enabled: false }, "reverseQuestions")).toBe(false)
    expect(automationGroupEnabled(null, "reverseQuestions")).toBe(false)
  })

  it("let a clinician turn the 10.1.0 vitals questions off for themselves too", () => {
    const settings = parseIntraopAutomation({ enabled: true, vitalQuestions: { enabled: true } })
    expect(vitalQuestionsEnabled(settings)).toBe(true)
    expect(vitalQuestionsEnabled(settings, { vitalQuestions: false })).toBe(false)
    expect(vitalQuestionAutomationEnabled(settings, undefined, "hypotension")).toBe(true)
    expect(vitalQuestionAutomationEnabled(settings, { automationLines: { "vital:hypotension": false } }, "hypotension")).toBe(false)
    expect(vitalQuestionAutomationEnabled(parseIntraopAutomation({ enabled: true, vitalQuestions: { enabled: true }, disabled: ["vital:tachycardia"] }), undefined, "tachycardia")).toBe(false)
  })

  it("keeps every line on by default, context links included, until the clinician turns one off", () => {
    expect(personalAutomationDefaultEnabled("reminder:ponv")).toBe(true)
    expect(personalAutomationDefaultEnabled("context:induction-agent-context")).toBe(true)
    expect(personalAutomationEnabled(undefined, "reminder:ponv")).toBe(true)
    expect(personalAutomationEnabled(undefined, "context:induction-agent-context")).toBe(true)
    expect(personalAutomationEnabled({ automationLines: { "context:induction-agent-context": false } }, "context:induction-agent-context")).toBe(false)
    expect(personalAutomationEnabled({ automationLines: { "context:induction-agent-context": true } }, "context:induction-agent-context")).toBe(true)
    expect(personalAutomationEnabled({ automationLines: { "reminder:ponv": false } }, "reminder:ponv")).toBe(false)
  })

  it("round-trips individual automation lines with preference patches", () => {
    const preferences = normalizeClinicalPreferences({ automationLines: { "context:induction-agent-context": true, bad: "yes" } })
    expect(preferences.automationLines).toEqual({ "context:induction-agent-context": true })
    const next = applyClinicalPreferencesPatch(preferences, { automationLines: { "context:induction-agent-context": false, "context:tci-technique": true } })
    expect(next.automationLines).toEqual({ "context:induction-agent-context": false, "context:tci-technique": true })
  })
})

describe("clinician automation switches and knob skin (10.2.0)", () => {
  it("default to everything on and knob A", () => {
    expect(DEFAULT_CLINICAL_PREFERENCES.automationGroups).toEqual({})
    expect(DEFAULT_CLINICAL_PREFERENCES.energyKnobSkin).toBe("A")
    expect(normalizeClinicalPreferences({}).energyKnobSkin).toBe("A")
  })

  it("keep only the groups switched off", () => {
    const preferences = normalizeClinicalPreferences({ automationGroups: { timers: false, reminders: true, unknown: false } })
    expect(preferences.automationGroups).toEqual({ timers: false })
  })

  it("turn a group back on through a patch", () => {
    const off = applyClinicalPreferencesPatch({}, { automationGroups: { timers: false, labQuestions: false } })
    expect(off.automationGroups).toEqual({ timers: false, labQuestions: false })
    const back = applyClinicalPreferencesPatch(off, { automationGroups: { timers: true } })
    expect(back.automationGroups).toEqual({ labQuestions: false })
  })

  it("accepts only the three knob skins", () => {
    expect(normalizeClinicalPreferences({ energyKnobSkin: "C" }).energyKnobSkin).toBe("C")
    expect(normalizeClinicalPreferences({ energyKnobSkin: "D" }).energyKnobSkin).toBe("A")
  })

  it("opens on Smart selection unless the clinician picked the legacy Airway tab", () => {
    expect(DEFAULT_CLINICAL_PREFERENCES.airwayScreen).toBe("smart")
    expect(normalizeClinicalPreferences({}).airwayScreen).toBe("smart")
    expect(normalizeClinicalPreferences({ airwayScreen: "legacy" }).airwayScreen).toBe("legacy")
    expect(normalizeClinicalPreferences({ airwayScreen: "fancy" }).airwayScreen).toBe("smart")
    expect(mergeClinicalPreferences({ airwayScreen: "legacy" }, { airwayScreen: "smart" }).airwayScreen).toBe("legacy")
    expect(mergeClinicalPreferences({}, { airwayScreen: "legacy" }).airwayScreen).toBe("legacy")
    expect(applyClinicalPreferencesPatch({ airwayScreen: "smart" }, { airwayScreen: "legacy" }).airwayScreen).toBe("legacy")
  })

  it("opens on Smart selection for the Vascular access tab unless the clinician picked the legacy one", () => {
    expect(DEFAULT_CLINICAL_PREFERENCES.vascularScreen).toBe("smart")
    expect(normalizeClinicalPreferences({}).vascularScreen).toBe("smart")
    expect(normalizeClinicalPreferences({ vascularScreen: "legacy" }).vascularScreen).toBe("legacy")
    expect(normalizeClinicalPreferences({ vascularScreen: "x" }).vascularScreen).toBe("smart")
    expect(mergeClinicalPreferences({ vascularScreen: "legacy" }, { vascularScreen: "smart" }).vascularScreen).toBe("legacy")
    expect(applyClinicalPreferencesPatch({ vascularScreen: "smart" }, { vascularScreen: "legacy" }).vascularScreen).toBe("legacy")
    // The two tabs are chosen independently.
    expect(normalizeClinicalPreferences({ airwayScreen: "legacy" }).vascularScreen).toBe("smart")
  })

  it("opens on the Hybrid fluid summary unless the clinician picked Legacy", () => {
    expect(DEFAULT_CLINICAL_PREFERENCES.fluidsScreen).toBe("smart")
    expect(normalizeClinicalPreferences({}).fluidsScreen).toBe("smart")
    expect(normalizeClinicalPreferences({ fluidsScreen: "legacy" }).fluidsScreen).toBe("legacy")
    expect(normalizeClinicalPreferences({ fluidsScreen: "fancy" }).fluidsScreen).toBe("smart")
    expect(mergeClinicalPreferences({ fluidsScreen: "legacy" }, { fluidsScreen: "smart" }).fluidsScreen).toBe("legacy")
    expect(applyClinicalPreferencesPatch({ fluidsScreen: "smart" }, { fluidsScreen: "legacy" }).fluidsScreen).toBe("legacy")
    expect(combineClinicalPreferencesPatches({ fluidsScreen: "smart" }, { fluidsScreen: "legacy" })).toEqual({ fluidsScreen: "legacy" })
  })

  it("opens on the Timeline stream unless the clinician picked Legacy", () => {
    expect(DEFAULT_CLINICAL_PREFERENCES.eventLogScreen).toBe("smart")
    expect(normalizeClinicalPreferences({}).eventLogScreen).toBe("smart")
    expect(normalizeClinicalPreferences({ eventLogScreen: "legacy" }).eventLogScreen).toBe("legacy")
    expect(normalizeClinicalPreferences({ eventLogScreen: "fancy" }).eventLogScreen).toBe("smart")
    expect(mergeClinicalPreferences({ eventLogScreen: "legacy" }, { eventLogScreen: "smart" }).eventLogScreen).toBe("legacy")
    expect(applyClinicalPreferencesPatch({ eventLogScreen: "smart" }, { eventLogScreen: "legacy" }).eventLogScreen).toBe("legacy")
  })

  it("keeps case layout and timetable choices account-wide without losing sibling fields", () => {
    const local = normalizeClinicalPreferences({
      caseLayout: { sidebar: false, preop: "tabs" },
      timetableLayout: "scroll",
      vitalsChartExpanded: false,
    })
    expect(local.caseLayout).toEqual({ sidebar: false, preop: "tabs", intraop: "scroll", postop: "scroll" })
    const merged = mergeClinicalPreferences(
      { caseLayout: { sidebar: true, intraop: "tabs" }, timetableLayout: "expand" },
      { caseLayout: { sidebar: false, preop: "tabs" }, timetableLayout: "scroll", vitalsChartExpanded: false },
    )
    expect(merged.caseLayout).toEqual({ sidebar: true, preop: "tabs", intraop: "tabs", postop: "scroll" })
    expect(merged.timetableLayout).toBe("expand")
    expect(merged.vitalsChartExpanded).toBe(false)
    expect(applyClinicalPreferencesPatch(merged, { caseLayout: { postop: "tabs" } }).caseLayout.postop).toBe("tabs")
    expect(combineClinicalPreferencesPatches(
      { caseLayout: { sidebar: false } },
      { caseLayout: { intraop: "tabs" }, vitalsChartExpanded: false },
    )).toEqual({ caseLayout: { sidebar: false, intraop: "tabs" }, vitalsChartExpanded: false })
  })

  it("lets the server win over the device and combines patches in order", () => {
    const merged = mergeClinicalPreferences({ energyKnobSkin: "B", automationGroups: { timers: false } }, { energyKnobSkin: "C", automationGroups: { labQuestions: false } })
    expect(merged.energyKnobSkin).toBe("B")
    expect(merged.automationGroups).toEqual({ timers: false, labQuestions: false })
    expect(combineClinicalPreferencesPatches({ energyKnobSkin: "B" }, { energyKnobSkin: "C", automationGroups: { reminders: false } }))
      .toEqual({ energyKnobSkin: "C", automationGroups: { reminders: false } })
  })
})
