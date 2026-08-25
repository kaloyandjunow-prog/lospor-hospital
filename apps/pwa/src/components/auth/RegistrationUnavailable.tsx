import { KeyboardAvoidingView, Platform, Text, TouchableOpacity, View } from "react-native"
import { Stack, useRouter } from "expo-router"
import { AuthBackdrop, AuthBrand } from "@/components/AuthBrand"
import { usePreferences } from "@/lib/preferences-context"

/**
 * What a clinician sees instead of the registration form when this deployment
 * does not create accounts here — either because the appliance leaves that to
 * an administrator, or because its sign-in contract could not be verified and
 * the app has failed closed.
 *
 * The reason is passed in rather than decided here: the screen states it and
 * offers the way back, and nothing about which case applies belongs in the
 * presentation.
 */
export function RegistrationUnavailableScreen({ instructions }: { instructions: string }) {
  const router = useRouter()
  const { t } = usePreferences()

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <KeyboardAvoidingView
        className="flex-1 bg-[#111111]"
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <AuthBackdrop />
        <View style={{ flex: 1, justifyContent: "center", paddingHorizontal: 24 }}>
          <View style={{ marginBottom: 30 }}>
            <AuthBrand />
          </View>
          <Text
            accessibilityRole="header"
            style={{ color: "#f8fafc", fontSize: 24, fontWeight: "900", marginBottom: 8 }}
          >
            {t("registrationUnavailable")}
          </Text>
          <Text style={{ color: "#94a3b8", fontSize: 14, lineHeight: 21 }}>
            {instructions}
          </Text>
          <TouchableOpacity
            accessibilityRole="link"
            className="mt-7 items-center"
            onPress={() => router.replace("/(auth)/login")}
          >
            <Text className="text-blue-400 text-sm font-extrabold">{t("backToLogin")}</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </>
  )
}
