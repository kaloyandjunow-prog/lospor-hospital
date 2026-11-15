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
  /** Added when the draft is created after account-scoped storage is active. */
  ownerId?: string
  serverCaseId?: string
  formValues: Record<string, unknown>
  createdAt: string
}

let activeOwnerId: string | null = null
let claiming: Promise<void> = Promise.resolve()

export function setLocalCaseStoreOwner(ownerId: string | null): void {
  activeOwnerId = ownerId
  // Drafts saved before account scoping (10.2.0) carry no owner: the first
  // account to sign in afterwards takes them, so an offline draft is not lost.
  if (ownerId) claiming = claimUnownedDrafts(ownerId).catch(() => {})
}

async function claimUnownedDrafts(ownerId: string): Promise<void> {
  if (Platform.OS === "web") {
    for (const draft of await allWebDrafts()) {
      if (!draft.ownerId) await putWebDraft({ ...draft, ownerId })
    }
    return
  }
  for (const id of await listNativeDraftIds()) {
    const path = draftPath(id)
    const raw = await FileSystem.readAsStringAsync(path).catch(() => "")
    if (!raw) continue
    const draft = JSON.parse(raw) as LocalCaseDraft
    if (!draft.ownerId) await FileSystem.writeAsStringAsync(path, JSON.stringify({ ...draft, ownerId }))
  }
}

function belongsToActiveOwner(draft: LocalCaseDraft): boolean {
  return activeOwnerId === null || draft.ownerId === activeOwnerId
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
    ...(activeOwnerId ? { ownerId: activeOwnerId } : {}),
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
  await claiming
  try {
    const draft = Platform.OS === "web" ? await loadWebDraft(localId) : await (async () => {
      const path = draftPath(localId)
      const info = await FileSystem.getInfoAsync(path)
      if (!info.exists) return null
      const raw = await FileSystem.readAsStringAsync(path)
      return raw ? (JSON.parse(raw) as LocalCaseDraft) : null
    })()
    return draft && belongsToActiveOwner(draft) ? draft : null
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
  await claiming
  if (Platform.OS === "web") {
    try {
      return (await allWebDrafts()).filter(belongsToActiveOwner)
    } catch {
      return []
    }
  }
  const ids = await listNativeDraftIds()
  const drafts = await Promise.all(ids.map(id => loadLocalCaseDraft(id)))
  return drafts.filter((draft): draft is LocalCaseDraft => draft !== null)
}

export async function clearAllLocalCaseDrafts(): Promise<number> {
  await claiming
  if (Platform.OS === "web") {
    try {
      const drafts = await allWebDrafts()
      const owned = drafts.filter(belongsToActiveOwner)
      await Promise.all(owned.map(draft => deleteWebDraft(draft.localId)))
      return owned.length
    } catch {
      return 0
    }
  }
  const allIds = await listNativeDraftIds()
  const ownedIds: string[] = []
  for (const id of allIds) if (await loadLocalCaseDraft(id)) ownedIds.push(id)
  await Promise.all(
    ownedIds.map(id => FileSystem.deleteAsync(draftPath(id), { idempotent: true }).catch(() => {})),
  )
  return ownedIds.length
}
