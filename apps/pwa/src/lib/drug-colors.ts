import { useMemo } from "react"
import { drugGroupColorHex } from "@lospor/core/catalog"
import { drugColorTones } from "@lospor/core/drug-colors"
import { MOBILE_DRUG_CAT_COLOR } from "@/lib/intraop-constants"
import { useOptionLibrary, type LibraryOption } from "@/lib/use-option-library"
import type { ColorScheme } from "@/theme/colors"
import { shadeFor } from "@/theme/shade"
import { useThemeScheme } from "@/theme/theme-context"

/**
 * Each drug's colour as it is drawn now (10.0.0): the hospital's own, chosen
 * in Status, else the bundled one. A drug's bolus and its infusion share the
 * hospital's colour. The chart reads these rather than the colour an event was
 * saved with, so every case, an earlier one too, shows the colours in use.
 */
export type CurrentDrugColors = {
  /** A bolus drug's colour; undefined for a drug the library does not have. */
  drug: (name: string) => string | undefined
  /** An infusion's colour; undefined for one the library does not have. */
  infusion: (name: string) => string | undefined
  /** A drug group's colour, for the menus' group pills. */
  group: (category: string) => string
}

/**
 * A hospital colour in the theme in use: its text tone, readable on the
 * chart's tinted pills (Core works it out for any colour, so a pale one is
 * darkened for the light theme rather than run through the shade table).
 */
export function customDrugTone(hex: string, scheme: ColorScheme): string {
  const tones = drugColorTones(hex)
  return scheme === "light" ? tones.light.text : tones.dark.text
}

export function currentDrugColors(
  drugs: readonly LibraryOption[],
  infusions: readonly LibraryOption[],
  scheme: ColorScheme,
): CurrentDrugColors {
  const shade = (hex: string) => shadeFor(scheme, hex)
  const tone = (hex: string) => customDrugTone(hex, scheme)
  const groups = new Map<string, string>()
  for (const option of [...drugs, ...infusions]) {
    if (option.group && option.customGroupColor && !groups.has(option.group)) groups.set(option.group, tone(option.customGroupColor))
  }
  const group = (category: string) =>
    groups.get(category) ?? shade(drugGroupColorHex(category) ?? MOBILE_DRUG_CAT_COLOR[category] ?? "#64748b")
  const drugMap = new Map<string, string>()
  for (const option of drugs) {
    if (!drugMap.has(option.label)) drugMap.set(option.label, option.customColor ? tone(option.customColor) : group(option.group ?? "Other"))
  }
  const infusionMap = new Map<string, string>()
  for (const option of infusions) {
    if (!infusionMap.has(option.label)) infusionMap.set(option.label, option.customColor ? tone(option.customColor) : option.color ?? shade("#64748b"))
  }
  return { drug: name => drugMap.get(name), infusion: name => infusionMap.get(name), group }
}

export function useCurrentDrugColors(): CurrentDrugColors {
  const { options: drugs } = useOptionLibrary("INTRAOP_DRUG")
  const { options: infusions } = useOptionLibrary("INTRAOP_INFUSION")
  const scheme = useThemeScheme()
  return useMemo(() => currentDrugColors(drugs, infusions, scheme), [drugs, infusions, scheme])
}
