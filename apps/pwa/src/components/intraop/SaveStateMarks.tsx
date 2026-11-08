import { Text } from "react-native"
import { colors } from "@/theme/colors"
import type { ItemSaveState } from "@lospor/core/intraop-save-state"
import { usePreferences } from "@/lib/preferences-context"

/**
 * Not yet saved, saving, or refused (9.13.0). A clock and words, never a
 * dashed outline: dashes already mean planned on this chart.
 */
export function SaveStateBadge({ state }: { state: ItemSaveState }) {
  const { tc } = usePreferences()
  const color = state === "refused" ? colors.danger : colors.warning
  const label = state === "refused" ? tc("refusedShort") : state === "sending" ? tc("sendingShort") : tc("queuedShort")
  return (
    <Text testID={`row-save-${state}`} style={{ color, fontSize: 9, fontWeight: "800", lineHeight: 12 }}>
      {state === "refused" ? "✕" : "◷"} {label}
    </Text>
  )
}

export function SaveStateDot({ state }: { state: ItemSaveState }) {
  return (
    <Text testID={`item-save-${state}`} style={{ color: state === "refused" ? colors.danger : colors.warning, fontSize: 12, marginRight: 6 }}>
      {state === "refused" ? "✕" : "◷"}
    </Text>
  )
}
