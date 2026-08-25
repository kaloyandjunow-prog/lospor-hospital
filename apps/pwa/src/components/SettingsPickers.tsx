import { useEffect, useState } from "react"
import { ActivityIndicator, FlatList, Modal, Text, TextInput, TouchableOpacity, View } from "react-native"
import {
  optionMatchesPreference,
  optionPreferenceKey,
  type LibraryCategory,
} from "@lospor/core/option-contracts"
import { formatMessage } from "@/i18n/locale"
import { apiJson } from "@/lib/api"
import { displayClinicalCode, displayOption } from "@/lib/clinical-display"
import { usePreferences } from "@/lib/preferences-context"
import type { LibraryOption } from "@/lib/use-option-library"
import { colors } from "@/theme/colors"

export type Institution = { id: string; name: string; city: string }

export function InstitutionPicker({
  visible,
  current,
  onClose,
  onSelect,
  searchLabel,
}: {
  visible: boolean
  current?: Institution | null
  onClose: () => void
  onSelect: (inst: Institution | null) => void
  searchLabel: string
}) {
  const [query, setQuery] = useState("")
  const [all, setAll] = useState<Institution[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!visible) return
    setQuery("")
    setLoading(true)
    apiJson<Institution[]>("/api/institutions")
      .then(setAll)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [visible])

  const filtered = query.length >= 1
    ? all.filter(i => `${i.name} ${i.city}`.toLowerCase().includes(query.toLowerCase()))
    : all

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" }}>
        <View style={{
          backgroundColor: colors.surfaceRaised, borderTopLeftRadius: 22, borderTopRightRadius: 22,
          padding: 20, paddingBottom: 40, maxHeight: "80%",
        }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
            <Text style={{ color: colors.textPrimary, fontSize: 16, fontWeight: "700" }}>
              {searchLabel}
            </Text>
            <TouchableOpacity onPress={onClose}>
              <Text style={{ color: colors.textMuted, fontSize: 20 }}>×</Text>
            </TouchableOpacity>
          </View>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={searchLabel}
            placeholderTextColor={colors.textMuted}
            autoFocus
            style={{
              backgroundColor: colors.background, color: colors.textPrimary,
              borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10,
              fontSize: 14, borderWidth: 1, borderColor: colors.border, marginBottom: 12,
            }}
          />
          {loading ? (
            <ActivityIndicator color={colors.primary} style={{ marginTop: 24 }} />
          ) : (
            <FlatList
              data={filtered}
              keyExtractor={i => i.id}
              renderItem={({ item }) => {
                const selected = current?.id === item.id
                return (
                  <TouchableOpacity
                    onPress={() => onSelect(item)}
                    style={{
                      paddingVertical: 12, paddingHorizontal: 4,
                      borderBottomWidth: 1, borderBottomColor: colors.border,
                      flexDirection: "row", alignItems: "center", justifyContent: "space-between",
                    }}
                  >
                    <View>
                      <Text style={{ color: selected ? colors.primary : colors.textPrimary, fontSize: 14, fontWeight: selected ? "700" : "500" }}>
                        {item.name}
                      </Text>
                      <Text style={{ color: colors.textMuted, fontSize: 12 }}>{item.city}</Text>
                    </View>
                    {selected && <Text style={{ color: colors.primary, fontSize: 16 }}>✓</Text>}
                  </TouchableOpacity>
                )
              }}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            />
          )}
        </View>
      </View>
    </Modal>
  )
}

export function FavouritePicker({
  visible,
  title,
  category,
  options,
  selected,
  onClose,
  onSave,
}: {
  visible: boolean
  title: string
  category: LibraryCategory
  options: LibraryOption[]
  selected: string[]
  onClose: () => void
  onSave: (next: string[]) => void
}) {
  const { t, tc, language } = usePreferences()
  const [query, setQuery] = useState("")
  const [draft, setDraft] = useState<string[]>(selected)

  useEffect(() => {
    if (!visible) return
    setQuery("")
    setDraft(selected)
  }, [selected, visible])

  const filtered = query.trim()
    ? options.filter(o => `${o.label} ${displayOption(category, o, language)} ${o.group ?? ""} ${o.group ? displayClinicalCode("optionGroup", o.group, language, { label: o.group }) : ""}`.toLowerCase().includes(query.trim().toLowerCase()))
    : options

  function toggle(option: LibraryOption) {
    setDraft(previous => {
      const alreadySelected = previous.some(preference =>
        optionMatchesPreference(category, option, preference),
      )
      const withoutOption = previous.filter(preference =>
        !optionMatchesPreference(category, option, preference),
      )
      return alreadySelected
        ? withoutOption
        : previous.length >= 8
          ? previous
          : [...withoutOption, optionPreferenceKey(category, option)]
    })
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" }}>
        <View style={{
          backgroundColor: colors.surfaceRaised, borderTopLeftRadius: 22, borderTopRightRadius: 22,
          padding: 20, paddingBottom: 40, maxHeight: "86%",
        }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
            <View>
              <Text style={{ color: colors.textPrimary, fontSize: 16, fontWeight: "800" }}>{title}</Text>
              <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }}>{formatMessage(tc("selectedCount"), { count: `${draft.length}/8` })}</Text>
            </View>
            <TouchableOpacity onPress={onClose}>
              <Text style={{ color: colors.textMuted, fontSize: 20 }}>✕</Text>
            </TouchableOpacity>
          </View>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={t("searchPlaceholderShort")}
            placeholderTextColor={colors.textMuted}
            style={{
              backgroundColor: colors.background, color: colors.textPrimary,
              borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10,
              fontSize: 14, borderWidth: 1, borderColor: colors.border, marginBottom: 12,
            }}
          />
          <FlatList
            data={filtered}
            keyExtractor={item => item.id}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            renderItem={({ item }) => {
              const checked = draft.some(preference =>
                optionMatchesPreference(category, item, preference),
              )
              return (
                <TouchableOpacity
                  onPress={() => toggle(item)}
                  style={{
                    paddingVertical: 11,
                    borderBottomWidth: 1,
                    borderBottomColor: colors.border,
                    flexDirection: "row",
                    justifyContent: "space-between",
                    gap: 12,
                  }}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: checked ? colors.primary : colors.textPrimary, fontSize: 14, fontWeight: checked ? "800" : "500" }}>
                      {displayOption(category, item, language)}
                    </Text>
                    {item.group ? <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 1 }}>{displayClinicalCode("optionGroup", item.group, language, { label: item.group })}</Text> : null}
                  </View>
                  <Text style={{ color: checked ? colors.primary : colors.textMuted, fontSize: 16, fontWeight: "900" }}>
                    {checked ? t("selected") : "+"}
                  </Text>
                </TouchableOpacity>
              )
            }}
          />
          <TouchableOpacity
            onPress={() => onSave(draft)}
            style={{ marginTop: 14, paddingVertical: 14, borderRadius: 12, alignItems: "center", backgroundColor: colors.primary }}
          >
            <Text style={{ color: "#fff", fontWeight: "800" }}>{t("saveFavourites")}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  )
}
