"use client"
import { useEffect, useMemo, useState } from "react"
import { useOptionLibrary } from "@/hooks/useOptionLibrary"
import { resolveOptionPreferenceLabels } from "@lospor/core/option-contracts"

type Preferences = {
  intraopFavouriteDrugs?: string[]
  intraopFavouriteInfusions?: string[]
}

/**
 * Favourite bolus drugs and infusions, as chosen in settings.
 *
 * Stored server-side on the user (`/api/user` → `preferences`), which is what
 * lets the phone and the browser show the same shortlist. Mirrors mobile's
 * `use-intraop-favourites.ts` — same source, same shape, deliberately.
 */
export function useIntraopFavourites() {
  const [drugPreferences, setDrugPreferences] = useState<string[]>([])
  const [infusionPreferences, setInfusionPreferences] = useState<string[]>([])
  const { options: drugs } = useOptionLibrary("INTRAOP_DRUG")
  const { options: infusions } = useOptionLibrary("INTRAOP_INFUSION")

  useEffect(() => {
    let cancelled = false
    fetch("/api/user", { cache: "no-store" })
      .then(res => (res.ok ? res.json() : null))
      .then((data: { preferences?: Preferences } | null) => {
        if (cancelled || !data) return
        setDrugPreferences(data.preferences?.intraopFavouriteDrugs ?? [])
        setInfusionPreferences(
          data.preferences?.intraopFavouriteInfusions ?? [],
        )
      })
      .catch(() => {
        // Favourites are a convenience — the full library is still reachable.
      })
    return () => { cancelled = true }
  }, [])

  const favouriteDrugs = useMemo(
    () => resolveOptionPreferenceLabels(
      "INTRAOP_DRUG",
      drugs,
      drugPreferences,
    ),
    [drugPreferences, drugs],
  )
  const favouriteInfusions = useMemo(
    () => resolveOptionPreferenceLabels(
      "INTRAOP_INFUSION",
      infusions,
      infusionPreferences,
    ),
    [infusionPreferences, infusions],
  )
  return { favouriteDrugs, favouriteInfusions }
}
