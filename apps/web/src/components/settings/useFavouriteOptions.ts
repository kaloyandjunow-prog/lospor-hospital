import { useMemo, useState } from "react"
import { useOptionLibrary } from "@/hooks/useOptionLibrary"
import { patchWebClinicalPreferences } from "@/lib/clinical-preferences-web"
import { canonicalizeOptionPreferences, resolveOptionPreferenceLabels } from "@lospor/core/option-contracts"

/**
 * Intraop favourites. Server-side (not localStorage like the toggles) because
 * the whole point is that they follow the clinician onto the phone.
 */
export function useFavouriteOptions() {
  const { options: drugLibOpts } = useOptionLibrary("INTRAOP_DRUG")
  const { options: infusionLibOpts } = useOptionLibrary("INTRAOP_INFUSION")
  const favDrugOptions = useMemo(() => [...new Set(drugLibOpts.map(o => o.label))].sort(), [drugLibOpts])
  const favInfusionOptions = useMemo(() => [...new Set(infusionLibOpts.map(o => o.label))].sort(), [infusionLibOpts])
  const [favDrugs, setFavDrugs] = useState<string[]>([])
  const [favInfusions, setFavInfusions] = useState<string[]>([])
  const [favSaving, setFavSaving] = useState(false)
  const selectedFavDrugs = useMemo(() => resolveOptionPreferenceLabels("INTRAOP_DRUG", drugLibOpts, favDrugs), [drugLibOpts, favDrugs])
  const selectedFavInfusions = useMemo(() => resolveOptionPreferenceLabels("INTRAOP_INFUSION", infusionLibOpts, favInfusions), [infusionLibOpts, favInfusions])

  async function saveFavourites(
    key: "intraopFavouriteDrugs" | "intraopFavouriteInfusions",
    next: string[],
    apply: (v: string[]) => void,
  ) {
    const previous = key === "intraopFavouriteDrugs" ? favDrugs : favInfusions
    next = key === "intraopFavouriteDrugs"
      ? canonicalizeOptionPreferences("INTRAOP_DRUG", drugLibOpts, next)
      : canonicalizeOptionPreferences("INTRAOP_INFUSION", infusionLibOpts, next)
    apply(next)                     // optimistic — the list is small and local
    setFavSaving(true)
    try {
      await patchWebClinicalPreferences({ [key]: next })
    } catch {
      apply(previous)               // put it back rather than lie about saving
    } finally {
      setFavSaving(false)
    }
  }
  return { favDrugOptions, favInfusionOptions, favDrugs, setFavDrugs, favInfusions, setFavInfusions, favSaving, selectedFavDrugs, selectedFavInfusions, saveFavourites }
}
