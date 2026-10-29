import { beforeEach, describe, expect, it, vi } from "vitest"

const apiJson = vi.fn()
vi.mock("@/lib/api", async () => {
  class ApiError extends Error {
    sourceMessage: string
    constructor(message: string, public status: number, public code?: string, public serverVersion?: unknown, public details?: Record<string, unknown>) {
      super(message)
      this.sourceMessage = message
    }
  }
  return { ApiError, apiJson: (...args: unknown[]) => apiJson(...args) }
})

import { ApiError } from "@/lib/api"
import { assignCaseTheatre, dashboardFilterQuery, TheatreChangedError } from "./use-operating-theatres"

describe("assigning a theatre from the phone (10.0.0)", () => {
  beforeEach(() => { apiJson.mockReset() })

  it("sends the theatre the screen showed", async () => {
    apiJson.mockResolvedValue({ theatreId: "b" })
    await assignCaseTheatre("c1", "b", "a")
    expect(JSON.parse(apiJson.mock.calls[0][1].body)).toEqual({ theatreId: "b", expectedTheatreId: "a" })
  })

  it("turns a refusal for a case changed meanwhile into what it has now and who set it", async () => {
    apiJson.mockRejectedValue(new ApiError("THEATRE_CHANGED", 409, "THEATRE_CHANGED", undefined, {
      error: "THEATRE_CHANGED", current: { id: "a", name: "Зала 1" }, changedBy: "Dr Head",
    }))
    const error = await assignCaseTheatre("c1", "b", null).catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(TheatreChangedError)
    expect(error).toMatchObject({ current: { id: "a", name: "Зала 1" }, changedBy: "Dr Head" })
  })

  it("passes any other refusal on", async () => {
    apiJson.mockRejectedValue(new ApiError("THEATRE_LOCKED_INTRAOP_STARTED", 409))
    await expect(assignCaseTheatre("c1", "b", "a")).rejects.not.toBeInstanceOf(TheatreChangedError)
  })

  it("puts the dashboard filters on the case list", () => {
    expect(dashboardFilterQuery({ theatre: "none", assignee: "u1" })).toBe("&theatre=none&assignee=u1")
    expect(dashboardFilterQuery({ theatre: null, assignee: null })).toBe("")
  })
})
