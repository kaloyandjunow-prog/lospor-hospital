import * as FileSystem from "expo-file-system/legacy"
import { Platform } from "react-native"
import { randomHex } from "@/lib/random-id"

const WEB_DB_NAME = "lospor"
const WEB_DB_VERSION = 1
const WEB_STORE = "case-drafts"

function nativeDirectory(): string {
  if (!FileSystem.documentDirectory) {
    throw new Error("Private document storage is unavailable")
  }
  return `${FileSystem.documentDirectory}case-drafts/`
}

function draftPath(id: string): string {
  return `${nativeDirectory()}${id}.json`
}

export type LocalCaseDraft = {
  localId: string
  serverCaseId?: string
  formValues: Record<string, unknown>
  createdAt: string
}

let webDbPromise: Promise<IDBDatabase> | null = null

function webDatabase(): Promise<IDBDatabase> {
  if (webDbPromise) return webDbPromise
  const opening = new Promise<IDBDatabase>((resolve, reject) => {
    if (!globalThis.indexedDB) {
      reject(new Error("IndexedDB is unavailable"))
      return
    }
    const request = globalThis.indexedDB.open(WEB_DB_NAME, WEB_DB_VERSION)
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(WEB_STORE)) {
        request.result.createObjectStore(WEB_STORE, { keyPath: "localId" })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error("Could not open IndexedDB"))
    request.onblocked = () => reject(new Error("IndexedDB upgrade is blocked"))
  }).catch(error => {
    webDbPromise = null
    throw error
  })
  webDbPromise = opening
  return opening
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed"))
  })
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB transaction failed"))
    transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB transaction aborted"))
  })
}

async function putWebDraft(draft: LocalCaseDraft): Promise<void> {
  const transaction = (await webDatabase()).transaction(WEB_STORE, "readwrite")
  transaction.objectStore(WEB_STORE).put(draft)
  await transactionDone(transaction)
}

async function loadWebDraft(localId: string): Promise<LocalCaseDraft | null> {
  const transaction = (await webDatabase()).transaction(WEB_STORE, "readonly")
  const result = await requestResult(
    transaction.objectStore(WEB_STORE).get(localId) as IDBRequest<LocalCaseDraft | undefined>,
  )
  return result ?? null
}

async function deleteWebDraft(localId: string): Promise<void> {
  const transaction = (await webDatabase()).transaction(WEB_STORE, "readwrite")
  transaction.objectStore(WEB_STORE).delete(localId)
  await transactionDone(transaction)
}

async function allWebDrafts(): Promise<LocalCaseDraft[]> {
  const transaction = (await webDatabase()).transaction(WEB_STORE, "readonly")
  return requestResult(
    transaction.objectStore(WEB_STORE).getAll() as IDBRequest<LocalCaseDraft[]>,
  )
}

async function clearWebDrafts(): Promise<number> {
  const database = await webDatabase()
  const countTransaction = database.transaction(WEB_STORE, "readonly")
  const count = await requestResult(countTransaction.objectStore(WEB_STORE).count())
  const clearTransaction = database.transaction(WEB_STORE, "readwrite")
  clearTransaction.objectStore(WEB_STORE).clear()
  await transactionDone(clearTransaction)
  return count
}

export function makeLocalCaseId(): string {
  return `local_${randomHex(12)}`
}

async function ensureNativeDirectory(): Promise<void> {
  const directory = nativeDirectory()
  const info = await FileSystem.getInfoAsync(directory)
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(directory, { intermediates: true })
  }
}

export async function saveLocalCaseDraft(
  localId: string,
  formValues: Record<string, unknown>,
  serverCaseId?: string,
): Promise<boolean> {
  const draft: LocalCaseDraft = {
    localId,
    ...(serverCaseId ? { serverCaseId } : {}),
    formValues,
    createdAt: new Date().toISOString(),
  }
  try {
    if (Platform.OS === "web") {
      await putWebDraft(draft)
    } else {
      await ensureNativeDirectory()
      await FileSystem.writeAsStringAsync(draftPath(localId), JSON.stringify(draft))
    }
    return true
  } catch {
    return false
  }
}

export async function loadLocalCaseDraft(localId: string): Promise<LocalCaseDraft | null> {
  try {
    if (Platform.OS === "web") return loadWebDraft(localId)
    const path = draftPath(localId)
    const info = await FileSystem.getInfoAsync(path)
    if (!info.exists) return null
    const raw = await FileSystem.readAsStringAsync(path)
    return raw ? (JSON.parse(raw) as LocalCaseDraft) : null
  } catch {
    return null
  }
}

export async function deleteLocalCaseDraft(localId: string): Promise<void> {
  try {
    if (Platform.OS === "web") {
      await deleteWebDraft(localId)
    } else {
      await FileSystem.deleteAsync(draftPath(localId), { idempotent: true })
    }
  } catch {}
}

async function listNativeDraftIds(): Promise<string[]> {
  try {
    const directory = nativeDirectory()
    const info = await FileSystem.getInfoAsync(directory)
    if (!info.exists) return []
    const files = await FileSystem.readDirectoryAsync(directory)
    return files.filter(file => file.endsWith(".json")).map(file => file.replace(/\.json$/, ""))
  } catch {
    return []
  }
}

export async function getAllLocalCaseDrafts(): Promise<LocalCaseDraft[]> {
  if (Platform.OS === "web") {
    try {
      return await allWebDrafts()
    } catch {
      return []
    }
  }
  const ids = await listNativeDraftIds()
  const drafts = await Promise.all(ids.map(id => loadLocalCaseDraft(id)))
  return drafts.filter((draft): draft is LocalCaseDraft => draft !== null)
}

export async function clearAllLocalCaseDrafts(): Promise<number> {
  if (Platform.OS === "web") {
    try {
      return await clearWebDrafts()
    } catch {
      return 0
    }
  }
  const ids = await listNativeDraftIds()
  await Promise.all(
    ids.map(id => FileSystem.deleteAsync(draftPath(id), { idempotent: true }).catch(() => {})),
  )
  return ids.length
}
