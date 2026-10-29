import { useState } from "react"
import type { UseFormSetValue } from "react-hook-form"
import { FLACC_ITEMS, NIPS_ITEMS, PAED_ITEMS, type FlaccField, type NipsField, type PaedField } from "@lospor/core/postop-pain"
import type { PostopData } from "@/components/forms/postopSchema"
import type { AldreteKey } from "@/components/forms/postop/RecoveryScore"

type ScoredItem = FlaccField | NipsField | PaedField
export type ScoreField = AldreteKey | "stewardConsciousness" | "stewardAirway" | "stewardMovement" | ScoredItem | "fpsrScore" | "painScoreNRS"

/**
 * RHF is the source of truth, but a busy Controller can publish a browser
 * click one render later. Keep aggregates on the same immediate projection as
 * the click while still writing every value through RHF for save and submit.
 */
export function usePostopScoreProjection(defaultValues: Partial<PostopData> | undefined, setValue: UseFormSetValue<PostopData>) {
  const [projection, setProjection] = useState<Partial<Record<ScoreField, number | null>>>(() => {
    const keys = new Set<string>([
      "aldreteActivity", "aldreteRespiration", "aldreteCirculation", "aldreteConsciousness", "aldreteSpO2",
      "stewardConsciousness", "stewardAirway", "stewardMovement",
      ...FLACC_ITEMS.map(item => item.key), ...NIPS_ITEMS.map(item => item.key), ...PAED_ITEMS.map(item => item.key),
      "fpsrScore", "painScoreNRS",
    ])
    return Object.fromEntries(Object.entries(defaultValues ?? {}).filter(([key, value]) => keys.has(key) && value !== undefined)) as Partial<Record<ScoreField, number | null>>
  })

  const setScore = (key: ScoreField, value: number | null) => {
    setValue(key, value, { shouldDirty: true })
    setProjection(previous => ({ ...previous, [key]: value }))
  }
  const projected = <K extends ScoreField>(key: K, observed: number | null | undefined) =>
    Object.prototype.hasOwnProperty.call(projection, key) ? projection[key] : observed

  return { setScore, projected }
}
