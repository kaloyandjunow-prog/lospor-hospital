import { describe, expect, it } from "vitest"

import {
  ADVISOR_MODELS,
  VISION_MODELS,
  advisorModelOrDefault,
  mistralModelUnavailable,
  visionModelOrDefault,
} from "./external-ai-models"

describe("pinned Mistral models", () => {
  it("offers only dated identifiers, never a moving alias or a retired model", () => {
    for (const model of [...ADVISOR_MODELS, ...VISION_MODELS]) {
      expect(model).toMatch(/-\d{4}$/)
      expect(model).not.toMatch(/latest/)
    }
    expect([...ADVISOR_MODELS, ...VISION_MODELS]).not.toContain("open-mistral-7b")
    expect([...ADVISOR_MODELS, ...VISION_MODELS]).not.toContain("pixtral-12b-2409")
  })

  it("keeps a listed choice and replaces anything else with the default", () => {
    expect(advisorModelOrDefault("mistral-medium-2508")).toBe("mistral-medium-2508")
    expect(advisorModelOrDefault(null)).toBe("mistral-small-2603")
    expect(advisorModelOrDefault("mistral-small-2506")).toBe("mistral-small-2603")
    expect(visionModelOrDefault("mistral-small-2506")).toBe("mistral-small-2506")
    expect(visionModelOrDefault("pixtral-12b-2409")).toBe("mistral-large-2512")
    expect(visionModelOrDefault(undefined)).toBe("mistral-large-2512")
  })
})

describe("mistralModelUnavailable", () => {
  it("recognises Mistral refusing an unknown or retired model", async () => {
    await expect(mistralModelUnavailable(new Response(
      JSON.stringify({ object: "error", message: "Invalid model: pixtral-12b-2409", type: "invalid_model", code: "1500" }),
      { status: 400 },
    ))).resolves.toBe(true)
    await expect(mistralModelUnavailable(new Response("The model open-mistral-7b has been deprecated", { status: 404 })))
      .resolves.toBe(true)
  })

  it("does not blame the model for other failures", async () => {
    await expect(mistralModelUnavailable(new Response("Unauthorized", { status: 401 }))).resolves.toBe(false)
    await expect(mistralModelUnavailable(new Response("rate limited", { status: 429 }))).resolves.toBe(false)
    await expect(mistralModelUnavailable(new Response("invalid_model", { status: 500 }))).resolves.toBe(false)
    await expect(mistralModelUnavailable(new Response(JSON.stringify({ message: "Prompt too long" }), { status: 400 })))
      .resolves.toBe(false)
  })

  it("leaves the original body readable", async () => {
    const response = new Response("invalid_model", { status: 400 })
    await mistralModelUnavailable(response)
    await expect(response.text()).resolves.toBe("invalid_model")
  })
})
