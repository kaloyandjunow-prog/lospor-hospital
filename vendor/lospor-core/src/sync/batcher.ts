// Coalescing save batcher: rapid successive submissions (multi-select taps,
// quick toggles) merge into ONE run after a short settle, instead of racing
// each other through the write queue. All submitters of a batch share the
// same result promise; a submission arriving while a run is in flight simply
// starts the next batch.

// Core's tsconfig has no DOM/node lib; every runtime (RN, browser, node)
// provides these timers.
declare const setTimeout: (handler: () => void, timeout?: number) => unknown
declare const clearTimeout: (handle: unknown) => void

export type CoalescingBatcher<T> = {
  /** Merge into the pending batch; resolves when that batch's run completes. */
  submit(payload: Record<string, unknown>): Promise<T>
  /** Run any pending batch immediately (teardown/navigation). */
  flush(): Promise<T> | undefined
  /** True when a batch is waiting for its settle timer. */
  readonly pending: boolean
}

type TimerHandle = unknown

export function createCoalescingBatcher<T>(
  run: (merged: Record<string, unknown>) => Promise<T>,
  settleMs = 500,
): CoalescingBatcher<T> {
  let mergedPayload: Record<string, unknown> | null = null
  let timer: TimerHandle | null = null
  let batchResolve: ((value: T) => void) | null = null
  let batchReject: ((err: unknown) => void) | null = null
  let batchPromise: Promise<T> | null = null

  function fire(): Promise<T> {
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
    const payload = mergedPayload ?? {}
    const resolve = batchResolve
    const reject = batchReject
    const promise = batchPromise!
    mergedPayload = null
    batchResolve = null
    batchReject = null
    batchPromise = null
    run(payload).then(
      (value) => resolve?.(value),
      (err) => reject?.(err),
    )
    return promise
  }

  return {
    submit(payload: Record<string, unknown>): Promise<T> {
      // Shallow merge, later keys win — matches the section-PATCH semantics
      // where each key is a whole field.
      mergedPayload = { ...(mergedPayload ?? {}), ...payload }
      if (!batchPromise) {
        batchPromise = new Promise<T>((resolve, reject) => {
          batchResolve = resolve
          batchReject = reject
        })
      }
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => { void fire() }, settleMs)
      return batchPromise
    },
    flush(): Promise<T> | undefined {
      if (!batchPromise) return undefined
      return fire()
    },
    get pending() {
      return batchPromise !== null
    },
  }
}
