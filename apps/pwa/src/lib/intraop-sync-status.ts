import { useRef, useSyncExternalStore, type Dispatch, type SetStateAction } from "react"

export type IntraopSyncState = "saved" | "saving" | "failed" | "offline"

export type IntraopSyncStatus = {
  syncState: IntraopSyncState
  pendingCount: number
  lastSavedAt: string | null
  errorMessage: string | null
}

const INITIAL: IntraopSyncStatus = {
  syncState: "saved",
  pendingCount: 0,
  lastSavedAt: null,
  errorMessage: null,
}

/**
 * Save status, held outside the intraoperative screen's own render.
 *
 * It used to be four `useState`s on that screen, which is a 799-line component
 * with every tab under it. Each autosave moved through at least two of them
 * -- saving, then saved, and the pending count either side -- so a single tap
 * on an airway option re-rendered the whole screen twice: the header, the tab
 * rail, the timetable, all of it, for a change that only a badge can see.
 *
 * A store instead. The writers get setters whose identity never changes, so
 * the hooks holding them do not re-run either, and only the component that
 * actually reads the status subscribes to it.
 *
 * Per screen rather than module-global: two cases open in one session must not
 * inherit each other's badge, and a module-level store would also survive a
 * remount with stale state.
 */
export function createIntraopSyncStatusStore() {
  let status = INITIAL
  const listeners = new Set<() => void>()

  const emit = () => { for (const listener of listeners) listener() }

  const set = (patch: Partial<IntraopSyncStatus>) => {
    const next = { ...status, ...patch }
    // Bail on a no-op write. The pending count in particular is recomputed and
    // re-set on every queue flush, usually to the number it already held, and
    // without this each of those would wake every subscriber for nothing.
    if (
      next.syncState === status.syncState
      && next.pendingCount === status.pendingCount
      && next.lastSavedAt === status.lastSavedAt
      && next.errorMessage === status.errorMessage
    ) return
    status = next
    emit()
  }

  return {
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    getSnapshot: () => status,
    set,
  }
}

export type IntraopSyncStatusStore = ReturnType<typeof createIntraopSyncStatusStore>

/** One store for the life of the screen, with setters shaped like useState's. */
export function useIntraopSyncStatusStore() {
  const storeRef = useRef<IntraopSyncStatusStore | null>(null)
  storeRef.current ??= createIntraopSyncStatusStore()
  const store = storeRef.current

  /** Accepts an updater as well as a value, so callers read like useState. */
  const setter = <K extends keyof IntraopSyncStatus>(key: K) =>
    ((value: SetStateAction<IntraopSyncStatus[K]>) => {
      const current = store.getSnapshot()[key]
      const next = typeof value === "function"
        ? (value as (previous: IntraopSyncStatus[K]) => IntraopSyncStatus[K])(current)
        : value
      store.set({ [key]: next } as Partial<IntraopSyncStatus>)
    }) as Dispatch<SetStateAction<IntraopSyncStatus[K]>>

  // Built once. These are handed to hooks that list them as dependencies, so a
  // fresh identity per render would defeat the point of moving the state out.
  const settersRef = useRef<{
    setSyncState: Dispatch<SetStateAction<IntraopSyncState>>
    setPendingCount: Dispatch<SetStateAction<number>>
    setLastSavedAt: Dispatch<SetStateAction<string | null>>
    setSyncErrorMessage: Dispatch<SetStateAction<string | null>>
  } | null>(null)
  settersRef.current ??= {
    setSyncState: setter("syncState"),
    setPendingCount: setter("pendingCount"),
    setLastSavedAt: setter("lastSavedAt"),
    setSyncErrorMessage: setter("errorMessage"),
  }

  return { store, ...settersRef.current }
}

/** Subscribes the calling component, and only it, to the save status. */
export function useIntraopSyncStatus(store: IntraopSyncStatusStore): IntraopSyncStatus {
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
}
