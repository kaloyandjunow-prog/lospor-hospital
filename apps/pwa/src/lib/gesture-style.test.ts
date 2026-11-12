import { afterEach, describe, expect, it, vi } from "vitest"

afterEach(() => { vi.resetModules(); vi.doUnmock("react-native") })

async function styleOn(os: "web" | "ios") {
  vi.resetModules()
  vi.doMock("react-native", () => ({ Platform: { OS: os } }))
  return (await import("./gesture-style")).SIDE_SCROLL_STYLE
}

describe("the side-scroll style for rails inside a page that scrolls down", () => {
  it("leaves a rail only the horizontal pan on the web, and does not pass a finished swipe on to the page", async () => {
    expect(await styleOn("web")).toEqual({ touchAction: "pan-x", overscrollBehaviorX: "contain" })
  })

  it("is empty on the phone, where the native scroll views already settle the direction", async () => {
    expect(await styleOn("ios")).toEqual({})
  })
})
