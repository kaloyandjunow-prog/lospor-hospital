import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import * as SecureStore from "expo-secure-store"
import { setColorScheme, type ColorScheme } from "@/theme/colors"
import { CLINICAL_STRINGS, type ClinicalStringKey } from "@/i18n/clinical-strings"
import { STRINGS } from "@/i18n/strings"
import { useAuth } from "@/lib/auth-context"
import {
  patchMobileClinicalPreferences,
  readMobileClinicalPreferences,
  syncMobileClinicalPreferences,
} from "@/lib/clinical-preferences-mobile"
import {
  applyClinicalPreferencesPatch,
  DEFAULT_CLINICAL_PREFERENCES,
  type ClinicalPreferences,
  type ClinicalPreferencesPatch,
  type DefaultMonitoring,
} from "@lospor/core/clinical-preferences"
import type { AutoFillVitalsPreferences } from "@lospor/core/intraop-vitals"

export type AppLanguage = "en" | "bg"
export type HeightUnit = "cm" | "in"
export type WeightUnit = "kg" | "lb"
export type TemperatureUnit = "C" | "F"
export type Etco2Unit = "mmHg" | "kPa"

const LANGUAGE_KEY = "lospor_language"
const THEME_KEY = "lospor_theme"
const PREOP_LAYOUT_KEY = "lospor_preop_layout"

type TranslationKey = keyof typeof STRINGS.en
type ClinicalStringsMap = Record<ClinicalStringKey, string>

type PreferencesContextValue = {
  language: AppLanguage
  theme: ColorScheme
  preopLayout: "sections" | "scroll"
  heightUnit: HeightUnit
  weightUnit: WeightUnit
  temperatureUnit: TemperatureUnit
  etco2Unit: Etco2Unit
  defaultMonitoring: DefaultMonitoring
  autoFillVitalsPreferences: AutoFillVitalsPreferences
  intraopFavouriteDrugs: string[]
  intraopFavouriteInfusions: string[]
  clinicalPreferencesReady: boolean
  setLanguage: (language: AppLanguage) => Promise<void>
  setTheme: (theme: ColorScheme) => Promise<void>
  setPreopLayout: (layout: "sections" | "scroll") => Promise<void>
  setHeightUnit: (unit: HeightUnit) => Promise<void>
  setWeightUnit: (unit: WeightUnit) => Promise<void>
  setTemperatureUnit: (unit: TemperatureUnit) => Promise<void>
  setEtco2Unit: (unit: Etco2Unit) => Promise<void>
  setDefaultMonitoring: (value: DefaultMonitoring) => Promise<void>
  setAutoFillVitalsPreferences: (
    value: Partial<AutoFillVitalsPreferences>,
  ) => Promise<void>
  setIntraopFavouriteDrugs: (values: string[]) => Promise<void>
  setIntraopFavouriteInfusions: (values: string[]) => Promise<void>
  t: (key: TranslationKey) => string
  tc: (key: ClinicalStringKey) => string
}

export type { ClinicalStringKey, TranslationKey }

const PreferencesContext = createContext<PreferencesContextValue | null>(null)

export function PreferencesProvider({ children }: { children: React.ReactNode }) {
  const { state: authState } = useAuth()
  const [language, setLanguageState] = useState<AppLanguage>("en")
  const [theme, setThemeState] = useState<ColorScheme>("dark")
  const [preopLayout, setPreopLayoutState] =
    useState<"sections" | "scroll">("scroll")
  const [clinicalPreferences, setClinicalPreferences] =
    useState<ClinicalPreferences>(DEFAULT_CLINICAL_PREFERENCES)
  const [clinicalPreferencesReady, setClinicalPreferencesReady] =
    useState(false)
  const clinicalRef = useRef(clinicalPreferences)
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve())

  const applyClinicalPreferences = useCallback((value: ClinicalPreferences) => {
    clinicalRef.current = value
    setClinicalPreferences(value)
  }, [])

  useEffect(() => {
    void Promise.all([
      SecureStore.getItemAsync(LANGUAGE_KEY),
      SecureStore.getItemAsync(THEME_KEY),
      SecureStore.getItemAsync(PREOP_LAYOUT_KEY),
    ]).then(([storedLanguage, storedTheme, storedLayout]) => {
      if (storedLanguage === "en" || storedLanguage === "bg") {
        setLanguageState(storedLanguage)
      }
      if (storedTheme === "dark" || storedTheme === "light") {
        setThemeState(storedTheme)
        setColorScheme(storedTheme)
      }
      if (storedLayout === "sections" || storedLayout === "scroll") {
        setPreopLayoutState(storedLayout)
      }
    }).catch(() => {})
  }, [])

  useEffect(() => {
    if (authState === "loading") return
    let active = true
    const load = authState === "authenticated"
      ? syncMobileClinicalPreferences()
      : readMobileClinicalPreferences()
    void load
      .then(preferences => {
        if (active) applyClinicalPreferences(preferences)
      })
      .catch(() => {})
      .finally(() => {
        if (active) setClinicalPreferencesReady(true)
      })
    return () => {
      active = false
    }
  }, [applyClinicalPreferences, authState])

  const patchClinical = useCallback((
    patch: ClinicalPreferencesPatch,
  ): Promise<void> => {
    const current = clinicalRef.current
    const next = applyClinicalPreferencesPatch(current, patch)
    applyClinicalPreferences(next)
    const save = saveQueueRef.current.then(async () => {
      await patchMobileClinicalPreferences(current, patch)
    })
    saveQueueRef.current = save.catch(() => {})
    return save
  }, [applyClinicalPreferences])

  async function setLanguage(value: AppLanguage) {
    setLanguageState(value)
    await SecureStore.setItemAsync(LANGUAGE_KEY, value)
  }

  async function setTheme(value: ColorScheme) {
    setThemeState(value)
    setColorScheme(value)
    await SecureStore.setItemAsync(THEME_KEY, value)
  }

  async function setPreopLayout(value: "sections" | "scroll") {
    setPreopLayoutState(value)
    await SecureStore.setItemAsync(PREOP_LAYOUT_KEY, value)
  }

  const value = useMemo<PreferencesContextValue>(() => ({
    language,
    theme,
    preopLayout,
    heightUnit: clinicalPreferences.units.height,
    weightUnit: clinicalPreferences.units.weight,
    temperatureUnit: clinicalPreferences.units.temperature,
    etco2Unit: clinicalPreferences.units.etco2,
    defaultMonitoring: clinicalPreferences.defaultMonitoring,
    autoFillVitalsPreferences: clinicalPreferences.autoFillVitals,
    intraopFavouriteDrugs: clinicalPreferences.intraopFavouriteDrugs,
    intraopFavouriteInfusions: clinicalPreferences.intraopFavouriteInfusions,
    clinicalPreferencesReady,
    setLanguage,
    setTheme,
    setPreopLayout,
    setHeightUnit: unit => patchClinical({ units: { height: unit } }),
    setWeightUnit: unit => patchClinical({ units: { weight: unit } }),
    setTemperatureUnit: unit =>
      patchClinical({ units: { temperature: unit } }),
    setEtco2Unit: unit => patchClinical({ units: { etco2: unit } }),
    setDefaultMonitoring: defaultMonitoring =>
      patchClinical({ defaultMonitoring }),
    setAutoFillVitalsPreferences: autoFillVitals =>
      patchClinical({ autoFillVitals }),
    setIntraopFavouriteDrugs: intraopFavouriteDrugs =>
      patchClinical({ intraopFavouriteDrugs }),
    setIntraopFavouriteInfusions: intraopFavouriteInfusions =>
      patchClinical({ intraopFavouriteInfusions }),
    t: key => STRINGS[language][key] ?? STRINGS.en[key],
    tc: key =>
      (CLINICAL_STRINGS[language] as ClinicalStringsMap)[key]
      ?? (CLINICAL_STRINGS.en as ClinicalStringsMap)[key]
      ?? key,
  }), [
    clinicalPreferences,
    clinicalPreferencesReady,
    language,
    patchClinical,
    preopLayout,
    theme,
  ])

  return (
    <PreferencesContext.Provider value={value}>
      {children}
    </PreferencesContext.Provider>
  )
}

export function usePreferences() {
  const context = useContext(PreferencesContext)
  if (!context) {
    throw new Error("usePreferences must be used inside PreferencesProvider")
  }
  return context
}
