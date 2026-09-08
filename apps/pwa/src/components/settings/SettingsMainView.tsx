import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator } from "react-native"
import { Stack, useRouter, type Href } from "expo-router"
import { NO_INSTITUTION_ID } from "@lospor/core/account"
import { usePreferences } from "@/lib/preferences-context"
import { Card, SectionHeader, SettingsRow } from "@/components/ui"
import { colors, withAlpha } from "@/theme/colors"
import { AppHeader } from "@/components/AppHeader"
import { MedicalDisclaimer } from "@/components/MedicalDisclaimer"
import { InstitutionPicker, type Institution } from "@/components/SettingsPickers"
import type { AuthorityNavigation } from "@/lib/authority-navigation"
import type { ProfileData } from "./types"

/**
 * Split out of settings.tsx: the landing screen (profile, institution, the
 * nav row into the preferences sub-screen, sign-out). Shares only the
 * profile/institution state and handlers with the parent -- none of the
 * preferences sub-screen's theme/units/automation/notifications/diagnostics
 * state means anything here.
 */
export function SettingsMainView({
  t, profile, institutionSaving, institutionRequest, pickerOpen, setPickerOpen,
  handleSelectInstitution, handleLeaveInstitution, handleSignOut,
  authorityNavigation, isAdmin, displayName, onOpenSettings,
}: {
  t: ReturnType<typeof usePreferences>["t"]
  profile: ProfileData | null
  institutionSaving: boolean
  institutionRequest: Institution | null
  pickerOpen: boolean
  setPickerOpen: (v: boolean) => void
  handleSelectInstitution: (inst: Institution | null) => void | Promise<void>
  handleLeaveInstitution: () => void | Promise<void>
  handleSignOut: () => void | Promise<void>
  authorityNavigation: AuthorityNavigation | null | undefined
  isAdmin: boolean
  displayName: string
  onOpenSettings: () => void
}) {
  const router = useRouter()

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Stack.Screen options={{ headerShown: false }} />
      <AppHeader eyebrow="LOSPOR" title={t("settings")} showNewCase={false} />

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 60, paddingTop: 12 }}
      >
        {/* Profile card */}
        <SectionHeader title={t("profileSection")} />
        <Card>
          {/* Name */}
          <View style={{
            paddingHorizontal: 16, paddingVertical: 16,
            borderBottomWidth: 1, borderBottomColor: colors.border,
          }}>
            <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 4 }}>
              {t("name")}
            </Text>
            <Text style={{ color: colors.textPrimary, fontSize: 16, fontWeight: "700" }}>
              {displayName}
            </Text>
          </View>

          {/* Institution */}
          <View style={{
            paddingHorizontal: 16, paddingVertical: 14,
            borderBottomWidth: 1, borderBottomColor: colors.border,
            flexDirection: "row", alignItems: "center", justifyContent: "space-between",
          }}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 3 }}>
                {t("institution")}
              </Text>
              {institutionSaving ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <>
                  <Text style={{ color: colors.textPrimary, fontSize: 14, fontWeight: "500" }}>
                    {profile?.institution?.name ?? t("noInstitution")}
                    {profile?.institution?.city ? ` · ${profile.institution.city}` : ""}
                  </Text>
                  {institutionRequest ? (
                    <Text style={{ color: colors.warning, fontSize: 11, fontWeight: "700", marginTop: 3 }}>
                      {t("institutionRequestPendingShort")} {institutionRequest.name}
                    </Text>
                  ) : null}
                </>
              )}
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              {/* Nothing to leave if you are already in Без институция. */}
              {profile?.institution?.id && profile.institution.id !== NO_INSTITUTION_ID ? (
                <TouchableOpacity
                  onPress={handleLeaveInstitution}
                  disabled={institutionSaving}
                  style={{
                    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8,
                    borderWidth: 1, borderColor: withAlpha(colors.danger, "55"),
                    opacity: institutionSaving ? 0.4 : 1,
                  }}
                >
                  <Text style={{ color: colors.danger, fontSize: 12, fontWeight: "700" }}>
                    {t("leaveInstitution")}
                  </Text>
                </TouchableOpacity>
              ) : null}
              <TouchableOpacity
                onPress={() => setPickerOpen(true)}
                disabled={institutionSaving}
                style={{
                  paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8,
                  backgroundColor: withAlpha(colors.primary, "20"),
                  borderWidth: 1, borderColor: withAlpha(colors.primary, "55"),
                  opacity: institutionSaving ? 0.4 : 1,
                }}
              >
                <Text style={{ color: colors.primary, fontSize: 12, fontWeight: "700" }}>
                  {t("editInstitution")}
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          <TouchableOpacity
            accessibilityRole="button"
            onPress={() => router.push("/(app)/account" as Href)}
            style={{ paddingHorizontal: 16, paddingVertical: 14 }}
          >
            <Text style={{ color: colors.textPrimary, fontSize: 14, fontWeight: "700" }}>
              {t("viewProfile")}
            </Text>
            <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 3 }}>
              {t("editProfileSubtitle")}
            </Text>
          </TouchableOpacity>
        </Card>

        {/* Settings nav row */}
        <SectionHeader title=" " />
        <Card>
          <SettingsRow
            label={t("settings")}
            subtitle={t("uiAutomationPrivacySubtitle")}
            onPress={onOpenSettings}
          />
          {authorityNavigation && (
            <SettingsRow
              label={t(authorityNavigation === "ADMINISTRATION" ? "adminConsole" : "departmentRequestQueue")}
              subtitle={t(authorityNavigation === "ADMINISTRATION" ? "adminConsoleSub" : "departmentRequestQueueSub")}
              onPress={() => router.push("/(app)/admin" as Href)}
            />
          )}
          {isAdmin && (
            <SettingsRow
              label={t("auditLogs")}
              subtitle={t("auditLogsSub")}
              onPress={() => router.push("/(app)/audit-logs" as Href)}
            />
          )}
          <SettingsRow
            label={t("diagnosticsTitle")}
            subtitle={t("diagnosticsSub")}
            onPress={() => router.push("/(app)/diagnostics" as Href)}
            last
          />
        </Card>

        {/* Sign out — standalone destructive button */}
        <View style={{ marginTop: 32 }}>
          <TouchableOpacity
            onPress={() => { void handleSignOut() }}
            style={{
              paddingVertical: 14, borderRadius: 14, alignItems: "center",
              backgroundColor: withAlpha(colors.danger, "15"),
              borderWidth: 1, borderColor: withAlpha(colors.danger, "55"),
            }}
          >
            <Text style={{ color: colors.danger, fontSize: 15, fontWeight: "700" }}>
              {t("signOut")}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Medical-device disclaimer — the app suggests doses/rates */}
        <View style={{ marginTop: 28 }}>
          <MedicalDisclaimer />
        </View>
      </ScrollView>

      <InstitutionPicker
        visible={pickerOpen}
        current={profile?.institution}
        onClose={() => setPickerOpen(false)}
        onSelect={handleSelectInstitution}
        searchLabel={t("institutionSearch")}
      />
    </View>
  )
}
