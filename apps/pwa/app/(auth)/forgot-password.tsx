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
import { colors, withAlpha } from "@/theme/colors"

export default function ForgotPasswordScreen() {
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)

  async function submit() {
    if (!email.trim()) return
    setLoading(true)
    try {
      await requestPasswordReset(email.trim().toLowerCase())
      setSent(true)
    } catch (err) {
      notify("Password reset failed", err instanceof Error ? err.message : "Please try again.")
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
          Reset password
        </Text>
        <Text style={{ color: colors.textSecondary, fontSize: 14, marginBottom: 24 }}>
          Enter your account email. If it exists, a reset link will be sent.
        </Text>

        {sent ? (
          <Text style={{ color: colors.success, fontSize: 15, lineHeight: 22, marginBottom: 22 }}>
            If this email belongs to an account, a reset link has been sent.
          </Text>
        ) : (
          <>
            <Text style={{ color: colors.textSecondary, fontSize: 14, marginBottom: 6 }}>Email</Text>
            <TextInput
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
              style={{ backgroundColor: colors.primary, borderRadius: 12, borderCurve: "continuous", paddingVertical: 15, alignItems: "center", borderWidth: 1, borderColor: withAlpha(colors.primary, "99") }}
              onPress={submit}
              disabled={loading}
            >
              {loading
                ? <ActivityIndicator color="#fff" />
                : <Text style={{ color: colors.background, fontWeight: "900", fontSize: 16 }}>Send reset link</Text>
              }
            </TouchableOpacity>
          </>
        )}

        <TouchableOpacity
          style={{ marginTop: 28, alignItems: "center" }}
          onPress={() => router.replace("/(auth)/login")}
        >
          <Text style={{ color: colors.primary, fontSize: 14, fontWeight: "800" }}>Back to login</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  )
}

