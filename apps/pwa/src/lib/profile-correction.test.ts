import { beforeEach, describe, expect, it, vi } from "vitest"
import { apiJson } from "./api"
import {
  saveProfileCorrection,
  validateProfileCorrection,
} from "./profile-correction"

vi.mock("./api", () => ({ apiJson: vi.fn() }))

const mockedApiJson = vi.mocked(apiJson)

beforeEach(() => {
  mockedApiJson.mockReset()
})

describe("profile correction", () => {
  it("normalizes the three self-service identity fields", () => {
    expect(validateProfileCorrection({
      firstName: "  Ana  Maria ",
      lastName: " Petrova ",
      title: "  Dr  ",
    })).toEqual({
      ok: true,
      value: { firstName: "Ana Maria", lastName: "Petrova", title: "Dr" },
    })
  })

  it("requires both name fields before making a request", async () => {
    await expect(saveProfileCorrection({ firstName: "", lastName: "Petrova", title: "Dr" }))
      .rejects.toThrow("NAME_REQUIRED")
    expect(mockedApiJson).not.toHaveBeenCalled()
  })

  it("patches only the supported fields and uses the current response", async () => {
    mockedApiJson.mockResolvedValue({
      name: "Prof Grace Hopper",
      firstName: "Grace",
      lastName: "Hopper",
      title: "Prof",
      institution: { id: "hospital-1", name: "Hospital", city: "Sofia" },
    })

    await expect(saveProfileCorrection({
      firstName: " Grace ",
      lastName: " Hopper ",
      title: " Prof ",
    })).resolves.toMatchObject({ name: "Prof Grace Hopper", lastName: "Hopper" })

    expect(mockedApiJson).toHaveBeenCalledWith("/api/user", {
      method: "PATCH",
      body: JSON.stringify({ firstName: "Grace", lastName: "Hopper", title: "Prof" }),
    })
  })
})
