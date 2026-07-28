import { describe, expect, it } from "vitest"
import { createCaseWriteQueue } from "./case-write-queue"

// Core's tsconfig has no DOM/node lib; the test runtime provides timers.
declare function setTimeout(handler: () => void, timeout?: number): unknown

function delay(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms))
}

describe("createCaseWriteQueue", () => {
  it("runs same-case writes sequentially", async () => {
    const queue = createCaseWriteQueue()
    const order: string[] = []
    const first = queue.enqueue("case-1", async () => {
      order.push("first:start")
      await delay(10)
      order.push("first:end")
    })
    const second = queue.enqueue("case-1", async () => {
      order.push("second:start")
      order.push("second:end")
    })

    await Promise.all([first, second])

    expect(order).toEqual(["first:start", "first:end", "second:start", "second:end"])
  })

  it("does not block unrelated cases", async () => {
    const queue = createCaseWriteQueue()
    const order: string[] = []
    let releaseFirst!: () => void
    const first = queue.enqueue("case-1", async () => {
      order.push("case-1:start")
      await new Promise<void>((resolve) => { releaseFirst = resolve })
      order.push("case-1:end")
    })
    const second = queue.enqueue("case-2", async () => {
      order.push("case-2:start")
      order.push("case-2:end")
    })

    await delay(0)
    expect(order).toEqual(["case-1:start", "case-2:start", "case-2:end"])
    releaseFirst()
    await Promise.all([first, second])
  })

  it("continues after a failed write", async () => {
    const queue = createCaseWriteQueue()
    const order: string[] = []
    await expect(queue.enqueue("case-1", async () => {
      order.push("failed")
      throw new Error("boom")
    })).rejects.toThrow("boom")

    await queue.enqueue("case-1", async () => {
      order.push("next")
    })

    expect(order).toEqual(["failed", "next"])
  })

  it("clear() forgets queues without cancelling running work", async () => {
    const queue = createCaseWriteQueue()
    const done = queue.enqueue("case-1", async () => "ok")
    queue.clear()
    await expect(done).resolves.toBe("ok")
    await expect(queue.enqueue("case-1", async () => "fresh")).resolves.toBe("fresh")
  })
})
