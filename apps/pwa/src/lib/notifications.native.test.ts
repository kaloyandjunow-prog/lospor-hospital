import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("expo-constants", () => ({
  default: { appOwnership: "expo" },
  AppOwnership: { Expo: "expo" },
}))

vi.mock("react-native", () => ({
  Platform: { OS: "android" },
}))

describe("native notifications in Expo Go", () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it("does not load the unavailable native notifications module", async () => {
    const notifications = await import("./notifications.native")

    expect(() => notifications.configureForeground()).not.toThrow()
    await expect(notifications.getStatus()).resolves.toMatchObject({
      supported: false,
      permission: "unsupported",
    })
  })
})