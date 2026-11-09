import { Fragment } from "react"
import { Pressable, Text } from "react-native"
import { AUTOMATION_GROUPS, personalAutomationDefaultEnabled, vitalQuestionsEnabled, type UserAutomationSwitch } from "@lospor/core/intraop-automation"
import { AUTOMATIONS, successionAutomationDef } from "@lospor/core/intraop-suggestions"
import { usePreferences, type ClinicalStringKey } from "@/lib/preferences-context"
import { useIntraopAutomation } from "@/lib/use-intraop-automation"
import { BooleanSwitch, Card, SettingsRow } from "@/components/ui"
import { colors } from "@/theme/colors"

const KEYS: Record<UserAutomationSwitch, [ClinicalStringKey, ClinicalStringKey]> = {
  vitalQuestions: ["agVitalQuestions", "agVitalQuestionsDesc"],
  treatmentSuggestions: ["agTreatmentSuggestions", "agTreatmentSuggestionsDesc"],
  reverseQuestions: ["agReverseQuestions", "agReverseQuestionsDesc"],
  readingQuestions: ["agReadingQuestions", "agReadingQuestionsDesc"],
  labQuestions: ["agLabQuestions", "agLabQuestionsDesc"],
  reminders: ["agReminders", "agRemindersDesc"],
  timers: ["agTimers", "agTimersDesc"],
}

/**
 * The SPS automations a clinician keeps (10.2.0). Only what the
 * hospital switched on in Status is listed; each is on until turned off here.
 * The whole set is saved each time, so one switch never clears another.
 */
export function AutomationGroupsCard() {
  const { tc, language, automationGroups, setAutomationGroups, automationLines, setAutomationLines } = usePreferences()
  const automationLineOverrides = automationLines ?? {}
  const { settings, ready, unavailable, reload, succession = [] } = useIntraopAutomation()
  if (unavailable) {
    return (
      <Card>
        <SettingsRow label={tc("agUnavailable")} subtitle={tc("agUnavailableDesc")}
          rightElement={<Pressable accessibilityRole="button" onPress={() => void reload()}><Text style={{ color: colors.primary, fontWeight: "800" }}>{tc("agRetry")}</Text></Pressable>} />
      </Card>
    )
  }
  if (ready === false) return null
  if (!settings.enabled) return null
  const offered: UserAutomationSwitch[] = [
    ...(vitalQuestionsEnabled(settings) ? ["vitalQuestions" as const] : []),
    ...AUTOMATION_GROUPS.filter(group => settings.groups[group]),
  ]
  if (offered.length === 0) return null
  const lineCatalog = [...new Map([...AUTOMATIONS, ...succession.map(successionAutomationDef)].map(item => [item.id, item] as const)).values()]
  const offeredLines = lineCatalog.filter(item => offered.includes(item.group) && !settings.disabled.includes(item.id))
  const labelOf = (item: typeof offeredLines[number]) => language === "bg" ? item.bg : item.en
  const detailOf = (item: typeof offeredLines[number]) => language === "bg" ? item.detailBg : item.detailEn
  return (
    <Card>
      <SettingsRow label={tc("agTitle")} />
      {offered.map((key, index) => {
        const on = automationGroups[key] !== false
        return (
          <SettingsRow key={key} label={tc(KEYS[key][0])} subtitle={tc(KEYS[key][1])} last={index === offered.length - 1 && offeredLines.length === 0}
            rightElement={
              <BooleanSwitch testID={`setting-automation-${key}`} value={on}
                accessibilityLabel={tc(KEYS[key][0])}
                onValueChange={value => { void setAutomationGroups({ ...automationGroups, [key]: value }) }}
                trackColor={{ false: colors.border, true: colors.primarySoft }} thumbColor={on ? colors.primary : colors.textMuted} />
            } />
        )
      })}
      {offeredLines.length > 0 && <>
        <SettingsRow label={tc("agIndividualTitle")} subtitle={tc("agIndividualDesc")} />
        {offeredLines.map((line, index) => {
          const on = automationLineOverrides[line.id] ?? personalAutomationDefaultEnabled(line.id)
          const contextHeader = line.id.startsWith("context:") && !offeredLines[index - 1]?.id.startsWith("context:")
          const vitalHeader = line.group === "vitalQuestions" && offeredLines[index - 1]?.group !== "vitalQuestions"
          return <Fragment key={line.id}>
            {contextHeader && <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: "800", letterSpacing: 1, marginTop: 12, marginBottom: 4 }}>{tc("agContextLinksTitle")}</Text>}
            {vitalHeader && <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: "800", letterSpacing: 1, marginTop: 12, marginBottom: 4 }}>{tc("agVitalLinesTitle")}</Text>}
            <SettingsRow label={labelOf(line)} subtitle={detailOf(line)} last={index === offeredLines.length - 1}
              rightElement={
                <BooleanSwitch testID={`setting-automation-line-${line.id}`} value={on}
                  accessibilityLabel={labelOf(line)}
                  onValueChange={value => { void setAutomationLines({ ...automationLineOverrides, [line.id]: value }) }}
                  trackColor={{ false: colors.border, true: colors.primarySoft }} thumbColor={on ? colors.primary : colors.textMuted} />
              } />
          </Fragment>
        })}
      </>}
    </Card>
  )
}
