"use client"

import { useCallback, useEffect, useRef } from "react"

/**
 * Fields whose change is a single deliberate act rather than a keystroke.
 *
 * Moved here from the form with the rule that reads it: the list only means
 * anything in the context of the delay it selects, and two files disagreeing
 * about which fields count as taps is a bug nobody would ever see.
 */
const DISCRETE_PREOP_FIELDS = new Set<string>([
  "sex", "asaScore", "mallampati", "cormackLehane", "neckMobility", "bloodType", "rhFactor",
  "clinicalMode", "ageUnit",
])

/**
 * How long to wait after a change before autosaving.
 *
 * A discrete tap — a pill, a toggle, a checkbox — is atomic: the value the user
 * meant is the value that is there the moment they lift their finger, so saving
 * almost immediately feels like the app keeping up. Typing is not atomic, and
 * saving on every keystroke would persist half-entered numbers, so it waits for
 * a pause.
 */
export function autosaveDelayMs(name: string | undefined, changedValue: unknown): number {
  const discrete = typeof changedValue === "boolean" || (!!name && DISCRETE_PREOP_FIELDS.has(name))
  return discrete ? 150 : 1500
}

/**
 * Whether there is enough in the form to be worth saving at all.
 *
 * A case with nothing but defaults in it should not create a record. Sex, an
 * age in either mode, or a diagnosis are the marks that somebody has actually
 * started, and any one of them is enough.
 */
export function worthAutosaving(values: {
  sex?: unknown
  ageYears?: number | null
  ageValue?: number | null
  diagnoses?: unknown[] | null
}): boolean {
  return Boolean(values.sex)
    || values.ageYears != null
    || values.ageValue != null
    || (values.diagnoses?.length ?? 0) > 0
}

type FormValues = Record<string, unknown>

/**
 * The preoperative form's autosave: debounce, in-flight tracking and flush.
 *
 * One hook because the three are one mechanism — the flush has to be able to
 * cancel the pending timer and adopt the in-flight promise, which means it has
 * to own both refs. Split across a component they were three pieces of state
 * that only made sense together.
 *
 * `flush` is what the AI advisor calls before reading the case back: consent is
 * a form field, and the read has to happen after it is persisted rather than
 * racing it.
 */
export function usePreopAutosave({
  watch,
  getValues,
  onAutoSave,
  disabled,
}: {
  watch: (cb: (values: FormValues, meta: { name?: string }) => void) => { unsubscribe: () => void }
  getValues: () => FormValues
  onAutoSave?: ((values: FormValues) => void | Promise<void>) | null
  disabled: boolean
}): { flush: () => Promise<void> } {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inFlightRef = useRef<Promise<void> | null>(null)

  const save = useCallback(() => {
    const promise = Promise.resolve(onAutoSave?.(getValues()) ?? undefined)
    inFlightRef.current = promise.finally(() => { inFlightRef.current = null }) as Promise<void>
    return inFlightRef.current
  }, [getValues, onAutoSave])

  useEffect(() => {
    if (!onAutoSave || disabled) return
    const subscription = watch((values, { name }) => {
      if (!worthAutosaving(values as Parameters<typeof worthAutosaving>[0])) return
      if (timerRef.current) clearTimeout(timerRef.current)
      const changed = name ? values[name] : undefined
      timerRef.current = setTimeout(() => {
        timerRef.current = null
        void save()
      }, autosaveDelayMs(name, changed))
    })
    return () => {
      subscription.unsubscribe()
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [disabled, onAutoSave, save, watch])

  const flush = useCallback((): Promise<void> => {
    if (disabled) return Promise.resolve()
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
      return save()
    }
    // Nothing pending: whatever is already on its way is what "flushed" means.
    return inFlightRef.current ?? Promise.resolve()
  }, [disabled, save])

  return { flush }
}
