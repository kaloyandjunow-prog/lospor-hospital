import { Switch } from "react-native"
import { BULGARIAN_NAME_SWITCH_KEYS, type BulgarianNameSwitches } from "@lospor/core/display"
import { usePreferences, type TranslationKey } from "@/lib/preferences-context"
import { Card, SettingsRow } from "@/components/ui"
import { colors } from "@/theme/colors"

const LABEL: Record<keyof BulgarianNameSwitches, TranslationKey> = {
  premed: "bulgarianNamesPremed",
  drugs: "bulgarianNamesDrugs",
  infusions: "bulgarianNamesInfusions",
  agents: "bulgarianNamesAgents",
  fluids: "bulgarianNamesFluids",
}

/**
 * Settings → UI: one switch per catalogue for Bulgarian names. Saved with the
 * account's clinical preferences, so the web follows; display only.
 */
export function BulgarianNamesCard() {
  const { t, bulgarianNames, setBulgarianNames } = usePreferences()
  return (
    <Card>
      <SettingsRow label={t("bulgarianNames")} subtitle={t("bulgarianNamesSub")} />
      {BULGARIAN_NAME_SWITCH_KEYS.map((key, index) => (
        <SettingsRow
          key={key}
          label={t(LABEL[key])}
          last={index === BULGARIAN_NAME_SWITCH_KEYS.length - 1}
          rightElement={
            <Switch
              testID={`bulgarian-names-${key}`}
              value={bulgarianNames[key]}
              onValueChange={value => void setBulgarianNames({ [key]: value })}
              trackColor={{ false: colors.border, true: colors.primarySoft }}
              thumbColor={bulgarianNames[key] ? colors.primary : colors.textMuted}
            />
          }
        />
      ))}
    </Card>
  )
}
