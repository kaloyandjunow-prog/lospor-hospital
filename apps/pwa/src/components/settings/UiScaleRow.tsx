import { useEffect, useState } from "react"
import { Text, TouchableOpacity, View } from "react-native"
import { usePreferences } from "@/lib/preferences-context"
import { VitalStepper } from "@/components/VitalStepper"
import { colors } from "@/theme/colors"
import { loadUiScale, saveUiScale, uiScaleSupported, UI_SCALE_DEFAULT, UI_SCALE_MAX, UI_SCALE_MIN, UI_SCALE_STEP } from "@/lib/ui-scale"

/**
 * Display size (10.0.0): a slider with - and +, on the web build. The phone
 * app follows the operating system's text size, so it shows nothing.
 */
export function UiScaleRow() {
  const { t } = usePreferences()
  const [scale, setScale] = useState(UI_SCALE_DEFAULT)
  useEffect(() => { void loadUiScale().then(setScale) }, [])
  if (!uiScaleSupported) return null
  const change = (next: number | null) => { void saveUiScale(next ?? UI_SCALE_DEFAULT).then(setScale) }
  return (
    <View testID="ui-scale-row" style={{ paddingHorizontal: 14, paddingVertical: 12, borderTopWidth: 1, borderTopColor: colors.border }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.textPrimary, fontSize: 15, fontWeight: "700" }}>{t("uiScale")}</Text>
          <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }}>{t("uiScaleDesc")}</Text>
        </View>
        <TouchableOpacity
          accessibilityRole="button"
          disabled={scale === UI_SCALE_DEFAULT}
          onPress={() => change(UI_SCALE_DEFAULT)}
          style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6, opacity: scale === UI_SCALE_DEFAULT ? 0.4 : 1 }}
        >
          <Text style={{ color: colors.textSecondary, fontSize: 12, fontWeight: "800" }}>{t("uiScaleReset")}</Text>
        </TouchableOpacity>
      </View>
      <VitalStepper value={scale} onChange={change} min={UI_SCALE_MIN} max={UI_SCALE_MAX} step={UI_SCALE_STEP} unit="%" />
    </View>
  )
}
