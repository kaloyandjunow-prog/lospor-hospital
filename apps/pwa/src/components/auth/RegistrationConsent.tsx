import { Linking, Text, TouchableOpacity, View } from "react-native"
import { notify } from "@/lib/notify"
import { legalDocumentUrl } from "@/lib/legal-links"
import type { AppLanguage, TranslationKey } from "@/lib/preferences-context"

type Translate = (key: TranslationKey) => string

/**
 * The consent block of the registration form: what the account is for, and the
 * single acceptance covering the Terms and the Privacy Notice.
 *
 * Split out of register.tsx, which had grown past its size budget. Kept whole
 * rather than divided further because the notice, the checkbox and the two
 * document links are one legal act: the checkbox may only be reachable while
 * the active documents it accepts are known, which is why `canAccept` gates
 * both the press and the accessibility state.
 */
export function RegistrationConsent({
  value,
  onChange,
  canAccept,
  error,
  language,
  t,
}: {
  value: boolean
  onChange: (accepted: boolean) => void
  canAccept: boolean
  error?: string
  language: AppLanguage
  t: Translate
}) {
  const openDocument = (document: "terms" | "privacy") => {
    void Linking.openURL(legalDocumentUrl(document, language))
      .catch(() => notify(t("error"), t("legalLinkFailed")))
  }

  return (
    <View className="mb-4">
      <View
        style={{
          backgroundColor: "#1c1c1c",
          borderColor: "#2e2e2e",
          borderWidth: 1,
          borderRadius: 12,
          padding: 12,
          marginBottom: 12,
        }}
      >
        <Text style={{ color: "#cbd5e1", fontSize: 13, fontWeight: "700", marginBottom: 4 }}>
          {t("clinicalRegistryAccount")}
        </Text>
        <Text style={{ color: "#94a3b8", fontSize: 12, lineHeight: 17 }}>
          {t("registryLegalNotice")}
        </Text>
      </View>
      <TouchableOpacity
        className="flex-row items-start"
        accessibilityRole="checkbox"
        accessibilityState={{ checked: Boolean(value), disabled: !canAccept }}
        onPress={() => {
          if (canAccept) onChange(!value)
        }}
        disabled={!canAccept}
        activeOpacity={0.7}
      >
        <View
          className="mt-0.5 mr-3 items-center justify-center"
          style={{
            width: 20,
            height: 20,
            borderRadius: 4,
            borderWidth: 2,
            borderColor: value ? "#3b82f6" : "#4b5563",
            backgroundColor: value ? "#3b82f6" : "transparent",
          }}
        >
          {value && <Text style={{ color: "#fff", fontSize: 13, lineHeight: 16 }}>✓</Text>}
        </View>
        <View className="flex-1">
          <Text className="text-slate-300 text-sm leading-relaxed">
            {t("acceptLegalPrefix")}
            <Text className="text-blue-400 underline" onPress={() => openDocument("terms")}>
              {t("termsOfUse")}
            </Text>
            {t("legalAnd")}
            <Text className="text-blue-400 underline" onPress={() => openDocument("privacy")}>
              {t("privacyNotice")}
            </Text>
          </Text>
        </View>
      </TouchableOpacity>
      {error && (
        <Text className="text-red-400 text-xs mt-1 ml-8">{error}</Text>
      )}
    </View>
  )
}
