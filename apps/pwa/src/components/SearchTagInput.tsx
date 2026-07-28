import { useCallback, useEffect, useRef, useState } from "react"
import {
  ActivityIndicator,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native"
import { apiJson } from "@/lib/api"
import { usePreferences } from "@/lib/preferences-context"
import { Chip } from "@/components/ui"
import { colors, withAlpha } from "@/theme/colors"
import {
  CLINICAL_SEARCH_MIN_LENGTH,
  parseClinicalSearchResults,
  type CanonicalSearchTag,
  type ClinicalSearchKind,
} from "@lospor/core/search"

export type TagItem = CanonicalSearchTag

type Props = {
  label: string
  value: TagItem[]
  onChange: (v: TagItem[]) => void
  endpoint: string
  kind: ClinicalSearchKind
  queryParam?: string
  extraParams?: Record<string, string>
  placeholder?: string
  maxItems?: number
  onFocus?: () => void
  required?: boolean
  error?: string
}

export function SearchTagInput({
  label,
  value,
  onChange,
  endpoint,
  kind,
  queryParam = "q",
  extraParams = {},
  placeholder = "Search...",
  maxItems,
  onFocus,
  required = false,
  error,
}: Props) {
  const { language, t } = usePreferences()
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<TagItem[]>([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const minQueryLength = CLINICAL_SEARCH_MIN_LENGTH[kind]

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [])

  const search = useCallback((q: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    const trimmed = q.trim()
    if (trimmed.length < minQueryLength) {
      setResults([])
      setLoading(false)
      return
    }

    debounceRef.current = setTimeout(async () => {
      setLoading(true)
      try {
        const mergedParams: Record<string, string> = {
          [queryParam]: trimmed,
          ...extraParams,
        }
        if (kind === "icd10") mergedParams.locale = language
        const params = new URLSearchParams(mergedParams)
        const data = await apiJson<unknown>(`${endpoint}?${params}`)
        setResults(parseClinicalSearchResults(kind, data, language))
      } catch {
        setResults([])
      } finally {
        setLoading(false)
      }
    }, 300)
  }, [endpoint, queryParam, extraParams, language, kind, minQueryLength])

  function handleChange(q: string) {
    setQuery(q)
    setOpen(true)
    search(q)
  }

  function addItem(item: TagItem) {
    if (value.some((v) => (v.code || v.label) === (item.code || item.label))) return
    if (maxItems && value.length >= maxItems) return
    onChange([...value, item])
    setQuery("")
    setResults([])
    if (maxItems && value.length + 1 >= maxItems) setOpen(false)
  }

  function closeSearch() {
    setOpen(false)
    setQuery("")
    setResults([])
    setLoading(false)
  }

  function removeItem(code: string) {
    onChange(value.filter((v) => (v.code || v.label) !== code))
  }

  const canAdd = !maxItems || value.length < maxItems
  const visibleResults = results.slice(0, 12)

  return (
    <View style={{ marginBottom: 16, zIndex: open ? 20 : 1 }}>
      <Text style={{ color: colors.textSecondary, fontSize: 14, marginBottom: 6 }}>
        {label}{required && <Text style={{ color: colors.danger }}> *</Text>}
      </Text>

      {value.length > 0 ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", marginBottom: 8 }}>
          {value.map((item, idx) => (
            <Chip key={`${item.code || item.label}-${idx}`} label={item.label} onRemove={() => removeItem(item.code || item.label)} />
          ))}
        </View>
      ) : null}

      {canAdd ? (
        <View>
          <View
            style={{
              minHeight: 50,
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
              backgroundColor: colors.surface,
              borderWidth: 1,
              borderColor: open ? withAlpha(colors.primary, "88") : colors.border,
              borderRadius: 14,
              borderCurve: "continuous",
              paddingHorizontal: 14,
            }}
          >
            <TextInput
              style={{ flex: 1, color: colors.textPrimary, fontSize: 16, paddingVertical: 12 }}
              placeholderTextColor={colors.textMuted}
              placeholder={value.length === 0 ? placeholder : t("addMore")}
              value={query}
              onFocus={() => { setOpen(true); onFocus?.() }}
              onChangeText={handleChange}
              autoCapitalize="none"
              returnKeyType="search"
            />
            {open || query.length > 0 ? (
              <TouchableOpacity onPress={closeSearch} style={{ paddingHorizontal: 4, paddingVertical: 6 }}>
                <Text style={{ color: colors.textSecondary, fontSize: 13, fontWeight: "900" }}>{t("done")}</Text>
              </TouchableOpacity>
            ) : null}
          </View>

          {open ? (
            <View
              style={{
                marginTop: 8,
                maxHeight: 280,
                backgroundColor: colors.surfaceRaised,
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: 16,
                borderCurve: "continuous",
                overflow: "hidden",
                boxShadow: "0 16px 34px rgba(0,0,0,0.30)",
              }}
            >
              {loading ? (
                <View style={{ alignItems: "center", paddingVertical: 22 }}>
                  <ActivityIndicator color={colors.primary} />
                </View>
              ) : null}

              {!loading && query.trim().length < minQueryLength ? (
                <View style={{ padding: 14 }}>
                  <Text style={{ color: colors.textMuted, fontSize: 13, fontWeight: "800" }}>
                    {t("typeAtLeast2").replace("2", String(minQueryLength))}
                  </Text>
                </View>
              ) : null}

              {!loading && query.trim().length >= minQueryLength && visibleResults.length === 0 ? (
                <View style={{ padding: 14 }}>
                  <Text style={{ color: colors.textMuted, fontSize: 13, fontWeight: "800" }}>{t("noResultsFor")} "{query}"</Text>
                </View>
              ) : null}

              {visibleResults.length > 0 ? (
                <ScrollView keyboardShouldPersistTaps="handled" nestedScrollEnabled showsVerticalScrollIndicator={false}>
                  {visibleResults.map((item, idx) => {
                    const selected = value.some((v) => (v.code || v.label) === (item.code || item.label))
                    return (
                      <TouchableOpacity
                        key={`${item.code || item.label}-${idx}`}
                        style={{
                          paddingHorizontal: 14,
                          paddingVertical: 12,
                          borderBottomWidth: idx < visibleResults.length - 1 ? 1 : 0,
                          borderBottomColor: colors.border,
                          flexDirection: "row",
                          justifyContent: "space-between",
                          alignItems: "center",
                          opacity: selected ? 0.4 : 1,
                        }}
                        onPress={() => !selected && addItem(item)}
                        disabled={selected}
                      >
                        <View style={{ flex: 1, marginRight: 12 }}>
                          <Text style={{ color: colors.textPrimary, fontSize: 14, fontWeight: "800" }}>{item.label}</Text>
                          {item.sub || (item.code && item.code !== item.label) ? (
                            <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }}>{item.sub ?? item.code}</Text>
                          ) : null}
                        </View>
                        {selected ? <Text style={{ color: colors.primary, fontSize: 12, fontWeight: "900" }}>{t("addedLabel")}</Text> : null}
                      </TouchableOpacity>
                    )
                  })}
                </ScrollView>
              ) : null}
            </View>
          ) : null}
        </View>
      ) : null}
      {error ? <Text style={{ color: colors.danger, fontSize: 12, marginTop: 4 }}>{error}</Text> : null}
    </View>
  )
}
