import { useEffect, useState } from "react"
import {
  View, Text, TextInput, TouchableOpacity,
  KeyboardAvoidingView, Platform, ActivityIndicator, ScrollView,
} from "react-native"
import { useRouter } from "expo-router"
import { useAuth } from "@/lib/auth-context"
import { ApiError } from "@/lib/api"
import { notify } from "@/lib/notify"
import { usePreferences } from "@/lib/preferences-context"
import { colors, withAlpha } from "@/theme/colors"
import { AuthBackdrop, AuthBrand } from "@/components/AuthBrand"
import { AdministratorMfaStep } from "@/components/auth/AdministratorMfaStep"
import type { AdministratorMfaChallenge } from "@/lib/administrator-mfa"
import { useAuthenticationCapabilities } from "@/lib/deployment-capabilities"
import { isValidHospitalUsername } from "@/lib/login-identifier"

export default function LoginScreen() {
  const {
    login,
    completeAdministratorMfa,
    finishAdministratorMfaLogin,
  } = useAuth()
  const {
    completeLoginLocaleSync,
    language,
    selectLoginLanguage,
    t,
  } = usePreferences()
  const authentication = useAuthenticationCapabilities()
  const router = useRouter()
  const [identifier, setIdentifier] = useState("")
  const [password, setPassword] = useState("")
  const [loading, setLoading]   = useState(false)
  const [mfaChallenge, setMfaChallenge] = useState<AdministratorMfaChallenge | null>(null)

  useEffect(() => {
    // A live Status policy change must not reinterpret an email already typed
    // as a username, or reinterpret a username as an email.
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
      const credential = loginIdentifier === "USERNAME"
        ? { loginIdentifier: "USERNAME" as const, value: identifier }
        : { loginIdentifier: "EMAIL" as const, value: identifier }
      const result = await login(credential, password, language)
      if (result.kind === "mfa") {
        setPassword("")
        setMfaChallenge(result.challenge)
        return
      }
      await completeLoginLocaleSync()
    } catch (err) {
      const message = err instanceof ApiError && err.code === "CLINICAL_APP_FORBIDDEN"
        ? t("clinicalAppForbidden")
        : err instanceof ApiError && err.code === "AUTH_RESPONSE_INVALID"
          ? t("authResponseInvalid")
          : err instanceof ApiError && err.code === "NETWORK"
            ? t("networkCheckConnection")
          : loginIdentifier === "USERNAME"
            ? t("invalidUsernameCredentials")
            : t("invalidCredentials")
      notify(t("loginFailed"), message)
    } finally {
      setLoading(false)
    }
  }

  async function finishMfaLogin() {
    await completeLoginLocaleSync()
    finishAdministratorMfaLogin()
  }

  const authenticationReady = authentication.status !== "INVALID_CONTRACT"
    && authentication.loginIdentifier !== null
  const usernameMode = authentication.loginIdentifier === "USERNAME"
  const recoveryVisible = authenticationReady
    && authentication.passwordRecovery !== "UNAVAILABLE"

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.background }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <AuthBackdrop />
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ flexGrow: 1, justifyContent: "center", paddingHorizontal: 24, paddingVertical: 32 }}
      >
        <View style={{ marginBottom: 30 }}>
          <AuthBrand />
          <View
            accessibilityRole="radiogroup"
            accessibilityLabel={t("language")}
            style={{ flexDirection: "row", justifyContent: "center", gap: 10, marginTop: 20 }}
          >
            {(["bg", "en"] as const).map(locale => {
              const selected = language === locale
              return (
                <TouchableOpacity
                  key={locale}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: selected }}
                  accessibilityLabel={locale === "bg" ? t("bulgarian") : t("english")}
                  onPress={() => void selectLoginLanguage(locale)}
                  style={{
                    minWidth: 96,
                    borderRadius: 12,
                    borderWidth: 2,
                    borderColor: selected ? colors.primary : colors.border,
                    backgroundColor: selected ? withAlpha(colors.primary, "22") : colors.surface,
                    paddingVertical: 10,
                    alignItems: "center",
                  }}
                >
                  <Text style={{ color: selected ? colors.primary : colors.textSecondary, fontWeight: "900" }}>
                    {locale === "bg" ? "BG · Български" : "EN · English"}
                  </Text>
                </TouchableOpacity>
              )
            })}
          </View>
        </View>

        {mfaChallenge ? (
          <AdministratorMfaStep
            challenge={mfaChallenge}
            onComplete={completeAdministratorMfa}
            onAuthenticated={finishMfaLogin}
            onStartOver={() => setMfaChallenge(null)}
          />
        ) : !authenticationReady ? (
          <View
            accessibilityRole="alert"
            style={{
              backgroundColor: withAlpha(colors.danger, "18"),
              borderColor: withAlpha(colors.danger, "66"),
              borderRadius: 12,
              borderWidth: 1,
              padding: 14,
            }}
          >
            <Text style={{ color: colors.textPrimary, fontSize: 14, lineHeight: 21 }}>
              {t("authConfigurationUnavailable")}
            </Text>
          </View>
        ) : (
          <>
            <Text style={{ color: colors.textSecondary, fontSize: 14, marginBottom: 6 }}>
              {usernameMode ? `${t("username")} *` : t("email")}
            </Text>
            <TextInput
              accessibilityLabel={usernameMode ? t("username") : t("email")}
              accessibilityHint={usernameMode ? t("usernameRules") : undefined}
              style={{
                backgroundColor: colors.surface,
                color: colors.textPrimary,
                borderRadius: 14,
                borderCurve: "continuous",
                paddingHorizontal: 14,
                paddingVertical: 13,
                marginBottom: usernameMode ? 8 : 16,
                fontSize: 16,
                borderWidth: 1,
                borderColor: colors.border,
              }}
              placeholder={usernameMode ? t("usernamePlaceholder") : "you@hospital.org"}
              placeholderTextColor={colors.textMuted}
              autoCapitalize="none"
              keyboardType={usernameMode ? "default" : "email-address"}
              autoComplete={usernameMode ? "username" : "email"}
              value={identifier}
              onChangeText={setIdentifier}
            />

            {usernameMode ? (
              <Text style={{ color: colors.textMuted, fontSize: 12, lineHeight: 18, marginBottom: 16 }}>
                {t("usernameRules")}
              </Text>
            ) : null}

            <Text style={{ color: colors.textSecondary, fontSize: 14, marginBottom: 6 }}>
              {t("password")}
            </Text>
            <TextInput
              accessibilityLabel={t("password")}
              style={{ backgroundColor: colors.surface, color: colors.textPrimary, borderRadius: 14, borderCurve: "continuous", paddingHorizontal: 14, paddingVertical: 13, marginBottom: 22, fontSize: 16, borderWidth: 1, borderColor: colors.border }}
              placeholder="••••••••"
              placeholderTextColor={colors.textMuted}
              secureTextEntry
              autoComplete="current-password"
              value={password}
              onChangeText={setPassword}
              onSubmitEditing={handleLogin}
            />

            <TouchableOpacity
              accessibilityRole="button"
              accessibilityState={{ disabled: loading || !identifier || !password }}
              style={{ backgroundColor: colors.primary, borderRadius: 12, borderCurve: "continuous", paddingVertical: 15, alignItems: "center", borderWidth: 1, borderColor: withAlpha(colors.primary, "99") }}
              onPress={handleLogin}
              disabled={loading || !identifier || !password}
            >
              {loading
                ? <ActivityIndicator color="#fff" />
                : <Text style={{ color: colors.background, fontWeight: "900", fontSize: 16 }}>{t("signIn")}</Text>
              }
            </TouchableOpacity>

            {recoveryVisible ? (
              <TouchableOpacity
                accessibilityRole="link"
                style={{ marginTop: 16, alignItems: "center" }}
                onPress={() => router.push("/(auth)/forgot-password")}
              >
                <Text style={{ color: colors.primary, fontSize: 14, fontWeight: "800" }}>
                  {authentication.passwordRecovery === "ADMINISTRATOR"
                    ? t("accountAccessHelp")
                    : t("forgotPassword")}
                </Text>
              </TouchableOpacity>
            ) : null}

            {authentication.selfRegistration ? (
              <TouchableOpacity
                accessibilityRole="link"
                style={{ marginTop: 20, alignItems: "center" }}
                onPress={() => router.push("/(auth)/register")}
              >
                <Text style={{ color: colors.textMuted, fontSize: 14 }}>
                  {t("noAccount")}{" "}
                  <Text style={{ color: colors.primary, fontWeight: "800" }}>{t("register")}</Text>
                </Text>
              </TouchableOpacity>
            ) : null}
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  )
}
