export type PollScheduler = {
  schedule(callback: () => void, delayMs: number): unknown
  cancel(handle: unknown): void
}

export type SingleFlightPoller = {
  start(): void
  stop(): void
  trigger(): Promise<void>
  running(): boolean
  inFlight(): boolean
}

export function createSingleFlightPoller(input: {
  intervalMs: number
  poll: () => Promise<void>
  isActive?: () => boolean
  scheduler: PollScheduler
  /**
   * How long a single poll may run before the loop stops waiting for it.
   * Defaults to three intervals, or 30s, whichever is longer.
   */
  watchdogMs?: number
}): SingleFlightPoller {
  let timer: unknown
  let started = false
  let pending: Promise<void> | null = null
  /**
   * Identifies the in-flight poll, so a run the watchdog already gave up on
   * cannot clear a newer one when it eventually settles.
   */
  let token = 0

  const watchdogMs = input.watchdogMs ?? Math.max(input.intervalMs * 3, 30_000)

  const schedule = () => {
    if (!started) return
    timer = input.scheduler.schedule(() => {
      timer = undefined
      void trigger().finally(schedule)
    }, input.intervalMs)
  }

  /**
   * A poll that never settles used to end background syncing for the whole
   * session: the loop only re-arms inside `.finally()` of the in-flight poll,
   * and `trigger()` hands back the pending promise while one is running. One
   * request without a timeout was therefore enough to leave queued clinical
   * work sitting until the user pressed sync by hand — and returning to the
   * foreground did not help, because that got the same stuck promise.
   *
   * The watchdog bounds the wait. The abandoned poll is left to finish or hang
   * on its own; the loop stops depending on it either way.
   */
  const trigger = async (): Promise<void> => {
    if (!started || input.isActive?.() === false) return
    if (pending) return pending

    const run = ++token
    let watchdog: unknown
    let expire!: () => void
    const expired = new Promise<void>(resolve => { expire = resolve })

    const release = () => {
      // A run the watchdog already gave up on must not clear a newer one.
      if (run !== token) return
      pending = null
      if (watchdog !== undefined) {
        input.scheduler.cancel(watchdog)
        watchdog = undefined
      }
      expire()
    }

    // Errors are swallowed deliberately: reporting a failed poll is the caller's
    // business, and must never stop the loop from re-arming.
    const attempt = input.poll().then(release, release)

    // Assigned before the watchdog is armed: a scheduler that fires
    // synchronously would otherwise have its release overwritten here.
    pending = Promise.race([attempt, expired])

    watchdog = input.scheduler.schedule(() => {
      watchdog = undefined
      release()
    }, watchdogMs)

    return pending
  }

  return {
    start() {
      if (started) return
      started = true
      schedule()
    },
    stop() {
      started = false
      if (timer !== undefined) input.scheduler.cancel(timer)
      timer = undefined
    },
    trigger,
    running: () => started,
    inFlight: () => pending !== null,
  }
}
