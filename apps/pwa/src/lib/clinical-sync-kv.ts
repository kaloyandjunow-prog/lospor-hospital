import * as FileSystem from "expo-file-system/legacy"
import * as SecureStore from "expo-secure-store"
import { Platform } from "react-native"
import {
  DROPPED_EVENT_MUTATIONS_KEY,
  DROPPED_EVENTS_KEY,
  EVENT_MUTATION_INDEX_KEY,
  OUTBOX_INDEX_KEY,
  PENDING_EVENTS_INDEX_KEY,
  eventMutationKey,
  legacyOutboxPatchKey,
  outboxPatchKey,
  pendingEventsKey,
  type CaseSection,
  type KVAdapter,
} from "@lospor/core/sync"

const DIR = `${FileSystem.documentDirectory}clinical-sync/`
const SUFFIX = ".json"
const WEB_PREFIX = "lospor_clinical_sync:"

let ensureDirPromise: Promise<void> | null = null
let migrationPromise: Promise<void> | null = null

function pathFor(key: string): string {
  return `${DIR}${encodeURIComponent(key)}${SUFFIX}`
}

type BrowserStorage = {
  length: number
  key(index: number): string | null
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

function browserStorage(): BrowserStorage | null {
  return (globalThis as typeof globalThis & { localStorage?: BrowserStorage }).localStorage ?? null
}

function keyFromFile(name: string): string | null {
  if (!name.endsWith(SUFFIX)) return null
  try {
    return decodeURIComponent(name.slice(0, -SUFFIX.length))
  } catch {
    return null
  }
}

function ensureDir(): Promise<void> {
  if (Platform.OS === "web") return Promise.resolve()
  if (!ensureDirPromise) {
    ensureDirPromise = (async () => {
      const info = await FileSystem.getInfoAsync(DIR)
      if (!info.exists) await FileSystem.makeDirectoryAsync(DIR, { intermediates: true })
    })().catch((error) => {
      ensureDirPromise = null
      throw error
    })
  }
  return ensureDirPromise
}

async function readFile(key: string): Promise<string | null> {
  if (Platform.OS === "web") return browserStorage()?.getItem(`${WEB_PREFIX}${key}`) ?? null
  try {
    const path = pathFor(key)
    const info = await FileSystem.getInfoAsync(path)
    return info.exists ? await FileSystem.readAsStringAsync(path) : null
  } catch {
    return null
  }
}

async function writeFile(key: string, value: string): Promise<void> {
  if (Platform.OS === "web") {
    const storage = browserStorage()
    if (!storage) throw new Error("Browser storage is unavailable")
    storage.setItem(`${WEB_PREFIX}${key}`, value)
    return
  }
  await ensureDir()
  await FileSystem.writeAsStringAsync(pathFor(key), value)
}

async function deleteFile(key: string): Promise<void> {
  if (Platform.OS === "web") {
    browserStorage()?.removeItem(`${WEB_PREFIX}${key}`)
    return
  }
  await FileSystem.deleteAsync(pathFor(key), { idempotent: true }).catch(() => {})
}

async function migrateValue(key: string): Promise<string | null> {
  const fileValue = await readFile(key)
  if (fileValue !== null) {
    await SecureStore.deleteItemAsync(key).catch(() => {})
    return fileValue
  }
  const legacyValue = await SecureStore.getItemAsync(key).catch(() => null)
  if (legacyValue === null) return null
  await writeFile(key, legacyValue)
  await SecureStore.deleteItemAsync(key).catch(() => {})
  return legacyValue
}

function stringArray(raw: string | null): string[] {
  if (!raw) return []
  try {
    const value = JSON.parse(raw)
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []
  } catch {
    return []
  }
}

type OutboxIndexEntry = { caseId: string; section: CaseSection }

function outboxEntries(raw: string | null): OutboxIndexEntry[] {
  if (!raw) return []
  try {
    const value = JSON.parse(raw)
    if (!Array.isArray(value)) return []
    return value.filter((item): item is OutboxIndexEntry =>
      item
      && typeof item === "object"
      && typeof item.caseId === "string"
      && ["preop", "intraop", "postop"].includes(item.section),
    )
  } catch {
    return []
  }
}

async function migrateLegacyClinicalData(): Promise<void> {
  const secureOutboxIndex = await SecureStore.getItemAsync(OUTBOX_INDEX_KEY).catch(() => null)
  const fileOutboxIndex = await readFile(OUTBOX_INDEX_KEY)
  const entries = [...outboxEntries(secureOutboxIndex), ...outboxEntries(fileOutboxIndex)]
  const uniqueEntries = [...new Map(entries.map(entry => [`${entry.caseId}:${entry.section}`, entry])).values()]
  for (const entry of uniqueEntries) {
    await migrateValue(outboxPatchKey(entry.caseId, entry.section))
    await migrateValue(legacyOutboxPatchKey(entry.caseId, entry.section))
  }
  if (uniqueEntries.length > 0) await writeFile(OUTBOX_INDEX_KEY, JSON.stringify(uniqueEntries))
  await SecureStore.deleteItemAsync(OUTBOX_INDEX_KEY).catch(() => {})

  const securePendingIndex = await SecureStore.getItemAsync(PENDING_EVENTS_INDEX_KEY).catch(() => null)
  const pendingIds = [...new Set([
    ...stringArray(securePendingIndex),
    ...stringArray(await readFile(PENDING_EVENTS_INDEX_KEY)),
  ])]
  for (const caseId of pendingIds) await migrateValue(pendingEventsKey(caseId))
  if (pendingIds.length > 0) await writeFile(PENDING_EVENTS_INDEX_KEY, JSON.stringify(pendingIds))
  await SecureStore.deleteItemAsync(PENDING_EVENTS_INDEX_KEY).catch(() => {})

  const secureMutationIndex = await SecureStore.getItemAsync(EVENT_MUTATION_INDEX_KEY).catch(() => null)
  const mutationIds = [...new Set([
    ...stringArray(secureMutationIndex),
    ...stringArray(await readFile(EVENT_MUTATION_INDEX_KEY)),
  ])]
  for (const caseId of mutationIds) await migrateValue(eventMutationKey(caseId))
  if (mutationIds.length > 0) await writeFile(EVENT_MUTATION_INDEX_KEY, JSON.stringify(mutationIds))
  await SecureStore.deleteItemAsync(EVENT_MUTATION_INDEX_KEY).catch(() => {})

  await Promise.all([
    migrateValue(DROPPED_EVENTS_KEY),
    migrateValue(DROPPED_EVENT_MUTATIONS_KEY),
  ])
}

function ensureMigrated(): Promise<void> {
  if (!migrationPromise) {
    migrationPromise = migrateLegacyClinicalData().catch((error) => {
      migrationPromise = null
      throw error
    })
  }
  return migrationPromise
}

/**
 * Durable clinical working data belongs in the app's private files, not in
 * Android's small secret store. Reads retain a SecureStore fallback so queued
 * edits from older releases migrate without being discarded.
 */
export const clinicalSyncKv: KVAdapter = {
  async get(key) {
    const fileValue = await readFile(key)
    return fileValue ?? migrateValue(key)
  },
  async set(key, value) {
    await ensureMigrated()
    await writeFile(key, value)
    await SecureStore.deleteItemAsync(key).catch(() => {})
  },
  async delete(key) {
    await Promise.all([
      deleteFile(key),
      SecureStore.deleteItemAsync(key).catch(() => {}),
    ])
  },
  async keys(prefix) {
    await ensureMigrated()
    if (Platform.OS === "web") {
      const storage = browserStorage()
      if (!storage) return []
      const keys: string[] = []
      for (let index = 0; index < storage.length; index++) {
        const key = storage.key(index)
        if (key?.startsWith(WEB_PREFIX)) {
          const clinicalKey = key.slice(WEB_PREFIX.length)
          if (clinicalKey.startsWith(prefix)) keys.push(clinicalKey)
        }
      }
      return keys
    }
    await ensureDir()
    const files = await FileSystem.readDirectoryAsync(DIR)
    return files
      .map(keyFromFile)
      .filter((key): key is string => key !== null && key.startsWith(prefix))
  },
}
