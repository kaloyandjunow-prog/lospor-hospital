import { useCallback, useEffect, useState } from "react"
import { ScrollView, Text, TouchableOpacity, View } from "react-native"
import { ACCOUNT_COUNTRIES } from "@lospor/core/account"
import { ACCOUNT_COUNTRY_LABELS } from "@/i18n/account-options"
import type { TranslationKey } from "@/lib/preferences-context"
import { apiUrl } from "@/lib/api"
import { Chip, StyledInput } from "@/components/ui"

type Translate = (key: TranslationKey) => string

type Institution = {
  id: string
  name: string
  city: string
}

export function CountryPicker({
  value,
  onChange,
  language,
  t,
}: {
  value: string
  onChange: (country: string) => void
  language: "bg" | "en"
  t: Translate
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const normalizedQuery = query.trim().toLocaleLowerCase(language)
  const filtered = ACCOUNT_COUNTRIES.filter(country => {
    if (!normalizedQuery) return true
    const localized = ACCOUNT_COUNTRY_LABELS[language][country]
    return localized.toLocaleLowerCase(language).includes(normalizedQuery)
      || country.toLowerCase().includes(normalizedQuery)
  })

  function select(country: string) {
    onChange(country)
    setOpen(false)
    setQuery("")
  }

  return (
    <View>
      <TouchableOpacity
        onPress={() => setOpen(current => !current)}
        activeOpacity={0.75}
        style={{
          minHeight: 50,
          backgroundColor: "#1c1c1c",
          borderColor: open ? "#3b82f6" : "#2e2e2e",
          borderWidth: 1,
          borderRadius: 14,
          paddingHorizontal: 14,
          paddingVertical: 12,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <Text style={{ color: value ? "#f8fafc" : "#64748b", fontSize: 16 }}>
          {value
            ? ACCOUNT_COUNTRY_LABELS[language][value as keyof typeof ACCOUNT_COUNTRY_LABELS.en]
            : t("selectCountry")}
        </Text>
        <Text style={{ color: "#94a3b8", fontSize: 14 }}>{open ? "⌃" : "⌄"}</Text>
      </TouchableOpacity>

      {open && (
        <View
          style={{
            marginTop: 6,
            maxHeight: 260,
            backgroundColor: "#1c1c1c",
            borderColor: "#2e2e2e",
            borderWidth: 1,
            borderRadius: 14,
            overflow: "hidden",
          }}
        >
          <View style={{ padding: 8, borderBottomWidth: 1, borderBottomColor: "#2e2e2e" }}>
            <StyledInput
              placeholder={t("searchCountries")}
              value={query}
              onChangeText={setQuery}
              autoCapitalize="words"
              style={{ paddingVertical: 9 }}
            />
          </View>
          <ScrollView nestedScrollEnabled keyboardShouldPersistTaps="handled">
            {filtered.map(country => (
              <TouchableOpacity
                key={country}
                onPress={() => select(country)}
                style={{
                  paddingHorizontal: 14,
                  paddingVertical: 12,
                  borderBottomWidth: country === filtered[filtered.length - 1] ? 0 : 1,
                  borderBottomColor: "#2e2e2e",
                  backgroundColor: country === value ? "#172554" : "transparent",
                }}
              >
                <Text style={{ color: country === value ? "#60a5fa" : "#e2e8f0", fontSize: 15 }}>
                  {ACCOUNT_COUNTRY_LABELS[language][country]}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}
    </View>
  )
}

export function InstitutionPicker({
  country,
  value,
  onChange,
  t,
}: {
  country: string
  value: string | undefined
  onChange: (id: string | undefined) => void
  t: Translate
}) {
  const [institutions, setInstitutions] = useState<Institution[]>([])
  const [query, setQuery] = useState("")
  const [selectedName, setSelectedName] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadFailed, setLoadFailed] = useState(false)

  const loadInstitutions = useCallback(async () => {
    setLoading(true)
    setLoadFailed(false)
    try {
      const response = await fetch(apiUrl("/api/institutions"))
      if (!response.ok) throw new Error("institution-list-request-failed")
      const data: unknown = await response.json()
      if (!Array.isArray(data)) throw new Error("institution-list-invalid")
      setInstitutions(data as Institution[])
    } catch {
      setLoadFailed(true)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadInstitutions()
  }, [loadInstitutions])

  const otherInstitution = institutions.find(inst =>
    inst.name === "Other / Private" || inst.name === "Друго"
  )
  const availableInstitutions = country === "Bulgaria"
    ? institutions.filter(inst => inst.id !== otherInstitution?.id)
    : []
  const filtered = availableInstitutions.filter(inst =>
    !query
    || inst.name.toLowerCase().includes(query.toLowerCase())
    || inst.city.toLowerCase().includes(query.toLowerCase())
  )

  useEffect(() => {
    if (!country) return
    if (country === "Bulgaria") {
      if (value === otherInstitution?.id) {
        onChange(undefined)
        setSelectedName(null)
      }
      return
    }
    if (otherInstitution && value !== otherInstitution.id) {
      onChange(otherInstitution.id)
      setSelectedName(otherInstitution.name)
    }
  }, [country, onChange, otherInstitution, value])

  function select(inst: Institution) {
    onChange(inst.id)
    setSelectedName(inst.name)
    setQuery("")
  }

  function deselect() {
    onChange(undefined)
    setSelectedName(null)
    setQuery("")
  }

  if (country !== "Bulgaria") {
    return (
      <View
        style={{
          minHeight: 50,
          justifyContent: "center",
          backgroundColor: "#1c1c1c",
          borderColor: "#2e2e2e",
          borderWidth: 1,
          borderRadius: 14,
          paddingHorizontal: 14,
        }}
      >
        {loading ? (
          <Text style={{ color: "#94a3b8", fontSize: 15 }}>{t("institutionsLoading")}</Text>
        ) : loadFailed ? (
          <TouchableOpacity onPress={() => void loadInstitutions()}>
            <Text style={{ color: "#fca5a5", fontSize: 13 }}>{t("institutionsLoadFailed")}</Text>
            <Text style={{ color: "#60a5fa", fontSize: 13, marginTop: 4 }}>{t("retry")}</Text>
          </TouchableOpacity>
        ) : (
          <Text style={{ color: "#94a3b8", fontSize: 15 }}>
            {otherInstitution?.name ?? t("otherPrivateInstitution")}
          </Text>
        )}
      </View>
    )
  }

  return (
    <View>
      {loading ? (
        <Text style={{ color: "#94a3b8", fontSize: 13, marginBottom: 8 }}>{t("institutionsLoading")}</Text>
      ) : null}
      {loadFailed ? (
        <TouchableOpacity onPress={() => void loadInstitutions()} style={{ marginBottom: 8 }}>
          <Text style={{ color: "#fca5a5", fontSize: 13 }}>{t("institutionsLoadFailed")}</Text>
          <Text style={{ color: "#60a5fa", fontSize: 13, marginTop: 4 }}>{t("retry")}</Text>
        </TouchableOpacity>
      ) : null}
      {selectedName ? (
        <View className="flex-row flex-wrap">
          <Chip label={selectedName} onRemove={deselect} />
        </View>
      ) : (
        <>
          <StyledInput
            placeholder={t("searchInstitutionNameCity")}
            value={query}
            onChangeText={setQuery}
            autoCapitalize="none"
          />
          {query.length > 0 && (
            <View className="mt-1 bg-[#1c1c1c] border border-[#2e2e2e] rounded-xl overflow-hidden max-h-48">
              {filtered.length === 0 ? (
                <View className="px-4 py-3">
                  <Text className="text-slate-500 text-sm">{t("noResults")}</Text>
                </View>
              ) : (
                filtered.slice(0, 8).map((inst, idx) => (
                  <TouchableOpacity
                    key={inst.id}
                    onPress={() => select(inst)}
                    className={`px-4 py-3 ${idx < filtered.slice(0, 8).length - 1 ? "border-b border-[#2e2e2e]" : ""}`}
                  >
                    <Text className="text-white text-sm">{inst.name}</Text>
                    <Text className="text-slate-500 text-xs mt-0.5">{inst.city}</Text>
                  </TouchableOpacity>
                ))
              )}
            </View>
          )}
        </>
      )}
    </View>
  )
}
