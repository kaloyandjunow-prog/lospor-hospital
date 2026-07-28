import { describe, expect, it, vi } from "vitest"
import { CaseLockLease } from "./case-lock"

describe("CaseLockLease", () => {
  it("acquires, heartbeats, and releases a lease", async () => {
    const transport = {
      acquire: vi.fn(async () => ({ acquired: true })),
      heartbeat: vi.fn(async () => ({ acquired: true })),
      release: vi.fn(async () => {}),
    }
    const lease = new CaseLockLease("case", "device", transport)

    await expect(lease.acquire()).resolves.toMatchObject({ status: "owned", editable: true })
    await expect(lease.heartbeat()).resolves.toMatchObject({ status: "owned" })
    await lease.release()
    expect(lease.state()).toMatchObject({ status: "idle", editable: true })
  })

  it("force releases before takeover", async () => {
    const order: string[] = []
    const transport = {
      acquire: vi.fn(async () => {
        order.push("acquire")
        return { acquired: true }
      }),
      heartbeat: vi.fn(async () => ({ acquired: true })),
      release: vi.fn(async ({ force }: { force?: boolean }) => {
        order.push(force ? "force-release" : "release")
      }),
    }
    const lease = new CaseLockLease("case", "device", transport)

    await lease.takeover()
    expect(order).toEqual(["force-release", "acquire"])
  })

  it("fails open when lock infrastructure is unavailable", async () => {
    const transport = {
      acquire: vi.fn(async () => { throw new Error("offline") }),
      heartbeat: vi.fn(async () => { throw new Error("offline") }),
      release: vi.fn(async () => {}),
    }
    const lease = new CaseLockLease("case", "device", transport)
    await expect(lease.acquire()).resolves.toMatchObject({
      status: "unavailable",
      editable: true,
    })
  })
})
