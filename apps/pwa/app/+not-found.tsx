import { Link, Stack } from "expo-router"
import { View, Text } from "react-native"
import { colors } from "@/theme/colors"

export default function NotFoundScreen() {
  return (
    <>
      <Stack.Screen options={{ title: "Not found" }} />
      <View style={{ flex: 1, backgroundColor: colors.background, justifyContent: "center", alignItems: "center", paddingHorizontal: 24 }}>
        <Text style={{ color: colors.textPrimary, fontSize: 20, fontWeight: "900", marginBottom: 8 }}>Page not found</Text>
        <Text style={{ color: colors.textMuted, fontSize: 14, textAlign: "center", marginBottom: 24 }}>
          This screen doesn't exist.
        </Text>
        <Link href="/(app)" style={{ color: colors.primary, fontSize: 16, fontWeight: "800" }}>
          Go to dashboard
        </Link>
      </View>
    </>
  )
}
