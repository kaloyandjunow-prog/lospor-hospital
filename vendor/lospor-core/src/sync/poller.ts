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
}): SingleFlightPoller {
  let timer: unknown
  let started = false
  let pending: Promise<void> | null = null

  const schedule = () => {
    if (!started) return
    timer = input.scheduler.schedule(() => {
      timer = undefined
      void trigger().finally(schedule)
    }, input.intervalMs)
  }

  const trigger = async (): Promise<void> => {
    if (!started || input.isActive?.() === false) return
    if (pending) return pending
    pending = input.poll().finally(() => {
      pending = null
    })
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
