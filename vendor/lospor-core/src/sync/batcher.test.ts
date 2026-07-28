import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createCoalescingBatcher } from "./batcher"

describe("createCoalescingBatcher", () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it("coalesces rapid submissions into one run with the merged payload", async () => {
    const run = vi.fn(async (merged: Record<string, unknown>) => merged)
    const batcher = createCoalescingBatcher(run, 500)

    const p1 = batcher.submit({ positions: ["supine"] })
    vi.advanceTimersByTime(200)
    const p2 = batcher.submit({ positions: ["supine", "lithotomy"] })
    vi.advanceTimersByTime(200)
    const p3 = batcher.submit({ positions: ["supine", "lithotomy", "trendelenburg"], monitoring: ["ecg"] })

    expect(run).not.toHaveBeenCalled()
    vi.advanceTimersByTime(500)

    await expect(p1).resolves.toEqual({ positions: ["supine", "lithotomy", "trendelenburg"], monitoring: ["ecg"] })
    expect(await p2).toBe(await p1)
    expect(await p3).toBe(await p1)
    expect(run).toHaveBeenCalledTimes(1)
  })

  it("later keys win in the merge", async () => {
    const run = vi.fn(async (merged: Record<string, unknown>) => merged)
    const batcher = createCoalescingBatcher(run, 100)

    void batcher.submit({ positions: ["a"], startTime: "08:00" })
    const p = batcher.submit({ positions: ["b"] })
    vi.advanceTimersByTime(100)

    await expect(p).resolves.toEqual({ positions: ["b"], startTime: "08:00" })
  })

  it("a submission during an in-flight run starts a fresh batch", async () => {
    let release!: (v: string) => void
    const run = vi.fn((merged: Record<string, unknown>) =>
      run.mock.calls.length === 1
        ? new Promise<string>((r) => { release = r })
        : Promise.resolve(`second:${JSON.stringify(merged)}`),
    )
    const batcher = createCoalescingBatcher(run, 100)

    const first = batcher.submit({ a: 1 })
    vi.advanceTimersByTime(100) // first batch fires, run in flight

    const second = batcher.submit({ b: 2 })
    vi.advanceTimersByTime(100) // second batch fires independently

    release("first")
    await expect(first).resolves.toBe("first")
    await expect(second).resolves.toBe('second:{"b":2}')
    expect(run).toHaveBeenCalledTimes(2)
  })

  it("rejections propagate to every submitter of the batch", async () => {
    const run = vi.fn(async () => { throw new Error("boom") })
    const batcher = createCoalescingBatcher(run, 100)

    const p1 = batcher.submit({ a: 1 })
    const p2 = batcher.submit({ b: 2 })
    vi.advanceTimersByTime(100)

    await expect(p1).rejects.toThrow("boom")
    await expect(p2).rejects.toThrow("boom")
  })

  it("flush() fires the pending batch immediately; no-op when empty", async () => {
    const run = vi.fn(async (m: Record<string, unknown>) => m)
    const batcher = createCoalescingBatcher(run, 10_000)

    expect(batcher.flush()).toBeUndefined()
    const p = batcher.submit({ a: 1 })
    expect(batcher.pending).toBe(true)
    const flushed = batcher.flush()
    await expect(flushed).resolves.toEqual({ a: 1 })
    await expect(p).resolves.toEqual({ a: 1 })
    expect(batcher.pending).toBe(false)
    expect(run).toHaveBeenCalledTimes(1)
  })
})
