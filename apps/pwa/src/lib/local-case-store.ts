import * as FileSystem from "expo-file-system/legacy"
import * as SecureStore from "expo-secure-store"
import { Platform } from "react-native"
import { randomHex } from "@/lib/random-id"

const WEB_DB_NAME = "lospor"
const WEB_DB_VERSION = 2
const WEB_DRAFT_STORE = "case-drafts"
const WEB_REFERENCE_STORE = "patient-references"
const WEB_KEY_STORE = "patient-reference-keys"
const NATIVE_REFERENCE_PREFIX = "lospor_patient_reference_"

export type LocalDraftOwner = {
  userId: string
  institutionId: string
}

export type LocalCaseDraft = {
  localId: string
  /** Immutable account + institution boundary for this device-local record. */
  owner: LocalDraftOwner
  serverCaseId?: string
  /**
   * The server case exists, but one or more values from this local copy still
   * need a clinician's attention. Only structural field names and reason
   * categories live here; the original values remain in formValues and are
   * never copied into logs or diagnostic messages.
   */
  syncReview?: LocalCaseDraftSyncReview
  /** Clinical form data only. A raw patient number is forbidden here. */
  formValues: Record<string, unknown>
  /** True when a separately protected local reference exists. */
  hasProtectedPatientReference: boolean
  createdAt: string
}

export type LocalCaseDraftSyncReview = {
  blocked?: {
    field: string
    reason: "likely_name" | "egn" | "long_number" | "date" | "email" | "other"
  }
  rejectedFields?: string[]
}

export type SaveLocalCaseDraftInput = {
  localId: string
  owner: LocalDraftOwner
  formValues: Record<string, unknown>
  /** Stored outside formValues, encrypted on web and in SecureStore natively. */
  patientNumber?: string
  serverCaseId?: string
  syncReview?: LocalCaseDraftSyncReview
}

type StoredDraft = Omit<LocalCaseDraft, "owner"> & { owner?: LocalDraftOwner }

type WebProtectedReference = {
  localId: string
  ownerKey: string
  iv: string
  ciphertext: string
  version: 1
}

type WebKeyRecord = {
  id: string
  key: CryptoKey
}

let webDbPromise: Promise<IDBDatabase> | null = null
const webKeyPromises = new Map<string, Promise<CryptoKey>>()

function validOwner(owner: LocalDraftOwner | null | undefined): owner is LocalDraftOwner {
  return Boolean(owner?.userId?.trim() && owner?.institutionId?.trim())
}

function containsPatientNumberField(value: unknown, seen = new Set<object>()): boolean {
  if (!value || typeof value !== "object") return false
  if (seen.has(value)) return false
  seen.add(value)
  if (Array.isArray(value)) return value.some(item => containsPatientNumberField(item, seen))
  return Object.entries(value).some(([key, child]) => (
    key === "patientNumber" || containsPatientNumberField(child, seen)
  ))
}

export function sameLocalDraftOwner(
  left: LocalDraftOwner | null | undefined,
  right: LocalDraftOwner | null | undefined,
): boolean {
  return validOwner(left) && validOwner(right)
    && left.userId === right.userId
    && left.institutionId === right.institutionId
}

export function localDraftOwnerFromIdentity(
  identity: { userId: string; institutionId: string | null } | null | undefined,
): LocalDraftOwner | null {
  return identity?.institutionId
    ? { userId: identity.userId, institutionId: identity.institutionId }
    : null
}

function ownerKey(owner: LocalDraftOwner): string {
  return `${owner.userId}\u0000${owner.institutionId}`
}

function protectedReferenceKey(localId: string): string {
  return `${NATIVE_REFERENCE_PREFIX}${localId}`
}

function nativeDirectory(): string {
  if (!FileSystem.documentDirectory) {
    throw new Error("Private document storage is unavailable")
  }
  return `${FileSystem.documentDirectory}case-drafts/`
}

function draftPath(id: string): string {
  return `${nativeDirectory()}${id}.json`
}

function isOwnedDraft(value: StoredDraft | null, owner: LocalDraftOwner): value is LocalCaseDraft {
  return Boolean(value && sameLocalDraftOwner(value.owner, owner))
}

function parseStoredDraft(raw: string): StoredDraft | null {
  try {
    const value = JSON.parse(raw) as Partial<StoredDraft>
    if (!value || typeof value !== "object" || typeof value.localId !== "string"
      || !value.formValues || typeof value.formValues !== "object"
      || Array.isArray(value.formValues) || typeof value.createdAt !== "string") return null
    return value as StoredDraft
  } catch {
    return null
  }
}

function webDatabase(): Promise<IDBDatabase> {
  if (webDbPromise) return webDbPromise
  const opening = new Promise<IDBDatabase>((resolve, reject) => {
    if (!globalThis.indexedDB) {
      reject(new Error("IndexedDB is unavailable"))
      return
    }
    const request = globalThis.indexedDB.open(WEB_DB_NAME, WEB_DB_VERSION)
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(WEB_DRAFT_STORE)) {
        request.result.createObjectStore(WEB_DRAFT_STORE, { keyPath: "localId" })
      }
      if (!request.result.objectStoreNames.contains(WEB_REFERENCE_STORE)) {
        request.result.createObjectStore(WEB_REFERENCE_STORE, { keyPath: "localId" })
      }
      if (!request.result.objectStoreNames.contains(WEB_KEY_STORE)) {
        request.result.createObjectStore(WEB_KEY_STORE, { keyPath: "id" })
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

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ""
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value)
  return Uint8Array.from(binary, character => character.charCodeAt(0))
}

async function webEncryptionKey(owner: LocalDraftOwner): Promise<CryptoKey> {
  if (!globalThis.crypto?.subtle) throw new Error("Protected browser storage is unavailable")
  const id = `patient-reference-v1:${ownerKey(owner)}`
  const inFlight = webKeyPromises.get(id)
  if (inFlight) return inFlight

  // Serialize first use for each owner. Without this gate, two simultaneous
  // first saves can generate different keys and whichever write finishes last
  // strands ciphertext produced by the other key.
  const resolving = (async () => {
    const database = await webDatabase()
    const read = database.transaction(WEB_KEY_STORE, "readonly")
    const existing = await requestResult(
      read.objectStore(WEB_KEY_STORE).get(id) as IDBRequest<WebKeyRecord | undefined>,
    )
    if (existing?.key) return existing.key

    // Non-extractable: the raw key cannot be read back by storage inspection.
    const key = await globalThis.crypto.subtle.generateKey(
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"],
    )
    const write = database.transaction(WEB_KEY_STORE, "readwrite")
    write.objectStore(WEB_KEY_STORE).put({ id, key } satisfies WebKeyRecord)
    await transactionDone(write)
    return key
  })().catch(error => {
    webKeyPromises.delete(id)
    throw error
  })
  webKeyPromises.set(id, resolving)
  return resolving
}

function exactArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
}

function referenceAad(localId: string, owner: LocalDraftOwner): ArrayBuffer {
  return exactArrayBuffer(
    new TextEncoder().encode(`lospor-patient-reference-v1\u0000${localId}\u0000${ownerKey(owner)}`),
  )
}

async function encryptWebReference(
  localId: string,
  owner: LocalDraftOwner,
  patientNumber: string,
): Promise<WebProtectedReference> {
  const key = await webEncryptionKey(owner)
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12))
  const plaintext = new TextEncoder().encode(patientNumber)
  const encrypted = await globalThis.crypto.subtle.encrypt(
    { name: "AES-GCM", iv: exactArrayBuffer(iv), additionalData: referenceAad(localId, owner) },
    key,
    exactArrayBuffer(plaintext),
  )
  return {
    localId,
    ownerKey: ownerKey(owner),
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(new Uint8Array(encrypted)),
    version: 1,
  }
}

async function decryptWebReference(
  reference: WebProtectedReference,
  owner: LocalDraftOwner,
): Promise<string | null> {
  if (reference.ownerKey !== ownerKey(owner) || reference.version !== 1) return null
  try {
    const key = await webEncryptionKey(owner)
    const decrypted = await globalThis.crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: exactArrayBuffer(base64ToBytes(reference.iv)),
        additionalData: referenceAad(reference.localId, owner),
      },
      key,
      exactArrayBuffer(base64ToBytes(reference.ciphertext)),
    )
    const value = new TextDecoder().decode(decrypted).trim()
    return value || null
  } catch {
    return null
  }
}

async function rawWebDraft(localId: string): Promise<StoredDraft | null> {
  const transaction = (await webDatabase()).transaction(WEB_DRAFT_STORE, "readonly")
  const result = await requestResult(
    transaction.objectStore(WEB_DRAFT_STORE).get(localId) as IDBRequest<StoredDraft | undefined>,
  )
  return result ?? null
}

async function rawNativeDraft(localId: string): Promise<StoredDraft | null> {
  const path = draftPath(localId)
  const info = await FileSystem.getInfoAsync(path)
  if (!info.exists) return null
  const parsed = parseStoredDraft(await FileSystem.readAsStringAsync(path))
  if (!parsed) throw new Error("Unreadable local draft")
  return parsed
}

async function rawDraftStrict(localId: string): Promise<StoredDraft | null> {
  return Platform.OS === "web" ? rawWebDraft(localId) : rawNativeDraft(localId)
}

async function rawDraft(localId: string): Promise<StoredDraft | null> {
  try {
    return await rawDraftStrict(localId)
  } catch {
    return null
  }
}

async function protectedReferenceExists(localId: string, owner: LocalDraftOwner): Promise<boolean> {
  if (Platform.OS === "web") {
    const transaction = (await webDatabase()).transaction(WEB_REFERENCE_STORE, "readonly")
    const reference = await requestResult(
      transaction.objectStore(WEB_REFERENCE_STORE).get(localId) as IDBRequest<WebProtectedReference | undefined>,
    )
    return reference?.ownerKey === ownerKey(owner)
  }
  const raw = await SecureStore.getItemAsync(protectedReferenceKey(localId))
  if (!raw) return false
  try {
    const value = JSON.parse(raw) as { owner?: LocalDraftOwner; patientNumber?: unknown }
    return sameLocalDraftOwner(value.owner, owner) && typeof value.patientNumber === "string"
  } catch {
    return false
  }
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

/**
 * Whether a local draft has anything to anchor to yet.
 *
 * Before a server case exists, a draft is anchored by the encrypted patient
 * reference -- the hospital patient number, held in its own protected store,
 * never in the clinical values. With no number entered and no reference
 * already stored, there is nothing to write, and saveLocalCaseDraft correctly
 * refuses.
 *
 * It refuses by returning false, though, which the caller cannot tell apart
 * from a genuine storage failure. A blank new-case form therefore reported
 * "the draft was not saved on this device" the instant it opened, before the
 * clinician could type anything -- a device fault for a form not yet filled
 * in. Asking first lets the caller stay silent until there is something to
 * save, and keep the storage message for storage actually failing.
 */
export async function localDraftCanBeWritten(input: {
  localId: string
  owner: LocalDraftOwner
  serverCaseId?: string | undefined
  patientNumber?: string | undefined
}): Promise<boolean> {
  if (!validOwner(input.owner) || !input.localId) return false
  if (input.serverCaseId) return true
  if (typeof input.patientNumber === "string" && input.patientNumber.trim()) return true
  return protectedReferenceExists(input.localId, input.owner)
}

/**
 * Persist one account-bound draft.
 *
 * Raw patient identifiers are rejected inside formValues. Before a server case
 * exists, the number must be supplied through patientNumber and is stored in a
 * distinct protected boundary. Existing owner identity can never be changed.
 */
export async function saveLocalCaseDraft(input: SaveLocalCaseDraftInput): Promise<boolean> {
  if (!validOwner(input.owner) || !input.localId || !input.formValues
    || Array.isArray(input.formValues) || containsPatientNumberField(input.formValues)) return false
  if (input.patientNumber !== undefined && typeof input.patientNumber !== "string") return false
  const patientNumber = input.patientNumber?.trim()
  if (patientNumber !== undefined && (!patientNumber || patientNumber.length > 128)) return false

  try {
    // A read failure is not absence: fail closed instead of overwriting a
    // record whose immutable owner/server identity could not be verified.
    const existing = await rawDraftStrict(input.localId)
    if (existing && !sameLocalDraftOwner(existing.owner, input.owner)) return false
    if (existing?.serverCaseId && existing.serverCaseId !== input.serverCaseId) return false
    const existingReference = await protectedReferenceExists(input.localId, input.owner)
    if (!input.serverCaseId && !patientNumber && !existingReference) return false
    const draft: LocalCaseDraft = {
      localId: input.localId,
      owner: { ...input.owner },
      ...(input.serverCaseId ? { serverCaseId: input.serverCaseId } : {}),
      ...(input.syncReview ? { syncReview: input.syncReview } : {}),
      formValues: { ...input.formValues },
      hasProtectedPatientReference: Boolean(!input.serverCaseId && (patientNumber || existingReference)),
      createdAt: existing?.createdAt ?? new Date().toISOString(),
    }

    if (Platform.OS === "web") {
      const protectedReference = patientNumber
        ? await encryptWebReference(input.localId, input.owner, patientNumber)
        : null
      const transaction = (await webDatabase()).transaction(
        [WEB_DRAFT_STORE, WEB_REFERENCE_STORE],
        "readwrite",
      )
      transaction.objectStore(WEB_DRAFT_STORE).put(draft)
      if (protectedReference) {
        transaction.objectStore(WEB_REFERENCE_STORE).put(protectedReference)
      } else if (input.serverCaseId) {
        transaction.objectStore(WEB_REFERENCE_STORE).delete(input.localId)
      }
      await transactionDone(transaction)
      return true
    }

    await ensureNativeDirectory()
    const secretKey = protectedReferenceKey(input.localId)
    const priorSecret = await SecureStore.getItemAsync(secretKey)
    if (patientNumber) {
      await SecureStore.setItemAsync(secretKey, JSON.stringify({
        version: 1,
        owner: input.owner,
        patientNumber,
      }))
    }
    try {
      await FileSystem.writeAsStringAsync(draftPath(input.localId), JSON.stringify(draft))
    } catch (error) {
      if (patientNumber) {
        if (priorSecret === null) await SecureStore.deleteItemAsync(secretKey).catch(() => {})
        else await SecureStore.setItemAsync(secretKey, priorSecret).catch(() => {})
      }
      throw error
    }
    if (input.serverCaseId) await SecureStore.deleteItemAsync(secretKey)
    return true
  } catch {
    return false
  }
}

export async function loadLocalCaseDraft(
  localId: string,
  owner: LocalDraftOwner,
): Promise<LocalCaseDraft | null> {
  if (!validOwner(owner)) return null
  const draft = await rawDraft(localId)
  return isOwnedDraft(draft, owner) ? draft : null
}

export async function loadLocalPatientReference(
  localId: string,
  owner: LocalDraftOwner,
): Promise<string | null> {
  const draft = await loadLocalCaseDraft(localId, owner)
  if (!draft || draft.serverCaseId) return null
  try {
    if (Platform.OS === "web") {
      const transaction = (await webDatabase()).transaction(WEB_REFERENCE_STORE, "readonly")
      const reference = await requestResult(
        transaction.objectStore(WEB_REFERENCE_STORE).get(localId) as IDBRequest<WebProtectedReference | undefined>,
      )
      return reference ? decryptWebReference(reference, owner) : null
    }
    const raw = await SecureStore.getItemAsync(protectedReferenceKey(localId))
    if (!raw) return null
    const value = JSON.parse(raw) as {
      version?: number
      owner?: LocalDraftOwner
      patientNumber?: unknown
    }
    if (value.version !== 1 || !sameLocalDraftOwner(value.owner, owner)
      || typeof value.patientNumber !== "string") return null
    const patientNumber = value.patientNumber.trim()
    return patientNumber || null
  } catch {
    return null
  }
}

export async function deleteLocalCaseDraft(
  localId: string,
  owner: LocalDraftOwner,
): Promise<void> {
  if (!validOwner(owner)) return
  const existing = await rawDraft(localId)
  if (!isOwnedDraft(existing, owner)) return
  try {
    if (Platform.OS === "web") {
      const transaction = (await webDatabase()).transaction(
        [WEB_DRAFT_STORE, WEB_REFERENCE_STORE],
        "readwrite",
      )
      transaction.objectStore(WEB_DRAFT_STORE).delete(localId)
      transaction.objectStore(WEB_REFERENCE_STORE).delete(localId)
      await transactionDone(transaction)
    } else {
      await FileSystem.deleteAsync(draftPath(localId), { idempotent: true })
      await SecureStore.deleteItemAsync(protectedReferenceKey(localId))
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

export async function getAllLocalCaseDrafts(owner: LocalDraftOwner): Promise<LocalCaseDraft[]> {
  if (!validOwner(owner)) return []
  if (Platform.OS === "web") {
    try {
      const transaction = (await webDatabase()).transaction(WEB_DRAFT_STORE, "readonly")
      const drafts = await requestResult(
        transaction.objectStore(WEB_DRAFT_STORE).getAll() as IDBRequest<StoredDraft[]>,
      )
      // Legacy drafts with no owner and drafts belonging to another session are
      // retained but quarantined: they are neither listed nor opened/flushed.
      return drafts.filter((draft): draft is LocalCaseDraft => isOwnedDraft(draft, owner))
    } catch {
      return []
    }
  }
  const ids = await listNativeDraftIds()
  const drafts = await Promise.all(ids.map(id => loadLocalCaseDraft(id, owner)))
  return drafts.filter((draft): draft is LocalCaseDraft => draft !== null)
}

/** Explicit device-cache clearing is the only operation that removes quarantined legacy drafts. */
export async function clearAllLocalCaseDrafts(): Promise<number> {
  if (Platform.OS === "web") {
    try {
      const database = await webDatabase()
      const countTransaction = database.transaction(WEB_DRAFT_STORE, "readonly")
      const count = await requestResult(countTransaction.objectStore(WEB_DRAFT_STORE).count())
      const clearTransaction = database.transaction(
        [WEB_DRAFT_STORE, WEB_REFERENCE_STORE, WEB_KEY_STORE],
        "readwrite",
      )
      clearTransaction.objectStore(WEB_DRAFT_STORE).clear()
      clearTransaction.objectStore(WEB_REFERENCE_STORE).clear()
      clearTransaction.objectStore(WEB_KEY_STORE).clear()
      await transactionDone(clearTransaction)
      webKeyPromises.clear()
      return count
    } catch {
      return 0
    }
  }
  const ids = await listNativeDraftIds()
  await Promise.all(ids.map(async id => {
    await FileSystem.deleteAsync(draftPath(id), { idempotent: true }).catch(() => {})
    await SecureStore.deleteItemAsync(protectedReferenceKey(id)).catch(() => {})
  }))
  return ids.length
}
