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
import { Platform } from "react-native"
import { setColorScheme, type ColorScheme } from "@/theme/colors"
import { ThemeSchemeContext } from "@/theme/theme-context"
import { shadeFor } from "@/theme/shade"
import { CLINICAL_STRINGS, type ClinicalStringKey } from "@/i18n/clinical-strings"
import {
  DEFAULT_APP_LANGUAGE,
  isAppLanguage,
  type AppLanguage,
} from "@/i18n/locale"
import { STRINGS } from "@/i18n/strings"
import { useAuth } from "@/lib/auth-context"
import { setServerMessageLanguage } from "@/lib/server-message"
import {
  loadAuthenticatedLocale,
  saveAuthenticatedLocale,
} from "@/lib/account-locale"
import { loadApplianceDefaultLocale } from "@/lib/appliance-locale"
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
} from "@lospor/core/clinical-preferences"
import { setBulgarianNameSwitches } from "@lospor/core/display"

export type { AppLanguage } from "@/i18n/locale"
export type { HeightUnit, WeightUnit, TemperatureUnit, Etco2Unit, CvpUnit } from "./preferences-context-types"
import type { ClinicalStringsMap, PreferencesContextValue, TranslationKey } from "./preferences-context-types"

const PRE_AUTH_LANGUAGE_KEY = "lospor_pre_auth_locale_v1"
const LEGACY_LANGUAGE_KEY = "lospor_language"
const THEME_KEY = "lospor_theme"
const PREOP_LAYOUT_KEY = "lospor_preop_layout"

export type { ClinicalStringKey, TranslationKey }

const PreferencesContext = createContext<PreferencesContextValue | null>(null)

export function PreferencesProvider({
  children,
  initialLanguage = DEFAULT_APP_LANGUAGE,
}: {
  children: React.ReactNode
  /** Deterministic pre-effect value for isolated component hosts and tests. */
  initialLanguage?: AppLanguage
}) {
  const { state: authState } = useAuth()
  const [language, setLanguageState] = useState<AppLanguage>(initialLanguage)
  // Messages made outside React (API errors, autosave) follow the same language.
  useEffect(() => { setServerMessageLanguage(language) }, [language])
  const [localeReady, setLocaleReady] = useState(false)
  const [theme, setThemeState] = useState<ColorScheme>("dark")
  const [preopLayout, setPreopLayoutState] =
    useState<"sections" | "scroll">("scroll")
  const [clinicalPreferences, setClinicalPreferences] =
    useState<ClinicalPreferences>(DEFAULT_CLINICAL_PREFERENCES)
  const [clinicalPreferencesReady, setClinicalPreferencesReady] =
    useState(false)
  const clinicalRef = useRef(clinicalPreferences)
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve())
  const preAuthOverrideRef = useRef(false)
  const explicitLoginSelectionRef = useRef<AppLanguage | null>(null)
  const authenticatedLocaleSyncRef = useRef<Promise<void> | null>(null)

  const applyLanguage = useCallback((value: AppLanguage) => {
    setLanguageState(value)
    if (Platform.OS === "web" && typeof document !== "undefined") {
      document.documentElement.lang = value
    }
  }, [])

  const applyClinicalPreferences = useCallback((value: ClinicalPreferences) => {
    clinicalRef.current = value
    // Before the redraw, so every name drawn with these preferences follows the switches.
    setBulgarianNameSwitches(value.bulgarianNames)
    setClinicalPreferences(value)
  }, [])

  useEffect(() => {
    void Promise.all([
      SecureStore.getItemAsync(THEME_KEY),
      SecureStore.getItemAsync(PREOP_LAYOUT_KEY),
    ]).then(([storedTheme, storedLayout]) => {
      if (storedTheme === "dark" || storedTheme === "light") {
        setThemeState(storedTheme)
        setColorScheme(storedTheme)
      }
      if (storedLayout === "sections" || storedLayout === "scroll") {
        setPreopLayoutState(storedLayout)
      }
    }).catch(() => {})
  }, [])

  const loadPreAuthLanguage = useCallback(async () => {
    const [stored, legacy] = await Promise.all([
      SecureStore.getItemAsync(PRE_AUTH_LANGUAGE_KEY).catch(() => null),
      SecureStore.getItemAsync(LEGACY_LANGUAGE_KEY).catch(() => null),
    ])
    // A visible login-selector press made while storage or the appliance
    // default was loading is authoritative and must not be overwritten by the
    // older asynchronous result.
    if (preAuthOverrideRef.current) {
      setLocaleReady(true)
      return
    }
    const persisted = isAppLanguage(stored)
      ? stored
      : isAppLanguage(legacy)
        ? legacy
        : null
    if (persisted) {
      preAuthOverrideRef.current = true
      applyLanguage(persisted)
      setLocaleReady(true)
      return
    }
    const applianceDefault = await loadApplianceDefaultLocale()
    if (preAuthOverrideRef.current) {
      setLocaleReady(true)
      return
    }
    applyLanguage(applianceDefault)
    setLocaleReady(true)
  }, [applyLanguage])

  const syncAuthenticatedLanguage = useCallback((): Promise<void> => {
    if (authenticatedLocaleSyncRef.current) {
      return authenticatedLocaleSyncRef.current
    }

    const task = (async () => {
      const explicit = explicitLoginSelectionRef.current
      if (explicit) {
        // The visible login choice wins over an older account value and is
        // persisted to the account after authentication.
        applyLanguage(explicit)
        await saveAuthenticatedLocale(explicit)
        if (explicitLoginSelectionRef.current === explicit) {
          explicitLoginSelectionRef.current = null
        }
        return
      }

      const account = await loadAuthenticatedLocale()
      // A login-language press that happened while the server read was in
      // flight must not be overwritten by the stale response.
      const selectedWhileLoading = explicitLoginSelectionRef.current
      if (selectedWhileLoading) {
        applyLanguage(selectedWhileLoading)
        await saveAuthenticatedLocale(selectedWhileLoading)
        if (explicitLoginSelectionRef.current === selectedWhileLoading) {
          explicitLoginSelectionRef.current = null
        }
        return
      }
      applyLanguage(account.locale)
    })()

    const tracked = task.finally(() => {
      if (authenticatedLocaleSyncRef.current === tracked) {
        authenticatedLocaleSyncRef.current = null
      }
    })
    authenticatedLocaleSyncRef.current = tracked
    return tracked
  }, [applyLanguage])

  useEffect(() => {
    if (authState === "loading") return
    let active = true
    setLocaleReady(false)
    if (authState === "authenticated") {
      void syncAuthenticatedLanguage()
        .catch(() => {
          if (active) applyLanguage(DEFAULT_APP_LANGUAGE)
        })
        .finally(() => {
          if (active) setLocaleReady(true)
        })
    } else {
      void loadPreAuthLanguage().catch(() => {
        if (active) {
          applyLanguage(DEFAULT_APP_LANGUAGE)
          setLocaleReady(true)
        }
      })
    }
    return () => {
      active = false
    }
  }, [applyLanguage, authState, loadPreAuthLanguage, syncAuthenticatedLanguage])

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

  const setLanguage = useCallback(async (value: AppLanguage) => {
    applyLanguage(value)
    if (authState === "authenticated") {
      await saveAuthenticatedLocale(value)
      return
    }
    preAuthOverrideRef.current = true
    await SecureStore.setItemAsync(PRE_AUTH_LANGUAGE_KEY, value)
  }, [applyLanguage, authState])

  const selectLoginLanguage = useCallback(async (value: AppLanguage) => {
    explicitLoginSelectionRef.current = value
    preAuthOverrideRef.current = true
    applyLanguage(value)
    await SecureStore.setItemAsync(PRE_AUTH_LANGUAGE_KEY, value)
  }, [applyLanguage])

  const explicitLoginLanguage = useCallback(() => explicitLoginSelectionRef.current, [])

  const completeLoginLocaleSync = useCallback(async () => {
    setLocaleReady(false)
    try {
      await syncAuthenticatedLanguage()
    } finally {
      setLocaleReady(true)
    }
  }, [syncAuthenticatedLanguage])

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
    shade: (hex: string) => shadeFor(theme, hex),
    preopLayout,
    heightUnit: clinicalPreferences.units.height,
    weightUnit: clinicalPreferences.units.weight,
    temperatureUnit: clinicalPreferences.units.temperature,
    etco2Unit: clinicalPreferences.units.etco2,
    cvpUnit: clinicalPreferences.units.cvp,
    defaultMonitoring: clinicalPreferences.defaultMonitoring,
    autoFillVitalsPreferences: clinicalPreferences.autoFillVitals,
    intraopFavouriteDrugs: clinicalPreferences.intraopFavouriteDrugs,
    intraopFavouriteInfusions: clinicalPreferences.intraopFavouriteInfusions,
    bulgarianNames: clinicalPreferences.bulgarianNames,
    localeReady,
    clinicalPreferencesReady,
    setLanguage,
    selectLoginLanguage,
    explicitLoginLanguage,
    completeLoginLocaleSync,
    setTheme,
    setPreopLayout,
    setHeightUnit: unit => patchClinical({ units: { height: unit } }),
    setWeightUnit: unit => patchClinical({ units: { weight: unit } }),
    setTemperatureUnit: unit =>
      patchClinical({ units: { temperature: unit } }),
    setEtco2Unit: unit => patchClinical({ units: { etco2: unit } }),
    setCvpUnit: unit => patchClinical({ units: { cvp: unit } }),
    setDefaultMonitoring: defaultMonitoring =>
      patchClinical({ defaultMonitoring }),
    setAutoFillVitalsPreferences: autoFillVitals =>
      patchClinical({ autoFillVitals }),
    setIntraopFavouriteDrugs: intraopFavouriteDrugs =>
      patchClinical({ intraopFavouriteDrugs }),
    setIntraopFavouriteInfusions: intraopFavouriteInfusions =>
      patchClinical({ intraopFavouriteInfusions }),
    setBulgarianNames: bulgarianNames => patchClinical({ bulgarianNames }),
    t: key => STRINGS[language][key] ?? STRINGS.en[key],
    tc: key =>
      (CLINICAL_STRINGS[language] as ClinicalStringsMap)[key]
      ?? (CLINICAL_STRINGS.en as ClinicalStringsMap)[key]
      ?? key,
  }), [
    clinicalPreferences,
    clinicalPreferencesReady,
    completeLoginLocaleSync,
    explicitLoginLanguage,
    language,
    localeReady,
    patchClinical,
    preopLayout,
    selectLoginLanguage,
    setLanguage,
    theme,
  ])

  return (
    <PreferencesContext.Provider value={value}>
      <ThemeSchemeContext.Provider value={theme}>
        {children}
      </ThemeSchemeContext.Provider>
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
