"use client"

import { useSyncExternalStore } from "react"

import {
  applyClinicalPreferencesPatch,
  combineClinicalPreferencesPatches,
  mergeClinicalPreferences,
  normalizeClinicalPreferences,
  parseClinicalPreferencesPatch,
  type ClinicalPreferences,
  type ClinicalPreferencesPatch,
} from "@lospor/core/clinical-preferences"
import { setBulgarianNameSwitches } from "@lospor/core/display"
import { readCaseLayout } from "./case-layout"
import { CLINICAL_PREFERENCES_SNAPSHOT_KEY as SNAPSHOT_KEY } from "./bulgarian-names-web"
const DIRTY_KEY = "losporClinicalPreferencesDirtyV1"
const OWNER_KEY = "losporClinicalPreferencesOwnerV1"
const QUARANTINE_KEY = "losporClinicalPreferencesQuarantineV1"
const LEGACY_KEYS = [
  "heightUnit",
  "weightUnit",
  "temperatureUnit",
  "etco2Unit",
  "defaultMonitoring",
  "autoFillVitals",
  "autoFillBP",
  "autoFillBackground",
  "cvpUnit",
  "caseSidebar",
  "preopLayout",
  "layoutMode",
  "postopLayout",
  "timetableLayout",
  "vitalsExpanded",
] as const

// The browser is shared in hospitals.  Do not let a local snapshot become the
// identity of whoever signs in next; the server account is the authority.
let activeOwnerId: string | null = null
let serverPreferencesRevision: number | null = null
let ownerEpoch = 0
const ownerListeners = new Set<() => void>()

export function getWebClinicalPreferencesOwner(): string | null {
  return activeOwnerId
}

export function subscribeWebClinicalPreferencesOwner(listener: () => void): () => void {
  ownerListeners.add(listener)
  return () => ownerListeners.delete(listener)
}

export function useWebClinicalPreferencesOwner(): string | null {
  return useSyncExternalStore(subscribeWebClinicalPreferencesOwner, getWebClinicalPreferencesOwner, () => null)
}

function notifyOwnerChanged(): void {
  ownerEpoch += 1
  for (const listener of ownerListeners) listener()
}

function currentOwner(epoch: number, ownerId: string): boolean {
  return ownerEpoch === epoch && activeOwnerId === ownerId
}

function clearStoredPreferenceValues(): void {
  localStorage.removeItem(SNAPSHOT_KEY)
  localStorage.removeItem(DIRTY_KEY)
  for (const key of LEGACY_KEYS) localStorage.removeItem(key)
}

function prepareOwner(ownerId: string): void {
  const storedOwner = localStorage.getItem(OWNER_KEY)
  if (storedOwner !== ownerId) {
    serverPreferencesRevision = null
    const oldSnapshot = localStorage.getItem(SNAPSHOT_KEY)
    const oldDirty = localStorage.getItem(DIRTY_KEY)
    if (oldSnapshot || oldDirty) {
      // Preserve the previous account's device copy without making it active
      // for the new account.  It can be recovered or discarded explicitly by
      // a later cache-management flow.
      localStorage.setItem(QUARANTINE_KEY, JSON.stringify({
        owner: storedOwner,
        snapshot: oldSnapshot,
        dirty: oldDirty,
      }))
    }
    clearStoredPreferenceValues()
  }
  localStorage.setItem(OWNER_KEY, ownerId)
  activeOwnerId = ownerId
}

export function setWebClinicalPreferencesOwner(ownerId: string | null): void {
  const previous = activeOwnerId
  if (!ownerId) {
    activeOwnerId = null
    serverPreferencesRevision = null
    clearStoredPreferenceValues()
    localStorage.removeItem(OWNER_KEY)
  } else {
    prepareOwner(ownerId)
  }
  if (previous !== activeOwnerId) notifyOwnerChanged()
}

export function clearWebClinicalPreferences(): void {
  if (typeof window === "undefined") return
  clearStoredPreferenceValues()
  localStorage.removeItem(OWNER_KEY)
  activeOwnerId = null
  serverPreferencesRevision = null
  notifyOwnerChanged()
}

function readPendingPatch(): ClinicalPreferencesPatch | null {
  const raw = localStorage.getItem(DIRTY_KEY)
  if (!raw || raw === "true") return null
  try {
    return combineClinicalPreferencesPatches(JSON.parse(raw))
  } catch {
    return null
  }
}

function writePendingPatch(patch: ClinicalPreferencesPatch): void {
  const pending = combineClinicalPreferencesPatches(
    readPendingPatch(),
    patch,
  )
  localStorage.setItem(DIRTY_KEY, JSON.stringify(pending))
}

function enabled(key: string): boolean {
  return localStorage.getItem(key) === "on"
}

function readSnapshotPatch(): ClinicalPreferencesPatch | null {
  try {
    const raw = localStorage.getItem(SNAPSHOT_KEY)
    return raw ? parseClinicalPreferencesPatch(JSON.parse(raw)) : null
  } catch {
    return null
  }
}

function readLegacyPatch(): ClinicalPreferencesPatch {
  const timetableLayout = localStorage.getItem("timetableLayout")
  const vitalsExpanded = localStorage.getItem("vitalsExpanded")
  return combineClinicalPreferencesPatches({
    heightUnit: localStorage.getItem("heightUnit"),
    weightUnit: localStorage.getItem("weightUnit"),
    temperatureUnit: localStorage.getItem("temperatureUnit"),
    etco2Unit: localStorage.getItem("etco2Unit"),
    cvpUnit: localStorage.getItem("cvpUnit"),
    defaultMonitoring: localStorage.getItem("defaultMonitoring"),
    autoFillVitals: enabled("autoFillVitals"),
    autoFillBP: enabled("autoFillBP"),
    autoFillBackground: enabled("autoFillBackground"),
    caseLayout: readCaseLayout(key => localStorage.getItem(key)),
    ...(timetableLayout === "expand" || timetableLayout === "scroll" ? { timetableLayout } : {}),
    ...(vitalsExpanded === "true" || vitalsExpanded === "false"
      ? { vitalsChartExpanded: vitalsExpanded === "true" }
      : {}),
  })
}

function readStoredPatch(): ClinicalPreferencesPatch {
  return combineClinicalPreferencesPatches(readSnapshotPatch(), readLegacyPatch())
}

export function readWebClinicalPreferences(): ClinicalPreferences {
  if (typeof window === "undefined") return normalizeClinicalPreferences({})
  if (!activeOwnerId || localStorage.getItem(OWNER_KEY) !== activeOwnerId) {
    return normalizeClinicalPreferences({})
  }
  return normalizeClinicalPreferences(readStoredPatch())
}

export function writeWebClinicalPreferences(
  preferences: ClinicalPreferences,
): void {
  if (typeof window === "undefined") return
  if (!activeOwnerId) return
  const normalized = normalizeClinicalPreferences(preferences)
  localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(normalized))
  setBulgarianNameSwitches(normalized.bulgarianNames)
  const values: Record<string, string> = {
    heightUnit: normalized.units.height,
    weightUnit: normalized.units.weight,
    temperatureUnit: normalized.units.temperature,
    etco2Unit: normalized.units.etco2,
    cvpUnit: normalized.units.cvp,
    defaultMonitoring: normalized.defaultMonitoring,
    autoFillVitals: normalized.autoFillVitals.enabled ? "on" : "off",
    autoFillBP:
      normalized.autoFillVitals.includeBloodPressure ? "on" : "off",
    autoFillBackground:
      normalized.autoFillVitals.backfillOnReopen ? "on" : "off",
    caseSidebar: normalized.caseLayout.sidebar ? "on" : "off",
    preopLayout: normalized.caseLayout.preop,
    layoutMode: normalized.caseLayout.intraop,
    postopLayout: normalized.caseLayout.postop,
    timetableLayout: normalized.timetableLayout,
    vitalsExpanded: normalized.vitalsChartExpanded ? "true" : "false",
  }
  for (const [key, value] of Object.entries(values)) {
    // A value that is already stored is no change, and a browser sends no storage event for one: sending it here
    // woke every listener of every key, several times a page load, to re-read what they already held (11.0).
    if (localStorage.getItem(key) === value) continue
    localStorage.setItem(key, value)
    window.dispatchEvent(new StorageEvent("storage", {
      key,
      newValue: value,
    }))
  }
}

async function pushPreferences(
  preferences: ClinicalPreferences | ClinicalPreferencesPatch,
  retryOnConflict = true,
  guard?: { epoch: number; ownerId: string },
): Promise<boolean> {
  if (guard && !currentOwner(guard.epoch, guard.ownerId)) return false
  try {
    const response = await fetch("/api/user", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        preferences,
        ...(serverPreferencesRevision != null
          ? { preferencesRevision: serverPreferencesRevision }
          : {}),
      }),
    })
    const data = await response.json().catch(() => null) as { preferencesRevision?: unknown } | null
    if (guard && !currentOwner(guard.epoch, guard.ownerId)) return false
    if (typeof data?.preferencesRevision === "number"
      && Number.isInteger(data.preferencesRevision)
      && data.preferencesRevision >= 0) {
      serverPreferencesRevision = data.preferencesRevision
    }
    if (response.status === 409 && retryOnConflict
      && typeof data?.preferencesRevision === "number") {
      // A normal settings edit is a patch, so it can be safely replayed on the
      // latest server revision without clobbering another device's unrelated
      // fields. Full legacy snapshots deliberately do not retry here.
      return pushPreferences(preferences, false, guard)
    }
    if (!response.ok) return false
    localStorage.removeItem(DIRTY_KEY)
    return true
  } catch {
    return false
  }
}

// Twenty-odd components ask for the preferences as they mount. They share one request: a caller that arrives while
// one is on its way gets that answer, so a page load is one /api/user call, not one per component (11.0).
let syncInFlight: Promise<ClinicalPreferences> | null = null
export function syncWebClinicalPreferences(): Promise<ClinicalPreferences> {
  if (!syncInFlight) {
    syncInFlight = runSyncWebClinicalPreferences().finally(() => { syncInFlight = null })
  }
  return syncInFlight
}

async function runSyncWebClinicalPreferences(): Promise<ClinicalPreferences> {
  const requestEpoch = ownerEpoch
  try {
    const response = await fetch("/api/user", { cache: "no-store" })
    if (!response.ok) {
      if (response.status === 401) setWebClinicalPreferencesOwner(null)
      return activeOwnerId ? readWebClinicalPreferences() : normalizeClinicalPreferences({})
    }
    const data = await response.json() as {
      id?: unknown
      preferences?: unknown
      preferencesRevision?: unknown
    }
    if (typeof data.id !== "string" || !data.id) {
      setWebClinicalPreferencesOwner(null)
      return normalizeClinicalPreferences({})
    }
    // A response from an account that was replaced while the request was in
    // flight must not adopt that account's preferences into the current tab.
    // The only permitted owner change here is the initial unauthenticated
    // bootstrap, when no owner has been established yet.
    if (ownerEpoch !== requestEpoch) {
      return activeOwnerId ? readWebClinicalPreferences() : normalizeClinicalPreferences({})
    }
    if (typeof data.preferencesRevision === "number"
      && Number.isInteger(data.preferencesRevision)
      && data.preferencesRevision >= 0) {
      serverPreferencesRevision = data.preferencesRevision
    }
    if (activeOwnerId !== data.id) setWebClinicalPreferencesOwner(data.id)
    const guard = { epoch: ownerEpoch, ownerId: data.id }
    const localPatch = readStoredPatch()
    const dirtyRaw = localStorage.getItem(DIRTY_KEY)
    const pending = readPendingPatch()
    const localIntent = dirtyRaw === "true" ? localPatch : pending
    const merged = localIntent
      ? applyClinicalPreferencesPatch(
          mergeClinicalPreferences(data.preferences, {}),
          localIntent,
        )
      : mergeClinicalPreferences(data.preferences, {})
    if (!currentOwner(guard.epoch, guard.ownerId)) return readWebClinicalPreferences()
    writeWebClinicalPreferences(merged)
    if (localIntent && !await pushPreferences(pending ?? localPatch, dirtyRaw !== "true", guard)) {
      if (!dirtyRaw && currentOwner(guard.epoch, guard.ownerId)) writePendingPatch(merged)
    }
    return merged
  } catch {
    return activeOwnerId ? readWebClinicalPreferences() : normalizeClinicalPreferences({})
  }
}

export async function patchWebClinicalPreferences(
  patch: ClinicalPreferencesPatch,
): Promise<ClinicalPreferences> {
  if (!activeOwnerId) await syncWebClinicalPreferences()
  if (!activeOwnerId) return normalizeClinicalPreferences({})
  const guard = { epoch: ownerEpoch, ownerId: activeOwnerId }
  const next = applyClinicalPreferencesPatch(
    readWebClinicalPreferences(),
    patch,
  )
  if (!currentOwner(guard.epoch, guard.ownerId)) return readWebClinicalPreferences()
  writeWebClinicalPreferences(next)
  writePendingPatch(patch)
  if (await pushPreferences(patch, true, guard)) {
    localStorage.removeItem(DIRTY_KEY)
  }
  return next
}
