import { useCallback, useEffect, useState } from "react"
import { View, Platform, Text, Switch } from "react-native"
import * as SecureStore from "expo-secure-store"
import { usePreferences } from "@/lib/preferences-context"
import { ensurePermission, presentNow, getStatus, type NotifStatus } from "@/lib/notifications"
import { REMINDERS_KEY, VITALS_INTERVAL_KEY, DEFAULT_INTERVAL_MIN } from "@/lib/use-case-reminders"
import { Card, SectionHeader, SettingsRow } from "@/components/ui"
import { colors } from "@/theme/colors"

const INTERVAL_CHOICES = [3, 5, 10, 15]

/** Split out of SettingsPreferencesView: vitals-reminder notifications own no state anything else in the settings screen reads. */
export function NotificationsCard() {
  const { t, tc } = usePreferences()
  const [remindersOn,   setRemindersOnState]   = useState(false)
  const [vitalsInterval, setVitalsIntervalState] = useState(DEFAULT_INTERVAL_MIN)
  const [notifStatus,   setNotifStatus]        = useState<NotifStatus | null>(null)
  const [notifMsg,      setNotifMsg]           = useState<string | null>(null)

  function refreshNotifStatus() { getStatus().then(setNotifStatus).catch(() => {}) }

  const loadAutomation = useCallback(() => {
    SecureStore.getItemAsync(REMINDERS_KEY).then(v => setRemindersOnState(v === "on"))
    SecureStore.getItemAsync(VITALS_INTERVAL_KEY).then(v => {
      const n = Number(v); if (Number.isFinite(n) && n > 0) setVitalsIntervalState(n)
    })
    refreshNotifStatus()
  }, [])

  useEffect(() => {
    loadAutomation()
  }, [loadAutomation])

  async function setRemindersOn(v: boolean) {
    setNotifMsg(null)
    if (v) {
      const status = await getStatus()
      setNotifStatus(status)
      if (!status.supported) {
        setNotifMsg(t("notificationsUnavailable"))
        return
      }
      const ok = await ensurePermission()
      refreshNotifStatus()
      if (!ok) {
        setNotifMsg(t("notificationPermissionTryAgain"))
        return
      }
    }
    setRemindersOnState(v)
    SecureStore.setItemAsync(REMINDERS_KEY, v ? "on" : "off")
  }
  function cycleVitalsInterval() {
    const idx = INTERVAL_CHOICES.indexOf(vitalsInterval)
    const next = INTERVAL_CHOICES[(idx + 1) % INTERVAL_CHOICES.length]
    setVitalsIntervalState(next)
    SecureStore.setItemAsync(VITALS_INTERVAL_KEY, String(next))
  }
  async function sendTestNotification() {
    setNotifMsg(null)
    const status = await getStatus()
    setNotifStatus(status)
    if (!status.supported) {
      setNotifMsg(t("notificationsUnavailable"))
      return
    }
    const ok = await ensurePermission()
    refreshNotifStatus()
    if (!ok) {
      setNotifMsg(t("notificationPermissionSettings"))
      return
    }
    await presentNow("LOSPOR", t("testNotificationBody"))
    setNotifMsg(t("notificationSent"))
  }

  return (
    <>
      <SectionHeader title={t("notificationsSection")} />
      <Card>
        <SettingsRow
          label={t("caseReminders")}
          subtitle={
            (Platform.OS === "web"
              ? `${t("remindVitalsActiveCasePwa")}. ${t("pwaReminderLimitation")}`
              : t("remindVitalsActiveCase")) +
            (notifStatus
              ? !notifStatus.supported
                ? t("notificationStatusUnavailable")
                : notifStatus.permission === "granted" ? t("notificationStatusAllowed")
                : notifStatus.permission === "denied"  ? t("notificationStatusBlocked")
                : t("notificationStatusNotAsked")
              : "")
          }
          rightElement={
            <Switch
              value={remindersOn}
              onValueChange={setRemindersOn}
              trackColor={{ false: colors.border, true: colors.primarySoft }}
              thumbColor={remindersOn ? colors.primary : colors.textMuted}
            />
          }
        />
        {notifMsg && (
          <View style={{ paddingHorizontal: 16, paddingBottom: 12 }}>
            <Text style={{ color: colors.textSecondary, fontSize: 13, lineHeight: 18 }}>{notifMsg}</Text>
          </View>
        )}
        {remindersOn && (
          <SettingsRow
            label={t("vitalsReminderInterval")}
            subtitle={t("tapToChangeReminder")}
            onPress={cycleVitalsInterval}
            rightElement={
              <Text style={{ color: colors.primary, fontWeight: "700", fontSize: 15 }}>
                {vitalsInterval} {tc("minutesShort")}
              </Text>
            }
          />
        )}
        <SettingsRow
          label={t("sendTestNotification")}
          subtitle={t("checkNotificationsAllowed")}
          last
          onPress={sendTestNotification}
        />
      </Card>
    </>
  )
}
