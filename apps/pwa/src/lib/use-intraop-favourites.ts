import { useMemo } from "react"
import { usePreferences } from "@/lib/preferences-context"
import { useOptionLibrary } from "@/lib/use-option-library"
import { resolveOptionPreferenceLabels } from "@lospor/core/option-contracts"

export function useIntraopFavourites() {
  const {
    intraopFavouriteDrugs,
    intraopFavouriteInfusions,
  } = usePreferences()
  const { options: drugs } = useOptionLibrary("INTRAOP_DRUG")
  const { options: infusions } = useOptionLibrary("INTRAOP_INFUSION")
  const favouriteDrugs = useMemo(
    () => resolveOptionPreferenceLabels(
      "INTRAOP_DRUG",
      drugs,
      intraopFavouriteDrugs,
    ),
    [drugs, intraopFavouriteDrugs],
  )
  const favouriteInfusions = useMemo(
    () => resolveOptionPreferenceLabels(
      "INTRAOP_INFUSION",
      infusions,
      intraopFavouriteInfusions,
    ),
    [infusions, intraopFavouriteInfusions],
  )
  return {
    favouriteDrugs,
    favouriteInfusions,
  }
}
