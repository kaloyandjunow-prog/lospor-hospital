import { useRef, useSyncExternalStore } from "react"
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
  const initialProjection = (() => {
    const keys = new Set<string>([
      "aldreteActivity", "aldreteRespiration", "aldreteCirculation", "aldreteConsciousness", "aldreteSpO2",
      "stewardConsciousness", "stewardAirway", "stewardMovement",
      ...FLACC_ITEMS.map(item => item.key), ...NIPS_ITEMS.map(item => item.key), ...PAED_ITEMS.map(item => item.key),
      "fpsrScore", "painScoreNRS",
    ])
    return Object.fromEntries(Object.entries(defaultValues ?? {}).filter(([key, value]) => keys.has(key) && value !== undefined)) as Partial<Record<ScoreField, number | null>>
  })()
  const projectionRef = useRef(initialProjection)
  const listenersRef = useRef(new Set<() => void>())
  const subscribe = (listener: () => void) => {
    listenersRef.current.add(listener)
    return () => listenersRef.current.delete(listener)
  }
  const getSnapshot = () => projectionRef.current
  const projection = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)

  const setScore = (key: ScoreField, value: number | null) => {
    // Keep the merge synchronous as well as functional. Several real clicks can
    // arrive before React commits the previous render; reading a ref here
    // prevents the last click from being calculated from a stale projection.
    const next = { ...projectionRef.current, [key]: value }
    projectionRef.current = next
    setValue(key, value, { shouldDirty: true })
    listenersRef.current.forEach(listener => listener())
  }
  const projected = <K extends ScoreField>(key: K, observed: number | null | undefined) =>
    Object.prototype.hasOwnProperty.call(projection, key) ? projection[key] : observed

  return { setScore, projected }
}
