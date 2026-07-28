import { useCallback, useEffect, useState } from "react"
import { ScrollView, Text, View } from "react-native"
import { Stack } from "expo-router"
import { AppHeader } from "@/components/AppHeader"
import { Card, SectionHeader, SettingsRow } from "@/components/ui"
import { colors } from "@/theme/colors"
import { confirmAction, notify } from "@/lib/notify"
import { usePreferences } from "@/lib/preferences-context"
import {
  clearDroppedIntraopEvents,
  getDroppedIntraopEvents,
} from "@/lib/pending-intraop-events"
import type { DroppedEvent } from "@lospor/core/sync"

function eventLabel(ev: DroppedEvent["event"]): string {
  const type = typeof ev.type === "string" ? ev.type : "event"
  const name = typeof ev.name === "string" ? ev.name : typeof ev.label === "string" ? ev.label : ""
  return name ? `${type} · ${name}` : type
}

function eventTime(ev: DroppedEvent["event"]): string {
  if (typeof ev.ts !== "string") return ""
  const d = new Date(ev.ts)
  return Number.isNaN(d.getTime()) ? String(ev.ts) : d.toLocaleString()
}

export default function DroppedEventsScreen() {
  const { t } = usePreferences()
  const [dropped, setDropped] = useState<DroppedEvent[] | null>(null)

  const load = useCallback(() => {
    getDroppedIntraopEvents().then(setDropped).catch(() => setDropped([]))
  }, [])

  useEffect(() => { load() }, [load])

  function clearList() {
    void confirmAction(
      t("droppedEventsClearTitle"),
      t("droppedEventsClearMsg"),
      { destructive: true, confirmLabel: t("droppedEventsClear"), cancelLabel: t("cancel") },
    ).then(async (ok) => {
      if (!ok) return
      await clearDroppedIntraopEvents()
      notify(t("droppedEvents"), t("droppedEventsEmpty"))
      load()
    })
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Stack.Screen options={{ headerShown: false }} />
      <AppHeader title={t("droppedEvents")} showNewCase={false} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 48 }}>
        <SectionHeader title={t("droppedEvents")} />
        <Text style={{ color: colors.textMuted, fontSize: 12, marginBottom: 12, lineHeight: 17 }}>
          {t("droppedEventsSubtitle")}
        </Text>

        {dropped !== null && dropped.length === 0 && (
          <Card>
            <Text style={{ color: colors.textMuted, fontSize: 13, padding: 16 }}>
              {t("droppedEventsEmpty")}
            </Text>
          </Card>
        )}

        {dropped !== null && dropped.length > 0 && (
          <>
            <Card>
              {dropped.map((item, i) => (
                <SettingsRow
                  key={`${item.caseId}-${String(item.event.id ?? i)}-${item.droppedAt}`}
                  label={eventLabel(item.event)}
                  subtitle={`${eventTime(item.event)}  ·  ${t("droppedEventsRejected")} HTTP ${item.status}  ·  ${new Date(item.droppedAt).toLocaleString()}`}
                  last={i === dropped.length - 1}
                />
              ))}
            </Card>
            <Card>
              <SettingsRow
                label={t("droppedEventsClear")}
                danger
                last
                onPress={clearList}
              />
            </Card>
          </>
        )}
      </ScrollView>
    </View>
  )
}
