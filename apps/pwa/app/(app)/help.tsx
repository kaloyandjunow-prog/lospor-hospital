import { useEffect, useState } from "react"
import { Linking, Platform, ScrollView, Text, TouchableOpacity, View } from "react-native"
import Constants from "expo-constants"
import { Stack, useRouter, type Href } from "expo-router"

import { AppHeader } from "@/components/AppHeader"
import { Card, SettingsRow } from "@/components/ui"
import { formatMessage } from "@/i18n/locale"
import {
  loadDeploymentSupport,
  NO_DEPLOYMENT_SUPPORT,
  type DeploymentSupport,
} from "@/lib/deployment-support"
import { notify } from "@/lib/notify"
import { usePreferences } from "@/lib/preferences-context"
import { colors } from "@/theme/colors"

function HelpSection({ title, body }: { title: string; body: string }) {
  return (
    <View style={{ padding: 16, borderBottomColor: colors.border, borderBottomWidth: 1 }}>
      <Text style={{ color: colors.textPrimary, fontSize: 14, fontWeight: "800", marginBottom: 5 }}>
        {title}
      </Text>
      <Text style={{ color: colors.textSecondary, fontSize: 13, lineHeight: 19 }}>
        {body}
      </Text>
    </View>
  )
}

export default function HelpScreen() {
  const router = useRouter()
  const { t } = usePreferences()
  const [support, setSupport] = useState<DeploymentSupport>(NO_DEPLOYMENT_SUPPORT)
  const supportContactUrl = support.contactUrl
  const version = Constants.expoConfig?.version ?? "?"

  useEffect(() => {
    let active = true
    void loadDeploymentSupport().then(value => {
      if (active) setSupport(value)
    })
    return () => { active = false }
  }, [])

  function open(url: string) {
    void Linking.openURL(url).catch(() => notify(t("error"), t("supportLinkFailed")))
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Stack.Screen options={{ headerShown: false }} />
      <AppHeader title={t("helpTitle")} showNewCase={false} onBack={() => router.back()} />
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 48, gap: 16 }}>
        <Text style={{ color: colors.textSecondary, fontSize: 14, lineHeight: 21 }}>
          {formatMessage(t("helpOfflineIntro"), { version })}
        </Text>

        <Card>
          <HelpSection title={t("helpGettingStartedTitle")} body={t("helpGettingStartedBody")} />
          <HelpSection title={t("helpCasesTitle")} body={t("helpCasesBody")} />
          <HelpSection title={t("helpOfflineTitle")} body={t("helpOfflineBody")} />
          <HelpSection
            title={t("helpRemindersTitle")}
            body={Platform.OS === "web" ? t("helpRemindersPwaBody") : t("helpRemindersNativeBody")}
          />
          <HelpSection title={t("helpAccountTitle")} body={t("helpAccountBody")} />
          <View style={{ padding: 16 }}>
            <Text style={{ color: colors.textPrimary, fontSize: 14, fontWeight: "800", marginBottom: 5 }}>
              {t("helpPrivacyTitle")}
            </Text>
            <Text style={{ color: colors.textSecondary, fontSize: 13, lineHeight: 19 }}>
              {t("helpPrivacyBody")}
            </Text>
          </View>
        </Card>

        <Card>
          <SettingsRow
            label={t("localSupportTitle")}
            subtitle={support.configured ? t("supportConfigured") : t("supportNotConfigured")}
            onPress={supportContactUrl ? () => open(supportContactUrl) : undefined}
          />
          <SettingsRow
            label={t("reportBug")}
            subtitle={t("reportBugSubtitle")}
            onPress={() => router.push("/(app)/support" as Href)}
          />
          <SettingsRow
            label={t("externalDocs")}
            subtitle={t("externalDocsSubtitle")}
            onPress={() => open("https://docs.lospor.org")}
            last
          />
        </Card>

        {supportContactUrl ? (
          <TouchableOpacity
            accessibilityRole="link"
            onPress={() => open(supportContactUrl)}
            style={{ alignItems: "center", borderColor: colors.border, borderRadius: 12, borderWidth: 1, paddingVertical: 12 }}
          >
            <Text style={{ color: colors.primary, fontSize: 13, fontWeight: "800" }}>
              {t("openSupportContact")}
            </Text>
          </TouchableOpacity>
        ) : null}
      </ScrollView>
    </View>
  )
}
