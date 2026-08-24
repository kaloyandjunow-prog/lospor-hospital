import { Link, Stack } from "expo-router"
import { View, Text } from "react-native"
import { colors } from "@/theme/colors"
import { usePreferences } from "@/lib/preferences-context"

export default function NotFoundScreen() {
  const { t } = usePreferences()
  return (
    <>
      <Stack.Screen options={{ title: t("notFoundTitle") }} />
      <View style={{ flex: 1, backgroundColor: colors.background, justifyContent: "center", alignItems: "center", paddingHorizontal: 24 }}>
        <Text style={{ color: colors.textPrimary, fontSize: 20, fontWeight: "900", marginBottom: 8 }}>{t("pageNotFound")}</Text>
        <Text style={{ color: colors.textMuted, fontSize: 14, textAlign: "center", marginBottom: 24 }}>
          {t("screenDoesNotExist")}
        </Text>
        <Link href="/(app)" style={{ color: colors.primary, fontSize: 16, fontWeight: "800" }}>
          {t("goToDashboard")}
        </Link>
      </View>
    </>
  )
}
