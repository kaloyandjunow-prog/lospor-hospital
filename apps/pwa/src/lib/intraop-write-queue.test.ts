import { beforeEach, describe, expect, it } from "vitest"
import {
  clearIntraopWriteQueuesForTest,
  enqueueIntraopCaseWrite,
} from "@/lib/intraop-write-queue"

function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

describe("intraop write queue", () => {
  beforeEach(() => {
    clearIntraopWriteQueuesForTest()
  })

  it("runs same-case writes sequentially", async () => {
    const order: string[] = []
    const first = enqueueIntraopCaseWrite("case-1", async () => {
      order.push("first:start")
      await delay(10)
      order.push("first:end")
    })
    const second = enqueueIntraopCaseWrite("case-1", async () => {
      order.push("second:start")
      order.push("second:end")
    })

    await Promise.all([first, second])

    expect(order).toEqual(["first:start", "first:end", "second:start", "second:end"])
  })

  it("does not block unrelated cases", async () => {
    const order: string[] = []
    let releaseFirst!: () => void
    const first = enqueueIntraopCaseWrite("case-1", async () => {
      order.push("case-1:start")
      await new Promise<void>(resolve => { releaseFirst = resolve })
      order.push("case-1:end")
    })
    const second = enqueueIntraopCaseWrite("case-2", async () => {
      order.push("case-2:start")
      order.push("case-2:end")
    })

    await delay(0)
    expect(order).toEqual(["case-1:start", "case-2:start", "case-2:end"])
    releaseFirst()
    await Promise.all([first, second])
  })

  it("continues after a failed write", async () => {
    const order: string[] = []
    await expect(enqueueIntraopCaseWrite("case-1", async () => {
      order.push("failed")
      throw new Error("boom")
    })).rejects.toThrow("boom")

    await enqueueIntraopCaseWrite("case-1", async () => {
      order.push("next")
    })

    expect(order).toEqual(["failed", "next"])
  })
})
