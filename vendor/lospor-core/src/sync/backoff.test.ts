import { describe, expect, it } from "vitest"
import { createBackoffPolicy } from "./backoff"

describe("createBackoffPolicy", () => {
  it("returns the steady delay while healthy or idle", () => {
    const policy = createBackoffPolicy()
    expect(policy.nextDelay("ok")).toBe(15_000)
    expect(policy.nextDelay("idle")).toBe(15_000)
    expect(policy.failureCount).toBe(0)
  })

  it("escalates through the failure steps and caps at the last one", () => {
    const policy = createBackoffPolicy()
    expect(policy.nextDelay("failed")).toBe(5_000)
    expect(policy.nextDelay("failed")).toBe(15_000)
    expect(policy.nextDelay("failed")).toBe(60_000)
    expect(policy.nextDelay("failed")).toBe(60_000)
    expect(policy.failureCount).toBe(4)
  })

  it("a success after failures returns to the steady rhythm", () => {
    const policy = createBackoffPolicy()
    policy.nextDelay("failed")
    policy.nextDelay("failed")
    expect(policy.nextDelay("ok")).toBe(15_000)
    expect(policy.nextDelay("failed")).toBe(5_000) // streak restarted
  })

  it("reset() forgets the failure streak (reconnect/foreground)", () => {
    const policy = createBackoffPolicy()
    policy.nextDelay("failed")
    policy.nextDelay("failed")
    policy.reset()
    expect(policy.failureCount).toBe(0)
    expect(policy.nextDelay("failed")).toBe(5_000)
  })

  it("honors custom steps and steady delay", () => {
    const policy = createBackoffPolicy({ steadyMs: 1000, failureSteps: [100, 200] })
    expect(policy.nextDelay("failed")).toBe(100)
    expect(policy.nextDelay("failed")).toBe(200)
    expect(policy.nextDelay("failed")).toBe(200)
    expect(policy.nextDelay("ok")).toBe(1000)
  })
})
