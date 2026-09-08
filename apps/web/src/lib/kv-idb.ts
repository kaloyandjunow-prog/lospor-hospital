// IndexedDB-backed KVAdapter for the shared sync outbox (@lospor/core/sync).
// No dependencies; a single "kv" object store keyed by string. Browser-only —
// callers are client components/hooks, so IndexedDB is never touched on the
// server.
import type { KVAdapter } from "@lospor/core/sync"

const DB_NAME = "lospor-sync"
const STORE = "kv"

let dbPromise: Promise<IDBDatabase> | null = null

function db(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1)
      req.onupgradeneeded = () => { req.result.createObjectStore(STORE) }
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
    // A failed open (private mode, storage denied) should be retried next call.
    dbPromise.catch(() => { dbPromise = null })
  }
  return dbPromise
}

/**
 * Resolve when the *transaction* commits, not when the request succeeds.
 *
 * A request's `onsuccess` fires while the transaction is still open. Resolving
 * there tells the caller its offline edit is stored, and the transaction can
 * still abort afterwards -- a quota failure at commit, or an abort from
 * anywhere else in the transaction -- leaving the write gone and the caller
 * already told it succeeded. For a queued clinical patch waiting to sync, that
 * is a save the clinician saw acknowledged and which no longer exists.
 *
 * So the request's result is captured on success and handed over only once
 * `oncomplete` fires, and an abort rejects rather than being ignored. Reads go
 * through the same path: a read whose transaction aborted returned nothing
 * useful anyway.
 */
function tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return db().then((d) => new Promise<T>((resolve, reject) => {
    const t = d.transaction(STORE, mode)
    const req = run(t.objectStore(STORE))
    let result: T
    req.onsuccess = () => { result = req.result }
    req.onerror = () => reject(req.error)
    t.oncomplete = () => resolve(result)
    // `t.error` is null when the abort came from an explicit abort() rather
    // than a failure, so there is not always an Error to propagate.
    t.onabort = () => reject(t.error ?? new Error("IndexedDB transaction aborted"))
    t.onerror = () => reject(t.error ?? new Error("IndexedDB transaction failed"))
  }))
}

export const idbKV: KVAdapter = {
  async get(key) {
    const value = await tx<string | undefined>("readonly", (s) => s.get(key) as IDBRequest<string | undefined>)
    return value ?? null
  },
  async set(key, value) {
    await tx("readwrite", (s) => s.put(value, key))
  },
  async delete(key) {
    await tx("readwrite", (s) => s.delete(key))
  },
  async keys(prefix) {
    // Prefix range scan: lets the sync engine reconcile its queue indexes
    // from actual storage (rediscovers entries a multi-tab race dropped).
    const range = IDBKeyRange.bound(prefix, prefix + "￿")
    const keys = await tx<IDBValidKey[]>("readonly", (s) => s.getAllKeys(range))
    return keys.map(String)
  },
}
