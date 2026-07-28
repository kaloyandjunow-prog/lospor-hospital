import { useEffect, useState } from "react"
import {
  View, Text, ScrollView, TouchableOpacity,
  TextInput,
} from "react-native"
import { useLocalSearchParams, useRouter, Stack } from "expo-router"
import { apiFetch, apiJson } from "@/lib/api"
import { notify } from "@/lib/notify"
import { PrimaryButton } from "@/components/ui"
import { ScreenState } from "@/components/clinical-ui"
import { colors, withAlpha } from "@/theme/colors"
import { usePreferences } from "@/lib/preferences-context"

type Colleague = {
  id: string
  name: string
  title: string | null
  role: string
}

export default function HandoverScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const router  = useRouter()
  const { tc }  = usePreferences()

  const [colleagues, setColleagues] = useState<Colleague[]>([])
  const [loading, setLoading]       = useState(true)
  const [selected, setSelected]     = useState<string | null>(null)
  const [sending, setSending]       = useState(false)
  const [filter, setFilter]         = useState("")
  const selectedColleague = colleagues.find(c => c.id === selected)

  useEffect(() => {
    apiJson<Colleague[]>("/api/users/colleagues")
      .then(setColleagues)
      .catch((err: Error) => notify(tc("errorLabel"), err.message))
      .finally(() => setLoading(false))
  }, [tc])

  const filtered = filter.trim().length > 0
    ? colleagues.filter(c => c.name.toLowerCase().includes(filter.toLowerCase()))
    : colleagues

  async function send() {
    if (!selected) return
    setSending(true)
    try {
      const res = await apiFetch(`/api/cases/${id}/transfer`, {
        method: "POST",
        body: JSON.stringify({ toUserId: selected }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? "Transfer failed")
      }
      const result = await res.json()
      if (result.instant) {
        notify(tc("handoverTransferred"), tc("handoverTransferMsg"))
        router.replace("/(app)")
      } else {
        notify(tc("handoverSent"), tc("handoverSentMsg"))
        router.back()
      }
    } catch (err) {
      notify(tc("errorLabel"), err instanceof Error ? err.message : tc("handoverError"))
    } finally {
      setSending(false)
    }
  }

  return (
    <>
      <Stack.Screen options={{ title: tc("handoverTitle") }} />
      <View style={{ flex: 1, backgroundColor: colors.background }}>

        {/* Search */}
        <View style={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: colors.border }}>
          <View style={{ backgroundColor: colors.surfaceRaised, borderRadius: 16, borderCurve: "continuous", borderWidth: 1, borderColor: withAlpha(colors.warning, "66"), padding: 14, marginBottom: 12 }}>
            <Text style={{ color: colors.warning, fontSize: 11, fontWeight: "900", letterSpacing: 1, textTransform: "uppercase", marginBottom: 4 }}>
              {tc("handoverSubtitle")}
            </Text>
            <Text style={{ color: colors.textPrimary, fontSize: 16, fontWeight: "800" }}>
              {tc("handoverInstruction")}
            </Text>
            <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 5 }}>
              {tc("handoverNote")}
            </Text>
          </View>
          <TextInput
            style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 14, borderCurve: "continuous", paddingHorizontal: 14, paddingVertical: 12, color: colors.textPrimary, fontSize: 15 }}
            placeholderTextColor={colors.textMuted}
            placeholder={tc("handoverSearch")}
            value={filter}
            onChangeText={setFilter}
            autoCapitalize="none"
          />
        </View>

        {loading ? (
          <ScreenState title={tc("handoverLoading")} loading />
        ) : filtered.length === 0 ? (
          <ScreenState
            title={filter ? tc("handoverNoMatch") : tc("handoverNone")}
            message={filter ? `No colleagues matching "${filter}".` : "No colleagues were found in your institution."}
          />
        ) : (
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, gap: 10 }}>
            {filtered.map((c) => {
              const isSelected = selected === c.id
              const initials = c.name.split(" ").map((n: string) => n[0]).slice(0, 2).join("")
              return (
                <TouchableOpacity
                  key={c.id}
                  onPress={() => setSelected(isSelected ? null : c.id)}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    padding: 14,
                    borderRadius: 16,
                    borderCurve: "continuous",
                    borderWidth: 1,
                    borderColor: isSelected ? colors.warning : colors.border,
                    backgroundColor: isSelected ? withAlpha(colors.warning, "1F") : colors.surfaceRaised,
                  }}
                >
                  <View
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 15,
                      borderCurve: "continuous",
                      alignItems: "center",
                      justifyContent: "center",
                      marginRight: 12,
                      backgroundColor: isSelected ? colors.warning : colors.surface,
                      borderWidth: 1,
                      borderColor: isSelected ? colors.warning : colors.border,
                    }}
                  >
                    <Text style={{ color: isSelected ? colors.background : colors.textPrimary, fontSize: 14, fontWeight: "900" }}>
                      {initials}
                    </Text>
                  </View>

                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.textPrimary, fontSize: 16, fontWeight: "800" }}>
                      {c.title ? `${c.title} ${c.name}` : c.name}
                    </Text>
                    <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 3, textTransform: "capitalize" }}>
                      {c.role.replace(/_/g, " ").toLowerCase()}
                    </Text>
                  </View>

                  {isSelected && (
                    <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: colors.warning, alignItems: "center", justifyContent: "center" }}>
                      <Text style={{ color: colors.background, fontSize: 13, fontWeight: "900" }}>✓</Text>
                    </View>
                  )}
                </TouchableOpacity>
              )
            })}
          </ScrollView>
        )}

        {/* Bottom action */}
        {selected && (
          <View style={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: 16, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.surface }}>
            <View style={{ marginBottom: 10, alignItems: "center" }}>
              <Text style={{ color: colors.textMuted, fontSize: 12, fontWeight: "800", textTransform: "uppercase", letterSpacing: 1 }}>
                Send handover to
              </Text>
              <Text style={{ color: colors.textPrimary, fontSize: 15, fontWeight: "900", marginTop: 3, textAlign: "center" }}>
                {selectedColleague?.title ? `${selectedColleague.title} ${selectedColleague.name}` : selectedColleague?.name}
              </Text>
            </View>
            <PrimaryButton
              label={tc("handoverSendBtn")}
              color="amber"
              onPress={send}
              loading={sending}
            />
          </View>
        )}
      </View>
    </>
  )
}
