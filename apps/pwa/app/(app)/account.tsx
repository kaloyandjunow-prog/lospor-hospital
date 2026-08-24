import { useCallback, useEffect, useRef, useState } from "react"
import { ActivityIndicator, ScrollView, Text, View } from "react-native"
import { Stack, useRouter } from "expo-router"

import { AppHeader } from "@/components/AppHeader"
import { Card, Field, PrimaryButton, StyledInput } from "@/components/ui"
import { usePreferences } from "@/lib/preferences-context"
import {
  loadAccountProfile,
  saveProfileCorrection,
  validateProfileCorrection,
  type AccountProfile,
} from "@/lib/profile-correction"
import { colors } from "@/theme/colors"

export default function AccountScreen() {
  const router = useRouter()
  const { t } = usePreferences()
  const [profile, setProfile] = useState<AccountProfile | null>(null)
  const [firstName, setFirstName] = useState("")
  const [lastName, setLastName] = useState("")
  const [title, setTitle] = useState("")
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ tone: "error" | "success"; text: string } | null>(null)
  const loadSequence = useRef(0)

  const load = useCallback(() => {
    const sequence = ++loadSequence.current
    setLoading(true)
    setMessage(null)
    void loadAccountProfile()
      .then(current => {
        if (sequence !== loadSequence.current) return
        setProfile(current)
        setFirstName(current.firstName ?? "")
        setLastName(current.lastName ?? "")
        setTitle(current.title ?? "")
      })
      .catch(() => {
        if (sequence === loadSequence.current) {
          setProfile(null)
          setMessage({ tone: "error", text: t("profileLoadFailed") })
        }
      })
      .finally(() => {
        if (sequence === loadSequence.current) setLoading(false)
      })
  }, [t])

  useEffect(() => {
    load()
    return () => { loadSequence.current += 1 }
  }, [load])

  async function save() {
    setMessage(null)
    const validation = validateProfileCorrection({ firstName, lastName, title })
    if (!validation.ok) {
      setMessage({
        tone: "error",
        text: validation.reason === "NAME_REQUIRED" ? t("profileNameRequired") : t("profileSaveFailed"),
      })
      return
    }
    setSaving(true)
    try {
      const updated = await saveProfileCorrection(validation.value)
      setProfile(previous => previous ? { ...previous, ...updated } : previous)
      setFirstName(updated.firstName)
      setLastName(updated.lastName)
      setTitle(updated.title)
      setMessage({ tone: "success", text: t("profileSaved") })
    } catch {
      setMessage({ tone: "error", text: t("profileSaveFailed") })
    } finally {
      setSaving(false)
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Stack.Screen options={{ headerShown: false }} />
      <AppHeader
        title={t("profileCorrectionTitle")}
        showNewCase={false}
        onBack={() => router.back()}
      />
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: 20, paddingBottom: 48, gap: 16 }}
      >
        <Text style={{ color: colors.textSecondary, fontSize: 14, lineHeight: 21 }}>
          {t("profileCorrectionDescription")}
        </Text>

        {loading ? <ActivityIndicator color={colors.primary} /> : profile ? (
          <Card>
            <View style={{ padding: 16 }}>
              <Field label={t("profileEmail")}>
                <StyledInput
                  value={profile?.email ?? ""}
                  editable={false}
                  accessibilityLabel={t("profileEmail")}
                  autoComplete="email"
                />
                <Text style={{ color: colors.textMuted, fontSize: 11, lineHeight: 16, marginTop: 6 }}>
                  {t("profileEmailGoverned")}
                </Text>
              </Field>
              <Field label={t("professionalTitle")}>
                <StyledInput
                  value={title}
                  onChangeText={setTitle}
                  maxLength={100}
                  autoCapitalize="words"
                  accessibilityLabel={t("professionalTitle")}
                />
              </Field>
              <Field label={t("firstName")} required>
                <StyledInput
                  value={firstName}
                  onChangeText={setFirstName}
                  maxLength={100}
                  autoCapitalize="words"
                  autoComplete="name-given"
                  accessibilityLabel={t("firstName")}
                />
              </Field>
              <Field label={t("lastName")} required>
                <StyledInput
                  value={lastName}
                  onChangeText={setLastName}
                  maxLength={100}
                  autoCapitalize="words"
                  autoComplete="name-family"
                  accessibilityLabel={t("lastName")}
                />
              </Field>
              <Text style={{ color: colors.textMuted, fontSize: 11, lineHeight: 16, marginBottom: 16 }}>
                {profile?.institution?.name ?? t("noInstitution")}
                {profile?.institution?.city ? ` · ${profile.institution.city}` : ""}
                {"\n"}{t("profileInstitutionGoverned")}
              </Text>
              {message ? (
                <Text
                  accessibilityLiveRegion="polite"
                  style={{
                    color: message.tone === "success" ? colors.success : colors.danger,
                    fontSize: 13,
                    lineHeight: 18,
                    marginBottom: 12,
                  }}
                >
                  {message.text}
                </Text>
              ) : null}
              <PrimaryButton label={t("saveProfile")} onPress={() => { void save() }} loading={saving} />
            </View>
          </Card>
        ) : (
          <Card>
            <View style={{ padding: 16, gap: 14 }}>
              <Text
                accessibilityLiveRegion="polite"
                style={{ color: colors.danger, fontSize: 13, lineHeight: 19 }}
              >
                {message?.text ?? t("profileLoadFailed")}
              </Text>
              <PrimaryButton label={t("retry")} onPress={() => { load() }} />
            </View>
          </Card>
        )}
      </ScrollView>
    </View>
  )
}
