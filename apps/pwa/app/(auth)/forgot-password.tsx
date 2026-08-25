import { useState } from "react"
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native"
import { useRouter } from "expo-router"
import { AuthBackdrop, AuthBrand } from "@/components/AuthBrand"
import { requestPasswordReset } from "@/lib/api"
import { notify } from "@/lib/notify"
import { usePreferences } from "@/lib/preferences-context"
import { useAuthenticationCapabilities } from "@/lib/deployment-capabilities"
import { colors, withAlpha } from "@/theme/colors"

function EmailPasswordRecoveryScreen() {
  const router = useRouter()
  const { t } = usePreferences()
  const [email, setEmail] = useState("")
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)

  async function submit() {
    if (!email.trim()) return
    setLoading(true)
    try {
      await requestPasswordReset(email.trim().toLowerCase())
      setSent(true)
    } catch {
      notify(t("resetPasswordFailed"), t("tryAgain"))
    } finally {
      setLoading(false)
    }
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.background }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <AuthBackdrop />
      <View style={{ flex: 1, justifyContent: "center", paddingHorizontal: 24 }}>
        <View style={{ marginBottom: 30 }}>
          <AuthBrand />
        </View>

        <Text style={{ color: colors.textPrimary, fontSize: 24, fontWeight: "900", marginBottom: 8 }}>
          {t("resetPassword")}
        </Text>
        <Text style={{ color: colors.textSecondary, fontSize: 14, marginBottom: 24 }}>
          {t("resetPasswordInstructions")}
        </Text>

        {sent ? (
          <Text style={{ color: colors.success, fontSize: 15, lineHeight: 22, marginBottom: 22 }}>
            {t("resetPasswordSent")}
          </Text>
        ) : (
          <>
            <Text style={{ color: colors.textSecondary, fontSize: 14, marginBottom: 6 }}>{t("email")}</Text>
            <TextInput
              accessibilityLabel={t("email")}
              style={{ backgroundColor: colors.surface, color: colors.textPrimary, borderRadius: 14, borderCurve: "continuous", paddingHorizontal: 14, paddingVertical: 13, marginBottom: 18, fontSize: 16, borderWidth: 1, borderColor: colors.border }}
              placeholder="you@hospital.org"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="none"
              keyboardType="email-address"
              autoComplete="email"
              value={email}
              onChangeText={setEmail}
              onSubmitEditing={submit}
            />

            <TouchableOpacity
              accessibilityRole="button"
              accessibilityState={{ disabled: loading || !email.trim() }}
              style={{ backgroundColor: colors.primary, borderRadius: 12, borderCurve: "continuous", paddingVertical: 15, alignItems: "center", borderWidth: 1, borderColor: withAlpha(colors.primary, "99") }}
              onPress={submit}
              disabled={loading || !email.trim()}
            >
              {loading
                ? <ActivityIndicator color="#fff" />
                : <Text style={{ color: colors.background, fontWeight: "900", fontSize: 16 }}>{t("sendResetLink")}</Text>
              }
            </TouchableOpacity>
          </>
        )}

        <TouchableOpacity
          accessibilityRole="link"
          style={{ marginTop: 28, alignItems: "center" }}
          onPress={() => router.replace("/(auth)/login")}
        >
          <Text style={{ color: colors.primary, fontSize: 14, fontWeight: "800" }}>{t("backToLogin")}</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  )
}

function RecoveryPolicyScreen({
  instructions,
  title,
}: {
  instructions: string
  title: string
}) {
  const router = useRouter()
  const { t } = usePreferences()

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.background }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <AuthBackdrop />
      <View style={{ flex: 1, justifyContent: "center", paddingHorizontal: 24 }}>
        <View style={{ marginBottom: 30 }}>
          <AuthBrand />
        </View>
        <Text
          accessibilityRole="header"
          style={{ color: colors.textPrimary, fontSize: 24, fontWeight: "900", marginBottom: 8 }}
        >
          {title}
        </Text>
        <Text style={{ color: colors.textSecondary, fontSize: 14, lineHeight: 21 }}>
          {instructions}
        </Text>
        <TouchableOpacity
          accessibilityRole="link"
          style={{ marginTop: 28, alignItems: "center" }}
          onPress={() => router.replace("/(auth)/login")}
        >
          <Text style={{ color: colors.primary, fontSize: 14, fontWeight: "800" }}>
            {t("backToLogin")}
          </Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  )
}

export default function ForgotPasswordScreen() {
  const authentication = useAuthenticationCapabilities()
  const { t } = usePreferences()

  if (authentication.status === "INVALID_CONTRACT") {
    return (
      <RecoveryPolicyScreen
        title={t("passwordRecoveryUnavailable")}
        instructions={t("authConfigurationUnavailable")}
      />
    )
  }
  if (authentication.passwordRecovery === "EMAIL") {
    return <EmailPasswordRecoveryScreen />
  }
  if (authentication.passwordRecovery === "ADMINISTRATOR") {
    return (
      <RecoveryPolicyScreen
        title={t("administratorRecovery")}
        instructions={t("administratorRecoveryInstructions")}
      />
    )
  }
  return (
    <RecoveryPolicyScreen
      title={t("passwordRecoveryUnavailable")}
      instructions={t("passwordRecoveryUnavailableInstructions")}
    />
  )
}

