import React from "react"
import { act } from "react-test-renderer"
import { describe, expect, it, vi } from "vitest"

// The write paths read `isWatchingRef` outside render, so it must follow the
// lock the moment it changes: watching while another device holds the case,
// and not once this one has taken over (1.4.14 appliance test).

const server = vi.hoisted(() => ({ heldByOther: true }))
vi.mock("expo-secure-store", () => ({
  getItemAsync: vi.fn(async () => "mob-test-device"),
  setItemAsync: vi.fn(async () => {}),
}))
vi.mock("@/lib/api", () => ({
  apiFetch: vi.fn(async (_url: string, init: { method: string }) => {
    if (init.method === "DELETE") { server.heldByOther = false; return new Response("{}", { status: 200 }) }
    if (server.heldByOther) return new Response(JSON.stringify({ lockedBy: "other-device" }), { status: 409 })
    return new Response("{}", { status: 200 })
  }),
}))

import { render } from "@/test/render"
import { useCaseLock } from "./use-case-lock"

describe("the case lock's watching ref", () => {
  it("is set while another device holds the case and cleared by taking over", async () => {
    let lock!: ReturnType<typeof useCaseLock>
    function Harness() {
      lock = useCaseLock("case-l", true)
      return null
    }
    await act(async () => {
      render(<Harness />)
      await new Promise(resolve => setTimeout(resolve, 20))
    })
    expect(lock.isWatching).toBe(true)
    expect(lock.isWatchingRef.current).toBe(true)

    await act(async () => {
      await lock.takeover()
      await new Promise(resolve => setTimeout(resolve, 20))
    })
    expect(lock.isWatchingRef.current).toBe(false)
    expect(lock.isWatching).toBe(false)
  })
})
