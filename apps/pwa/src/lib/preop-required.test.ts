import { beforeEach, describe, expect, it, vi } from "vitest"

const apiJson = vi.hoisted(() => vi.fn())
vi.mock("./api", () => ({ apiJson }))

import { fetchMissingRequiredPreop, missingRequiredPreopMessage } from "./preop-required"

describe("the continue-to-intraop required-question gate", () => {
  const missing = [{ stableKey: "BASE_SMOKING", labelEn: "Smoking", labelBg: "Тютюнопушене", fields: ["smoking"] }]

  beforeEach(() => { apiJson.mockReset() })

  it("reads what the case says is still unanswered", async () => {
    apiJson.mockResolvedValue({ preopRequiredMissing: [...missing, { junk: true }] })
    await expect(fetchMissingRequiredPreop("case-1")).resolves.toEqual(missing)
  })

  it("never keeps the clinician out of intraop because the read failed", async () => {
    apiJson.mockImplementation(async () => { throw new TypeError("offline") })
    await expect(fetchMissingRequiredPreop("case-1")).resolves.toEqual([])
  })

  it("lists the questions in the clinician's language under the form's own heading", () => {
    expect(missingRequiredPreopMessage(missing, "bg", "Попълнете:")).toBe("Попълнете:\n\n- Тютюнопушене")
    expect(missingRequiredPreopMessage(missing, "en", "Complete:")).toBe("Complete:\n\n- Smoking")
  })
})
