import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))
const access = vi.hoisted(() => vi.fn())
vi.mock("@/lib/hospital/external-ai-policy", () => ({ externalAiProviderAccess: access }))

import { checkMistralKey, keyCheckState, mistralKeyCheck, resetMistralKeyCheck } from "./mistral-key-check"

// The overview map's Mistral box (1.5.6): green only while Mistral accepts the key.
describe("the hourly Mistral key check", () => {
  const fetchMock = vi.fn()
  beforeEach(() => {
    resetMistralKeyCheck()
    vi.stubGlobal("fetch", fetchMock)
    fetchMock.mockReset()
    access.mockReset()
    delete process.env.MISTRAL_API_BASE
  })
  afterEach(() => vi.unstubAllGlobals())

  it("reads a refused key from 401 or 403, and anything else that fails as not answering", () => {
    expect(keyCheckState(200)).toBe("ok")
    expect(keyCheckState(401)).toBe("key-refused")
    expect(keyCheckState(403)).toBe("key-refused")
    expect(keyCheckState(429)).toBe("unreachable")
    expect(keyCheckState(503)).toBe("unreachable")
    expect(keyCheckState(null)).toBe("unreachable")
  })

  it("asks the EU endpoint for its model list, with the key and no clinical data", async () => {
    const fetcher = vi.fn(async () => new Response("{}", { status: 200 }))
    const check = await checkMistralKey("sk-test", fetcher as unknown as typeof fetch, Date.parse("2026-10-11T09:00:00Z"))
    expect(check).toEqual({ state: "ok", checkedAt: "2026-10-11T09:00:00.000Z" })
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe("https://api.eu.mistral.ai/v1/models")
    expect(init.method ?? "GET").toBe("GET")
    expect(init.body).toBeUndefined()
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer sk-test")
  })

  it("calls a network failure not answering", async () => {
    const check = await checkMistralKey("sk-test", (async () => { throw new TypeError("fetch failed") }) as unknown as typeof fetch)
    expect(check.state).toBe("unreachable")
  })

  it("never makes the snapshot wait: reports the last answer and checks again only after an hour", async () => {
    access.mockResolvedValue({ enabled: true, apiKey: "sk-one" })
    fetchMock.mockResolvedValue(new Response("{}", { status: 401 }))
    const start = Date.now()
    expect(await mistralKeyCheck(start)).toBeUndefined()
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    await vi.waitFor(async () => expect((await mistralKeyCheck(start))?.state).toBe("key-refused"))
    await mistralKeyCheck(start + 30 * 60_000)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    await mistralKeyCheck(start + 61 * 60_000)
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
  })

  it("checks a replaced key at once instead of reporting the old key's answer", async () => {
    access.mockResolvedValue({ enabled: true, apiKey: "sk-old" })
    fetchMock.mockResolvedValue(new Response("{}", { status: 401 }))
    await mistralKeyCheck()
    await vi.waitFor(async () => expect((await mistralKeyCheck())?.state).toBe("key-refused"))
    access.mockResolvedValue({ enabled: true, apiKey: "sk-new" })
    fetchMock.mockResolvedValue(new Response("{}", { status: 200 }))
    expect(await mistralKeyCheck()).toBeUndefined()
    await vi.waitFor(async () => expect((await mistralKeyCheck())?.state).toBe("ok"))
  })

  it("does nothing while AI is off", async () => {
    access.mockResolvedValue({ enabled: false, reason: "DISABLED_BY_DEPLOYMENT" })
    expect(await mistralKeyCheck()).toBeUndefined()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
