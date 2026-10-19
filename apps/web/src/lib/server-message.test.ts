import { afterEach, describe, expect, it, vi } from "vitest"
import { failedSaveMessage } from "./blocked-save-message"
import { serverMessage } from "./server-message"

afterEach(() => vi.unstubAllGlobals())

const pageIn = (lang: string) => vi.stubGlobal("document", { documentElement: { lang } })

describe("server messages in the page's language", () => {
  it("follows <html lang>", () => {
    pageIn("bg")
    expect(serverMessage("Case is finalised")).toBe("Случаят е приключен")
    pageIn("en")
    expect(serverMessage("Case is finalised")).toBe("Case is finalised")
  })

  it("stays English where there is no page (server rendering)", () => {
    expect(serverMessage("Case is finalised")).toBe("Case is finalised")
  })

  it("explains a failed save by the server's message or its status", () => {
    pageIn("bg")
    expect(failedSaveMessage({ error: "Case is finalised" }, 409)).toBe("Случаят е приключен")
    expect(failedSaveMessage({}, 502)).toBe("Записът не успя (HTTP 502)")
  })
})
