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
