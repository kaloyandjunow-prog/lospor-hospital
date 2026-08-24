import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ResearchSelfAuthorization } from "./research-self-authorization"

const replace = vi.fn()
const refresh = vi.fn()

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, refresh }),
}))

const copy = {
  title: "Temporary aggregate access",
  description: "Aggregate only for eight hours.",
  limit: "Once per 24 hours.",
  checking: "Checking...",
  activate: "Activate for 8 hours",
  activating: "Activating...",
  next: "Available again",
  failed: "Could not activate.",
}

describe("ResearchSelfAuthorization", () => {
  beforeEach(() => {
    replace.mockReset()
    refresh.mockReset()
  })
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it("activates only the advertised aggregate window", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        eligible: true,
        activeUntil: null,
        nextEligibleAt: "2026-08-22T12:00:00.000Z",
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        activeUntil: "2026-08-22T20:00:00.000Z",
        nextEligibleAt: "2026-08-23T12:00:00.000Z",
      }), { status: 201 }))
    vi.stubGlobal("fetch", fetchMock)

    render(<ResearchSelfAuthorization locale="en" copy={copy} />)
    fireEvent.click(await screen.findByRole("button", { name: copy.activate }))
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/overview"))
    expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/research/self-authorization", { method: "POST" })
  })

  it("shows the rolling cooldown without offering activation", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      eligible: false,
      activeUntil: null,
      nextEligibleAt: "2026-08-23T12:00:00.000Z",
    }), { status: 200 })))
    render(<ResearchSelfAuthorization locale="en" copy={copy} />)
    expect(await screen.findByText(/Available again/)).toBeTruthy()
    expect(screen.queryByRole("button")).toBeNull()
  })
})
