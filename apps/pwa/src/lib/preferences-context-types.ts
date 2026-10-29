// The preferences context's shape, split from preferences-context.tsx to keep
// that file within its size budget. Import these from preferences-context.
import type { ColorScheme } from "@/theme/colors"
import type { ClinicalStringKey } from "@/i18n/clinical-strings"
import type { AppLanguage } from "@/i18n/locale"
import type { STRINGS } from "@/i18n/strings"
import type { DefaultMonitoring } from "@lospor/core/clinical-preferences"
import type { AutoFillVitalsPreferences } from "@lospor/core/intraop-vitals"
import type { BulgarianNameSwitches } from "@lospor/core/display"

export type HeightUnit = "cm" | "in"
export type WeightUnit = "kg" | "lb"
export type TemperatureUnit = "C" | "F"
export type Etco2Unit = "mmHg" | "kPa"
// Entry unit for central venous pressure. Display only: the stored and exported
// value is mmHg whichever is chosen.
export type CvpUnit = "cmH2O" | "mmHg"

export type TranslationKey = keyof typeof STRINGS.en
export type ClinicalStringsMap = Record<ClinicalStringKey, string>

export type PreferencesContextValue = {
  language: AppLanguage
  theme: ColorScheme
  /** A colour written for dark, as the current theme shows it (see @/theme/shade). */
  shade: (hex: string) => string
  preopLayout: "sections" | "scroll"
  /** The postop screen's own (10.0.0); it followed the preop one before. */
  postopLayout: "sections" | "scroll"
  heightUnit: HeightUnit
  weightUnit: WeightUnit
  temperatureUnit: TemperatureUnit
  etco2Unit: Etco2Unit
  cvpUnit: CvpUnit
  defaultMonitoring: DefaultMonitoring
  autoFillVitalsPreferences: AutoFillVitalsPreferences
  intraopFavouriteDrugs: string[]
  intraopFavouriteInfusions: string[]
  /** Which catalogues show Bulgarian names (Settings → UI). */
  bulgarianNames: BulgarianNameSwitches
  localeReady: boolean
  clinicalPreferencesReady: boolean
  setLanguage: (language: AppLanguage) => Promise<void>
  selectLoginLanguage: (language: AppLanguage) => Promise<void>
  /** The language pressed on the login screen, if one was: only that is sent with the login. */
  explicitLoginLanguage: () => AppLanguage | null
  completeLoginLocaleSync: () => Promise<void>
  setTheme: (theme: ColorScheme) => Promise<void>
  setPreopLayout: (layout: "sections" | "scroll") => Promise<void>
  setPostopLayout: (layout: "sections" | "scroll") => Promise<void>
  setHeightUnit: (unit: HeightUnit) => Promise<void>
  setWeightUnit: (unit: WeightUnit) => Promise<void>
  setTemperatureUnit: (unit: TemperatureUnit) => Promise<void>
  setEtco2Unit: (unit: Etco2Unit) => Promise<void>
  setCvpUnit: (unit: CvpUnit) => Promise<void>
  setDefaultMonitoring: (value: DefaultMonitoring) => Promise<void>
  setAutoFillVitalsPreferences: (
    value: Partial<AutoFillVitalsPreferences>,
  ) => Promise<void>
  setIntraopFavouriteDrugs: (values: string[]) => Promise<void>
  setIntraopFavouriteInfusions: (values: string[]) => Promise<void>
  setBulgarianNames: (value: Partial<BulgarianNameSwitches>) => Promise<void>
  t: (key: TranslationKey) => string
  tc: (key: ClinicalStringKey) => string
}
