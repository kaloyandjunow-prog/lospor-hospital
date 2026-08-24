import { Text, TouchableOpacity, View } from "react-native"
import { useRouter } from "expo-router"
import { passwordPolicyIssues } from "@lospor/core/account"
import { usePreferences, type TranslationKey } from "@/lib/preferences-context"

type Translate = (key: TranslationKey) => string

export function getPasswordStrength(
  pw: string,
  t: Translate,
): { score: number; color: string; label: string } {
  const score = 4 - passwordPolicyIssues(pw).length
  if (pw.length === 0) return { score: 0, color: "#2e2e2e", label: "" }
  if (score < 2) return { score, color: "#ef4444", label: t("passwordWeak") }
  if (score < 4) return { score, color: "#f59e0b", label: t("passwordFair") }
  return { score, color: "#22c55e", label: t("passwordStrong") }
}

export function PasswordStrengthBar({ password, t }: { password: string; t: Translate }) {
  const { score, color, label } = getPasswordStrength(password, t)
  if (!password) return null
  const segments = [1, 2, 3, 4]
  return (
    <View className="mt-2">
      <View className="flex-row gap-1">
        {segments.map(seg => (
          <View
            key={seg}
            style={{
              flex: 1,
              height: 4,
              borderRadius: 2,
              backgroundColor: score >= seg ? color : "#2e2e2e",
            }}
          />
        ))}
      </View>
      {label ? (
        <Text style={{ color, fontSize: 11, marginTop: 4 }}>{label}</Text>
      ) : null}
    </View>
  )
}

// `emailSent: false` means the account exists but no verification link was
// ever sent — the installation has no mail provider, or the provider refused.
// Telling somebody to check an inbox in that state leaves them waiting on a
// message that is never coming, with a sign-in they cannot complete.
export function SuccessView({ emailSent }: { emailSent: boolean }) {
  const router = useRouter()
  const { t } = usePreferences()
  return (
    <View className="flex-1 bg-[#111111] justify-center items-center px-8">
      <Text style={{ fontSize: 72, color: emailSent ? "#22c55e" : "#f59e0b", marginBottom: 16 }}>
        {emailSent ? "✓" : "!"}
      </Text>
      <Text className="text-white text-2xl font-bold text-center mb-3">{t("accountCreated")}</Text>
      <Text className="text-slate-400 text-sm text-center mb-10 leading-relaxed">
        {emailSent
          ? t("verificationEmailSent")
          : t("verificationEmailNotSent")}
      </Text>
      <TouchableOpacity
        className="bg-blue-600 rounded-xl py-3.5 px-8 items-center"
        onPress={() => router.replace("/(auth)/login")}
      >
        <Text className="text-white font-semibold text-base">{t("backToLogin")}</Text>
      </TouchableOpacity>
    </View>
  )
}
