import { describe, expect, it } from "vitest"
import { createSingleFlightQueue } from "./single-flight-queue"

describe("createSingleFlightQueue", () => {
  it("runs operations one at a time in enqueue order", async () => {
    const queue = createSingleFlightQueue()
    const order: string[] = []
    let releaseFirst!: () => void
    const firstStarted = new Promise<void>((resolve) => {
      void queue.enqueue(async () => {
        order.push("first-start")
        resolve()
        await new Promise<void>((release) => { releaseFirst = release })
        order.push("first-end")
      })
    })

    await firstStarted

    const second = queue.enqueue(async () => {
      order.push("second")
      return 2
    })

    await Promise.resolve()
    expect(order).toEqual(["first-start"])

    releaseFirst()
    await expect(second).resolves.toBe(2)
    expect(order).toEqual(["first-start", "first-end", "second"])
  })

  it("continues after a failed operation", async () => {
    const queue = createSingleFlightQueue()

    await expect(queue.enqueue(async () => {
      throw new Error("boom")
    })).rejects.toThrow("boom")

    await expect(queue.enqueue(async () => "next")).resolves.toBe("next")
    await expect(queue.idle()).resolves.toBeUndefined()
  })
})
