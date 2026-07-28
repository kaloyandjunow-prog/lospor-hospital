import { useState } from "react"
import {
  View, Text, TextInput, TouchableOpacity,
  KeyboardAvoidingView, Platform, ActivityIndicator,
} from "react-native"
import { useRouter } from "expo-router"
import { useAuth } from "@/lib/auth-context"
import { notify } from "@/lib/notify"
import { colors, withAlpha } from "@/theme/colors"
import { AuthBackdrop, AuthBrand } from "@/components/AuthBrand"

export default function LoginScreen() {
  const { login } = useAuth()
  const router = useRouter()
  const [email, setEmail]       = useState("")
  const [password, setPassword] = useState("")
  const [loading, setLoading]   = useState(false)

  async function handleLogin() {
    if (!email.trim() || !password) return
    setLoading(true)
    try {
      await login(email.trim().toLowerCase(), password)
    } catch (err) {
      const message = err instanceof Error ? err.message : "Please check your credentials."
      notify("Login failed", message)
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

        <Text style={{ color: colors.textSecondary, fontSize: 14, marginBottom: 6 }}>Email</Text>
        <TextInput
          style={{ backgroundColor: colors.surface, color: colors.textPrimary, borderRadius: 14, borderCurve: "continuous", paddingHorizontal: 14, paddingVertical: 13, marginBottom: 16, fontSize: 16, borderWidth: 1, borderColor: colors.border }}
          placeholder="you@hospital.org"
          placeholderTextColor={colors.textMuted}
          autoCapitalize="none"
          keyboardType="email-address"
          autoComplete="email"
          value={email}
          onChangeText={setEmail}
        />

        <Text style={{ color: colors.textSecondary, fontSize: 14, marginBottom: 6 }}>Password</Text>
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
            : <Text style={{ color: colors.background, fontWeight: "900", fontSize: 16 }}>Sign in</Text>
          }
        </TouchableOpacity>

        <TouchableOpacity
          style={{ marginTop: 16, alignItems: "center" }}
          onPress={() => router.push("/(auth)/forgot-password")}
        >
          <Text style={{ color: colors.primary, fontSize: 14, fontWeight: "800" }}>Forgot password?</Text>
        </TouchableOpacity>

        <Text
          style={{ marginTop: 20, textAlign: "center", color: colors.textMuted, fontSize: 14 }}
        >
          Accounts are created by your hospital administrator.
        </Text>
      </View>
    </KeyboardAvoidingView>
  )
}
