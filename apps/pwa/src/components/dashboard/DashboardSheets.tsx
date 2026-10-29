import { Modal, ScrollView, Text, TextInput, TouchableOpacity, View } from "react-native"
import type { Href } from "expo-router"
import type { TranslationKey } from "@/lib/preferences-context"
import { colors } from "@/theme/colors"

type FilterKind = "theatre" | "assignee"
type FilterOption = { id: string; name: string }
type SearchResult = { id: string; label: string; caseCode: string; status: string; href: Href }

export function DashboardSheets({ filterSheet, filterOptions, currentFilter, onCloseFilter, onSelectFilter, searchOpen, query, setQuery, onCloseSearch, searchResults, onOpenResult, t }: {
  filterSheet: FilterKind | null
  filterOptions: FilterOption[]
  currentFilter: string | null
  onCloseFilter: () => void
  onSelectFilter: (id: string) => void
  searchOpen: boolean
  query: string
  setQuery: (value: string) => void
  onCloseSearch: () => void
  searchResults: SearchResult[]
  onOpenResult: (href: Href) => void
  t: (key: TranslationKey) => string
}) {
  return <>
    <Modal visible={filterSheet !== null} transparent animationType="fade" onRequestClose={onCloseFilter}>
      <TouchableOpacity style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "flex-end" }} onPress={onCloseFilter} activeOpacity={1}>
        <View style={{ backgroundColor: colors.surfaceRaised, borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingHorizontal: 20, paddingTop: 8, paddingBottom: 40 }} onStartShouldSetResponder={() => true}>
          <View style={{ width: 38, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: "center", marginBottom: 16 }} />
          <Text style={{ color: colors.textPrimary, fontSize: 15, fontWeight: "800", marginBottom: 12 }}>{filterSheet === "theatre" ? t("filterTheatre") : t("filterAnaesthesiologist")}</Text>
          <ScrollView testID="filter-sheet" style={{ maxHeight: 380 }} showsVerticalScrollIndicator={false}>{filterOptions.map(item => { const current = (currentFilter ?? "") === item.id; return <TouchableOpacity key={item.id || "all"} accessibilityRole="button" style={{ paddingVertical: 14, borderTopWidth: 1, borderTopColor: colors.border, flexDirection: "row", justifyContent: "space-between", alignItems: "center" }} onPress={() => onSelectFilter(item.id)}><Text style={{ color: current ? colors.primary : colors.textPrimary, fontSize: 15, fontWeight: current ? "800" : "600" }}>{item.name}</Text>{current ? <Text style={{ color: colors.primary, fontSize: 15, fontWeight: "800" }}>✓</Text> : null}</TouchableOpacity> })}</ScrollView>
        </View>
      </TouchableOpacity>
    </Modal>
    <Modal visible={searchOpen} transparent animationType="fade" onRequestClose={onCloseSearch}>
      <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-start" }}>
        <View style={{ backgroundColor: colors.surfaceRaised, borderBottomLeftRadius: 22, borderBottomRightRadius: 22, paddingTop: 60, paddingHorizontal: 20, paddingBottom: 20 }}>
          <Text style={{ color: colors.textPrimary, fontSize: 18, fontWeight: "900", marginBottom: 12 }}>{t("searchCases")}</Text>
          <TextInput autoFocus value={query} onChangeText={setQuery} placeholder={t("searchCasesPlaceholder")} placeholderTextColor={colors.textMuted} style={{ backgroundColor: colors.surface, color: colors.textPrimary, borderWidth: 1, borderColor: colors.border, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 11, fontSize: 14, marginBottom: 12 }} />
          {query.trim().length > 0 && <ScrollView style={{ maxHeight: 380 }} keyboardShouldPersistTaps="handled">{searchResults.map(result => <TouchableOpacity key={result.id} onPress={() => { onCloseSearch(); onOpenResult(result.href) }} style={{ paddingVertical: 12, borderTopWidth: 1, borderTopColor: colors.border }}><Text style={{ color: colors.textPrimary, fontSize: 14, fontWeight: "700" }} numberOfLines={1}>{result.label}</Text><Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }}>{result.caseCode} · {result.status}</Text></TouchableOpacity>)}{searchResults.length === 0 && <Text style={{ color: colors.textMuted, fontSize: 14, paddingVertical: 16, textAlign: "center" }}>{t("noCasesFound")}</Text>}</ScrollView>}
          <TouchableOpacity style={{ marginTop: 10, paddingVertical: 12, alignItems: "center", borderRadius: 12, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }} onPress={onCloseSearch}><Text style={{ color: colors.textSecondary, fontSize: 15, fontWeight: "700" }}>{query.trim() ? t("showInDashboard") : t("cancel")}</Text></TouchableOpacity>
        </View>
        <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={onCloseSearch} />
      </View>
    </Modal>
  </>
}
