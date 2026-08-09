import { describe, expect, it, vi } from "vitest"
import { createSingleFlightPoller } from "./poller"

describe("createSingleFlightPoller", () => {
  it("never overlaps polls", async () => {
    const callbacks: Array<() => void> = []
    let release!: () => void
    const poll = vi.fn(() => new Promise<void>(resolve => { release = resolve }))
    const poller = createSingleFlightPoller({
      intervalMs: 1000,
      poll,
      scheduler: {
        schedule(callback) {
          callbacks.push(callback)
          return callback
        },
        cancel: vi.fn(),
      },
    })

    poller.start()
    const first = poller.trigger()
    const second = poller.trigger()
    expect(poll).toHaveBeenCalledTimes(1)
    release()
    await Promise.all([first, second])
    expect(poller.inFlight()).toBe(false)
    poller.stop()
  })

  it("respects the application activity gate", async () => {
    const poll = vi.fn(async () => {})
    const poller = createSingleFlightPoller({
      intervalMs: 1000,
      poll,
      isActive: () => false,
      scheduler: {
        schedule: callback => callback,
        cancel: vi.fn(),
      },
    })
    poller.start()
    await poller.trigger()
    expect(poll).not.toHaveBeenCalled()
  })
})

describe("a poll that never settles", () => {
  /** Drains microtasks so the loop has a chance to re-arm. */
  const flush = async () => { for (let tick = 0; tick < 12; tick++) await Promise.resolve() }

  /**
   * The failure this reproduces: background sync silently dying for the rest of
   * a session. `schedule` only re-arms inside `.finally()` of the in-flight
   * poll, and `trigger()` hands back the existing promise while one is pending.
   * So a single request that never answers — a fetch with no timeout — left
   * `pending` set forever, nothing was ever rescheduled, and even returning to
   * the foreground got the same stuck promise. The clinician saw queued work
   * that only moved when they pressed sync by hand.
   */
  function harness() {
    const timers: Array<{ callback: () => void; delayMs: number }> = []
    const poll = vi.fn(() => new Promise<void>(() => {})) // never settles
    const poller = createSingleFlightPoller({
      intervalMs: 1_000,
      watchdogMs: 5_000,
      poll,
      scheduler: {
        schedule(callback, delayMs) {
          timers.push({ callback, delayMs })
          return timers.length
        },
        cancel(handle) {
          const index = (handle as number) - 1
          if (timers[index]) timers[index] = { callback: () => {}, delayMs: -1 }
        },
      },
    })
    const fire = (delayMs: number) => {
      const index = timers.findIndex(t => t.delayMs === delayMs)
      if (index === -1) throw new Error(`no timer scheduled for ${delayMs}ms`)
      const [entry] = timers.splice(index, 1)
      entry!.callback()
    }
    return { poller, poll, timers, fire }
  }

  it("gives up on a hung poll so the loop can re-arm", async () => {
    const { poller, poll, fire } = harness()
    poller.start()

    fire(1_000)                       // interval tick → starts a poll that hangs
    expect(poll).toHaveBeenCalledTimes(1)
    expect(poller.inFlight()).toBe(true)

    fire(5_000)                       // watchdog deadline
    await flush()

    expect(poller.inFlight()).toBe(false)
    poller.stop()
  })

  it("runs a fresh poll on the next tick instead of dying", async () => {
    const { poller, poll, fire } = harness()
    poller.start()

    fire(1_000)
    fire(5_000)
    await flush()

    fire(1_000)                       // the loop must have re-armed
    expect(poll).toHaveBeenCalledTimes(2)
    poller.stop()
  })

  it("a late poll cannot clear a newer run", async () => {
    const timers: Array<{ callback: () => void; delayMs: number }> = []
    let settleFirst!: () => void
    let calls = 0
    const poll = vi.fn(() => {
      calls += 1
      return calls === 1
        ? new Promise<void>(resolve => { settleFirst = resolve })
        : new Promise<void>(() => {})
    })
    const poller = createSingleFlightPoller({
      intervalMs: 1_000,
      watchdogMs: 5_000,
      poll,
      scheduler: {
        schedule(callback, delayMs) { timers.push({ callback, delayMs }); return timers.length },
        cancel() {},
      },
    })
    const fire = (delayMs: number) => {
      const index = timers.findIndex(t => t.delayMs === delayMs)
      const [entry] = timers.splice(index, 1)
      entry!.callback()
    }

    poller.start()
    fire(1_000)
    fire(5_000)                        // abandon run 1
    await flush()
    fire(1_000)                        // run 2 starts and hangs
    expect(poller.inFlight()).toBe(true)

    settleFirst()                      // run 1 finally answers, far too late
    await flush()

    // Run 2 must still be considered in flight; the stale run must not free it.
    expect(poller.inFlight()).toBe(true)
    poller.stop()
  })
})
