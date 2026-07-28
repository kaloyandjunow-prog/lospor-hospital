import { Stack } from "expo-router"
import { colors } from "@/theme/colors"
import { usePreferences } from "@/lib/preferences-context"

export default function AppLayout() {
  usePreferences()
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.textPrimary,
        headerTitleStyle: { fontWeight: "600" },
        contentStyle: { backgroundColor: colors.background },
      }}
    />
  )
}
