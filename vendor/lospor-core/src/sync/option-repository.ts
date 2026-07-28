import {
  parseLibraryOptions,
  type CanonicalLibraryOption,
  type LibraryCategory,
} from "../option-contracts"

export type OptionLibrarySource = "live" | "cached" | "bundled"
export type OptionLibraryState = {
  data: CanonicalLibraryOption[]
  source: OptionLibrarySource
}

export const OPTION_LIBRARY_CACHE_VERSION = 4
export const OPTION_LIBRARY_RETRY_MS = 30_000

export type OptionRepositoryStorage = {
  get(key: string): Promise<string | null>
  set(key: string, value: string): Promise<void>
  delete?(key: string): Promise<void>
}

export type OptionRepositoryScheduler = {
  schedule(callback: () => void, delayMs: number): unknown
  cancel(handle: unknown): void
}

export type OptionRepositoryAdapters = {
  storage: OptionRepositoryStorage
  fetchCategory(category: LibraryCategory): Promise<unknown>
  bundled(category: LibraryCategory): CanonicalLibraryOption[]
  scheduler: OptionRepositoryScheduler
  retryMs?: number
  cacheVersion?: number
  legacyCacheVersions?: readonly number[]
}

export class OptionLibraryRepository {
  private readonly states = new Map<LibraryCategory, OptionLibraryState>()
  private readonly inflight = new Map<LibraryCategory, Promise<OptionLibraryState>>()
  private readonly listeners = new Map<LibraryCategory, Set<(state: OptionLibraryState) => void>>()
  private readonly retryHandles = new Map<LibraryCategory, unknown>()

  constructor(private readonly adapters: OptionRepositoryAdapters) {}

  state(category: LibraryCategory): OptionLibraryState | null {
    return this.states.get(category) ?? null
  }

  subscribe(
    category: LibraryCategory,
    listener: (state: OptionLibraryState) => void,
  ): () => void {
    const listeners = this.listeners.get(category) ?? new Set()
    listeners.add(listener)
    this.listeners.set(category, listeners)
    return () => listeners.delete(listener)
  }

  async load(category: LibraryCategory): Promise<OptionLibraryState> {
    return this.attemptLive(category)
  }

  async refresh(category: LibraryCategory): Promise<OptionLibraryState> {
    return this.attemptLive(category)
  }

  dispose(): void {
    for (const handle of this.retryHandles.values()) this.adapters.scheduler.cancel(handle)
    this.retryHandles.clear()
    this.listeners.clear()
  }

  private cacheKey(category: LibraryCategory, version = this.cacheVersion()): string {
    return `lospor_option_library_v${version}_${category}`
  }

  private cacheVersion(): number {
    return this.adapters.cacheVersion ?? OPTION_LIBRARY_CACHE_VERSION
  }

  private publish(category: LibraryCategory, state: OptionLibraryState): OptionLibraryState {
    this.states.set(category, state)
    this.listeners.get(category)?.forEach(listener => listener(state))
    return state
  }

  private stopRetry(category: LibraryCategory): void {
    const handle = this.retryHandles.get(category)
    if (handle !== undefined) this.adapters.scheduler.cancel(handle)
    this.retryHandles.delete(category)
  }

  private scheduleRetry(category: LibraryCategory): void {
    if (this.retryHandles.has(category)) return
    const handle = this.adapters.scheduler.schedule(() => {
      this.retryHandles.delete(category)
      void this.attemptLive(category)
    }, this.adapters.retryMs ?? OPTION_LIBRARY_RETRY_MS)
    this.retryHandles.set(category, handle)
  }

  private async readCached(category: LibraryCategory): Promise<CanonicalLibraryOption[] | null> {
    const versions = [
      this.cacheVersion(),
      ...(this.adapters.legacyCacheVersions ?? [3]),
    ]
    for (const version of [...new Set(versions)]) {
      try {
        const raw = await this.adapters.storage.get(this.cacheKey(category, version))
        const parsed = raw ? parseLibraryOptions(JSON.parse(raw)) : []
        if (!parsed.length) continue
        if (version !== this.cacheVersion()) {
          await this.adapters.storage
            .set(this.cacheKey(category), JSON.stringify(parsed))
            .catch(() => {})
        }
        return parsed
      } catch {
        // Try the next compatibility key.
      }
    }
    return null
  }

  private async fallback(category: LibraryCategory): Promise<OptionLibraryState> {
    const cached = await this.readCached(category)
    if (cached?.length) return this.publish(category, { data: cached, source: "cached" })
    return this.publish(category, {
      data: parseLibraryOptions(this.adapters.bundled(category)),
      source: "bundled",
    })
  }

  private async attemptLive(category: LibraryCategory): Promise<OptionLibraryState> {
    const current = this.inflight.get(category)
    if (current) return current
    const request = (async () => {
      try {
        const data = parseLibraryOptions(await this.adapters.fetchCategory(category))
        if (!data.length) throw new Error("empty or invalid option library response")
        const next = this.publish(category, { data, source: "live" })
        this.stopRetry(category)
        await this.adapters.storage
          .set(this.cacheKey(category), JSON.stringify(data))
          .catch(() => {})
        return next
      } catch {
        const currentState = this.states.get(category)
        const next = currentState?.data.length ? currentState : await this.fallback(category)
        this.scheduleRetry(category)
        return next
      } finally {
        this.inflight.delete(category)
      }
    })()
    this.inflight.set(category, request)
    return request
  }
}
