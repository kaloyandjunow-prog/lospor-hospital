import { useEffect, useState } from "react"
import {
  View, Text, TextInput, TouchableOpacity,
  KeyboardAvoidingView, Platform, ActivityIndicator, ScrollView,
} from "react-native"
import { useRouter } from "expo-router"
import { useAuth } from "@/lib/auth-context"
import { notify } from "@/lib/notify"
import { colors, withAlpha } from "@/theme/colors"
import { AuthBackdrop, AuthBrand } from "@/components/AuthBrand"
import { usePreferences } from "@/lib/preferences-context"
import { useAuthenticationCapabilities } from "@/lib/deployment-capabilities"
import { isValidHospitalUsername } from "@/lib/login-identifier"

export default function LoginScreen() {
  const { login } = useAuth()
  const { language, selectLoginLanguage, completeLoginLocaleSync, t } = usePreferences()
  const authentication = useAuthenticationCapabilities()
  const router = useRouter()
  const [identifier, setIdentifier] = useState("")
  const [password, setPassword] = useState("")
  const [loading, setLoading]   = useState(false)

  useEffect(() => {
    setIdentifier("")
    setPassword("")
  }, [authentication.loginIdentifier, authentication.status])

  async function handleLogin() {
    const loginIdentifier = authentication.loginIdentifier
    if (authentication.status === "INVALID_CONTRACT" || !loginIdentifier || !password) return
    if (loginIdentifier === "EMAIL" && !identifier.trim()) return
    if (loginIdentifier === "USERNAME" && !isValidHospitalUsername(identifier)) {
      notify(t("loginFailed"), t("invalidUsername"))
      return
    }
    setLoading(true)
    try {
      await login({ loginIdentifier, value: identifier }, password)
      await completeLoginLocaleSync()
    } catch (err) {
      const message = err instanceof Error ? err.message : t("invalidCredentials")
      notify(t("loginFailed"), message)
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
      <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: "center", paddingHorizontal: 24, paddingVertical: 24 }} keyboardShouldPersistTaps="handled">
        <View style={{ marginBottom: 30 }}>
          <AuthBrand />
        </View>

        <View style={{ flexDirection: "row", justifyContent: "center", gap: 8, marginBottom: 20 }}>
          {(["bg", "en"] as const).map(value => <TouchableOpacity
            key={value}
            accessibilityRole="button"
            accessibilityState={{ selected: language === value }}
            onPress={() => void selectLoginLanguage(value)}
            style={{ borderWidth: 1, borderColor: language === value ? colors.primary : colors.border, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 8 }}
          ><Text style={{ color: language === value ? colors.primary : colors.textSecondary, fontWeight: "800" }}>{value === "bg" ? "Български" : "English"}</Text></TouchableOpacity>)}
        </View>

        {authentication.status === "INVALID_CONTRACT" || !authentication.loginIdentifier ? <Text accessibilityRole="alert" style={{ color: colors.danger, textAlign: "center", marginBottom: 18 }}>{t("authenticationUnavailable")}</Text> : <>
        <Text style={{ color: colors.textSecondary, fontSize: 14, marginBottom: 6 }}>{authentication.loginIdentifier === "USERNAME" ? t("username") : t("email")}</Text>
        <TextInput
          accessibilityLabel={authentication.loginIdentifier === "USERNAME" ? t("username") : t("email")}
          style={{ backgroundColor: colors.surface, color: colors.textPrimary, borderRadius: 14, borderCurve: "continuous", paddingHorizontal: 14, paddingVertical: 13, marginBottom: 16, fontSize: 16, borderWidth: 1, borderColor: colors.border }}
          placeholder={authentication.loginIdentifier === "USERNAME" ? "ivan.petrov" : "you@hospital.org"}
          placeholderTextColor={colors.textMuted}
          autoCapitalize="none"
          keyboardType={authentication.loginIdentifier === "USERNAME" ? "default" : "email-address"}
          autoComplete="username"
          value={identifier}
          onChangeText={setIdentifier}
        />

        {authentication.loginIdentifier === "USERNAME" ? <View style={{ marginBottom: 16, gap: 4 }}>
          <Text style={{ color: colors.textMuted, fontSize: 12, lineHeight: 17 }}>{t("usernameRequirements")}</Text>
          <Text style={{ color: colors.textMuted, fontSize: 12, lineHeight: 17 }}>{t("usernameCasePolicy")}</Text>
          <Text style={{ color: colors.textMuted, fontSize: 12, lineHeight: 17 }}>{t("usernameDisplayNamePolicy")}</Text>
        </View> : null}

        <Text style={{ color: colors.textSecondary, fontSize: 14, marginBottom: 6 }}>{t("password")}</Text>
        <TextInput
          style={{ backgroundColor: colors.surface, color: colors.textPrimary, borderRadius: 14, borderCurve: "continuous", paddingHorizontal: 14, paddingVertical: 13, marginBottom: 22, fontSize: 16, borderWidth: 1, borderColor: colors.border }}
          placeholder="••••••••"
          placeholderTextColor={colors.textMuted}
          secureTextEntry
          value={password}
          onChangeText={setPassword}
          onSubmitEditing={handleLogin}
        />

        <TouchableOpacity
          style={{ backgroundColor: colors.primary, borderRadius: 12, borderCurve: "continuous", paddingVertical: 15, alignItems: "center", borderWidth: 1, borderColor: withAlpha(colors.primary, "99") }}
          onPress={handleLogin}
          disabled={loading}
        >
          {loading
            ? <ActivityIndicator color="#fff" />
            : <Text style={{ color: colors.background, fontWeight: "900", fontSize: 16 }}>{t("signIn")}</Text>
          }
        </TouchableOpacity>

        {authentication.passwordRecovery !== "UNAVAILABLE" ? <TouchableOpacity
          style={{ marginTop: 16, alignItems: "center" }}
          onPress={() => router.push("/(auth)/forgot-password")}
        >
          <Text style={{ color: colors.primary, fontSize: 14, fontWeight: "800" }}>{authentication.passwordRecovery === "ADMINISTRATOR" ? t("accountAccessHelp") : t("forgotPassword")}</Text>
        </TouchableOpacity> : null}

        <Text
          style={{ marginTop: 20, textAlign: "center", color: colors.textMuted, fontSize: 14 }}
        >
          {authentication.selfRegistration ? t("registrationAvailable") : t("accountsCreatedByAdministrator")}
        </Text>
        </>}
      </ScrollView>
    </KeyboardAvoidingView>
  )
}
