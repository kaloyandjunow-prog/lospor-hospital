import { afterEach, beforeEach, describe, expect, it } from "vitest"
import {
  deleteItemAsync,
  getItemAsync,
  setItemAsync,
} from "./secure-store-web"

function memoryStorage(): Storage {
  const values = new Map<string, string>()
  return {
    get length() { return values.size },
    clear: () => values.clear(),
    getItem: key => values.get(key) ?? null,
    key: index => [...values.keys()][index] ?? null,
    removeItem: key => { values.delete(key) },
    setItem: (key, value) => { values.set(key, value) },
  }
}

describe("PWA secure-store compatibility boundary", () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, "localStorage", {
      value: memoryStorage(),
      configurable: true,
    })
  })

  afterEach(() => {
    delete (globalThis as { localStorage?: Storage }).localStorage
  })

  it("removes a legacy bearer token and never returns it to JavaScript", async () => {
    localStorage.setItem("lospor_ss_lospor_access_token", "legacy-jwt")
    await expect(getItemAsync("lospor_access_token")).resolves.toBeNull()
    expect(localStorage.getItem("lospor_ss_lospor_access_token")).toBeNull()
  })

  it("refuses every attempt to persist a browser bearer token", async () => {
    await expect(setItemAsync("lospor_access_token", "jwt"))
      .rejects.toThrow("Browser bearer-token storage is disabled")
    expect(localStorage.length).toBe(0)
  })

  it("retains ordinary non-secret PWA preferences", async () => {
    await setItemAsync("language", "bg")
    await expect(getItemAsync("language")).resolves.toBe("bg")
    await deleteItemAsync("language")
    await expect(getItemAsync("language")).resolves.toBeNull()
  })
})
