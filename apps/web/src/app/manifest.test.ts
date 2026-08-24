import { afterEach, describe, expect, it, vi } from "vitest"
import manifest, { dynamic } from "./manifest"

describe("PWA manifest locale", () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it("is request-time generated for runtime installer configuration", () => {
    expect(dynamic).toBe("force-dynamic")
  })

  it("uses English only for the exact supported installer value", () => {
    vi.stubEnv("LOSPOR_DEFAULT_LOCALE", "en")
    expect(manifest()).toEqual(expect.objectContaining({
      lang: "en",
      name: expect.stringContaining("Perioperative"),
    }))
  })

  it("uses Bulgarian when the installer value is absent or invalid", () => {
    vi.stubEnv("LOSPOR_DEFAULT_LOCALE", "not-a-locale")
    expect(manifest()).toEqual(expect.objectContaining({
      lang: "bg",
      name: expect.stringContaining("Периоперативен"),
    }))
  })
})
