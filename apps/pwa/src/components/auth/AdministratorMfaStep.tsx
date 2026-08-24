import { useEffect, useState } from "react"
import {
  ActivityIndicator,
  Linking,
  Platform,
  Share,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native"
import { ApiError } from "@/lib/api"
import {
  administratorMfaErrorKey,
  type AdministratorMfaChallenge,
  type AdministratorMfaCompletion,
} from "@/lib/administrator-mfa"
import { usePreferences } from "@/lib/preferences-context"
import { colors, withAlpha } from "@/theme/colors"

function secondsRemaining(expiresAt: number): number {
  return Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000))
}

function clock(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`
}

export function AdministratorMfaStep({
  challenge,
  onComplete,
  onAuthenticated,
  onStartOver,
}: {
  challenge: AdministratorMfaChallenge
  onComplete: (
    challenge: AdministratorMfaChallenge,
    code: string,
  ) => Promise<AdministratorMfaCompletion>
  onAuthenticated: () => Promise<void>
  onStartOver: () => void
}) {
  const { t } = usePreferences()
  const [remaining, setRemaining] = useState(() => secondsRemaining(challenge.expiresAt))
  const [entryKind, setEntryKind] = useState<"authenticator" | "recovery">("authenticator")
  const [code, setCode] = useState("")
  const [loading, setLoading] = useState(false)
  const [errorKey, setErrorKey] = useState<ReturnType<typeof administratorMfaErrorKey> | "mfaCodeInvalid" | "mfaSaveFailed" | null>(null)
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null)
  const [acknowledged, setAcknowledged] = useState(false)
  const [saveStatus, setSaveStatus] = useState<"saved" | "failed" | null>(null)

  useEffect(() => {
    const timer = setInterval(() => setRemaining(secondsRemaining(challenge.expiresAt)), 1_000)
    return () => clearInterval(timer)
  }, [challenge.expiresAt])

  async function submit() {
    if (loading || remaining === 0) return
    const submitted = entryKind === "authenticator"
      ? code.replace(/[\s-]/g, "")
      : code.trim()
    if (
      (entryKind === "authenticator" && !/^\d{6}$/.test(submitted))
      || (entryKind === "recovery" && submitted.length < 6)
    ) {
      setErrorKey("mfaCodeInvalid")
      return
    }

    setLoading(true)
    setErrorKey(null)
    try {
      const completion = await onComplete(challenge, submitted)
      if (completion.recoveryCodes) {
        setRecoveryCodes(completion.recoveryCodes)
        setCode("")
      } else {
        await onAuthenticated()
      }
    } catch (error) {
      setErrorKey(error instanceof ApiError
        ? administratorMfaErrorKey(error.status)
        : "mfaUnavailable")
    } finally {
      setLoading(false)
    }
  }

  async function saveRecoveryCodes() {
    if (!recoveryCodes) return
    const message = `${t("mfaRecoveryCodesTitle")}\n\n${recoveryCodes.join("\n")}\n\n${t("mfaRecoveryCodesWarning")}`
    try {
      if (
        Platform.OS === "web"
        && typeof navigator !== "undefined"
        && navigator.clipboard?.writeText
      ) {
        await navigator.clipboard.writeText(message)
      } else {
        await Share.share({ message, title: t("mfaRecoveryCodesTitle") })
      }
      setSaveStatus("saved")
    } catch {
      setSaveStatus("failed")
      setErrorKey("mfaSaveFailed")
    }
  }

  if (recoveryCodes) {
    return (
      <View style={{ gap: 14 }}>
        <Text style={{ color: colors.textPrimary, fontSize: 22, fontWeight: "900" }}>
          {t("mfaRecoveryCodesTitle")}
        </Text>
        <Text style={{ color: colors.warning, fontSize: 14, lineHeight: 20 }}>
          {t("mfaRecoveryCodesWarning")}
        </Text>
        <View style={{ borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: 14, gap: 6 }}>
          {recoveryCodes.map(value => (
            <Text key={value} selectable style={{ color: colors.textPrimary, fontFamily: "monospace", fontSize: 16 }}>
              {value}
            </Text>
          ))}
        </View>
        <TouchableOpacity
          accessibilityRole="button"
          onPress={() => { void saveRecoveryCodes() }}
          style={{ borderRadius: 12, borderWidth: 1, borderColor: colors.primary, paddingVertical: 13, alignItems: "center" }}
        >
          <Text style={{ color: colors.primary, fontWeight: "900" }}>
            {Platform.OS === "web" ? t("mfaCopyRecoveryCodes") : t("mfaShareRecoveryCodes")}
          </Text>
        </TouchableOpacity>
        {saveStatus === "saved" && (
          <Text accessibilityRole="alert" style={{ color: colors.success }}>{t("mfaRecoveryCodesSaved")}</Text>
        )}
        <TouchableOpacity
          accessibilityRole="checkbox"
          accessibilityState={{ checked: acknowledged }}
          onPress={() => setAcknowledged(value => !value)}
          style={{ flexDirection: "row", gap: 10, alignItems: "flex-start" }}
        >
          <View style={{ width: 22, height: 22, borderRadius: 5, borderWidth: 2, borderColor: acknowledged ? colors.primary : colors.border, backgroundColor: acknowledged ? colors.primary : colors.surface, alignItems: "center", justifyContent: "center" }}>
            {acknowledged && <Text style={{ color: colors.background, fontWeight: "900" }}>✓</Text>}
          </View>
          <Text style={{ flex: 1, color: colors.textSecondary, lineHeight: 20 }}>{t("mfaRecoveryCodesAcknowledge")}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          accessibilityRole="button"
          disabled={!acknowledged || loading}
          onPress={() => { void onAuthenticated() }}
          style={{ backgroundColor: acknowledged ? colors.primary : withAlpha(colors.primary, "55"), borderRadius: 12, paddingVertical: 15, alignItems: "center" }}
        >
          <Text style={{ color: colors.background, fontWeight: "900" }}>{t("mfaContinue")}</Text>
        </TouchableOpacity>
      </View>
    )
  }

  const expired = remaining === 0
  return (
    <View style={{ gap: 14 }}>
      <Text style={{ color: colors.textPrimary, fontSize: 22, fontWeight: "900" }}>
        {challenge.enrollmentRequired ? t("mfaSetupTitle") : t("mfaTitle")}
      </Text>
      <Text style={{ color: colors.textSecondary, fontSize: 14, lineHeight: 20 }}>
        {challenge.enrollmentRequired ? t("mfaSetupDescription") : t("mfaDescription")}
      </Text>

      {challenge.enrollmentRequired && challenge.manualKey && (
        <View style={{ borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: 12, gap: 6 }}>
          <Text style={{ color: colors.textSecondary, fontSize: 13 }}>{t("mfaManualKey")}</Text>
          <Text selectable style={{ color: colors.textPrimary, fontFamily: "monospace", fontSize: 15 }}>{challenge.manualKey}</Text>
        </View>
      )}
      {challenge.enrollmentRequired && challenge.otpauthUri && (
        <TouchableOpacity
          accessibilityRole="link"
          onPress={() => { void Linking.openURL(challenge.otpauthUri!) }}
          style={{ borderRadius: 12, borderWidth: 1, borderColor: colors.primary, paddingVertical: 12, alignItems: "center" }}
        >
          <Text style={{ color: colors.primary, fontWeight: "900" }}>{t("mfaOpenAuthenticator")}</Text>
        </TouchableOpacity>
      )}

      {!challenge.enrollmentRequired && (
        <View style={{ flexDirection: "row", gap: 8 }}>
          {(["authenticator", "recovery"] as const).map(kind => (
            <TouchableOpacity
              key={kind}
              accessibilityRole="radio"
              accessibilityState={{ checked: entryKind === kind }}
              onPress={() => { setEntryKind(kind); setCode(""); setErrorKey(null) }}
              style={{ flex: 1, borderRadius: 10, borderWidth: 1, borderColor: entryKind === kind ? colors.primary : colors.border, backgroundColor: entryKind === kind ? withAlpha(colors.primary, "22") : colors.surface, paddingVertical: 10, alignItems: "center" }}
            >
              <Text style={{ color: entryKind === kind ? colors.primary : colors.textSecondary, fontWeight: "800" }}>
                {kind === "authenticator" ? t("mfaAuthenticatorCode") : t("mfaRecoveryCode")}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      <TextInput
        accessibilityLabel={entryKind === "authenticator" ? t("mfaAuthenticatorCode") : t("mfaRecoveryCode")}
        value={code}
        onChangeText={setCode}
        autoCapitalize={entryKind === "recovery" ? "characters" : "none"}
        autoCorrect={false}
        keyboardType={entryKind === "authenticator" ? "number-pad" : "default"}
        maxLength={entryKind === "authenticator" ? 8 : 64}
        placeholder={entryKind === "authenticator" ? "000000" : "XXXX-XXXX-XXXX-XXXX"}
        placeholderTextColor={colors.textMuted}
        onSubmitEditing={() => { void submit() }}
        style={{ backgroundColor: colors.surface, color: colors.textPrimary, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 13, fontSize: 18, borderWidth: 1, borderColor: colors.border, letterSpacing: 1 }}
      />
      <Text style={{ color: expired ? colors.danger : colors.textMuted, fontSize: 13 }}>
        {expired ? t("mfaChallengeExpired") : `${t("mfaExpiresIn")} ${clock(remaining)}`}
      </Text>
      {errorKey && <Text accessibilityRole="alert" style={{ color: colors.danger }}>{t(errorKey)}</Text>}
      <TouchableOpacity
        accessibilityRole="button"
        onPress={() => { void submit() }}
        disabled={loading || expired}
        style={{ backgroundColor: expired ? withAlpha(colors.primary, "55") : colors.primary, borderRadius: 12, paddingVertical: 15, alignItems: "center" }}
      >
        {loading
          ? <ActivityIndicator color="#fff" />
          : <Text style={{ color: colors.background, fontWeight: "900", fontSize: 16 }}>{t("mfaVerify")}</Text>}
      </TouchableOpacity>
      <TouchableOpacity accessibilityRole="button" onPress={onStartOver} style={{ alignItems: "center", paddingVertical: 8 }}>
        <Text style={{ color: colors.primary, fontWeight: "800" }}>{t("mfaStartOver")}</Text>
      </TouchableOpacity>
    </View>
  )
}
