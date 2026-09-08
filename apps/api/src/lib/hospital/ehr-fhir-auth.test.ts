import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))
vi.mock("@/lib/prisma", () => ({ prisma: {} }))

import {
  clearEhrTokenCache,
  forgetEhrAccessToken,
  resolveEhrAccessToken,
} from "./ehr-fhir-auth"

/**
 * Two auth modes, because supporting only one means working against exactly
 * the wrong half of the sites that want this. Above the token they are
 * identical — the transport asks for a bearer string and does not know which
 * mode produced it.
 */

const NOW = 1_000_000

const OAUTH = {
  mode: "OAUTH2_CLIENT_CREDENTIALS" as const,
  tokenUrl: "https://auth.example/token",
  clientId: "lospor",
  clientSecret: "s3cret",
}

function token(body: unknown, status = 200) {
  return vi.fn(async () => new Response(JSON.stringify(body), {
    status, headers: { "Content-Type": "application/json" },
  })) as unknown as typeof fetch
}

beforeEach(() => clearEhrTokenCache())

describe("a static token is passed straight through", () => {
  it("returns what the site configured", async () => {
    const result = await resolveEhrAccessToken(
      { mode: "STATIC_BEARER", credential: "abc" },
    )

    expect(result).toEqual({ ok: true, token: "abc" })
  })

  it("says so when there is no credential rather than sending an empty bearer", async () => {
    const result = await resolveEhrAccessToken({ mode: "STATIC_BEARER", credential: "" })

    expect(result).toMatchObject({ ok: false, permanent: true, errorCode: "CREDENTIAL_MISSING" })
  })

  it("makes no network call at all", async () => {
    const send = token({})
    await resolveEhrAccessToken({ mode: "STATIC_BEARER", credential: "abc" }, { fetchImpl: send })

    expect(send).not.toHaveBeenCalled()
  })
})

describe("client credentials are exchanged for a short-lived token", () => {
  it("posts the grant and returns the access token", async () => {
    const send = token({ access_token: "t-1", expires_in: 600 })
    const result = await resolveEhrAccessToken(OAUTH, { fetchImpl: send, now: NOW })

    expect(result).toEqual({ ok: true, token: "t-1" })
    const [url, init] = (send as unknown as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(url).toBe("https://auth.example/token")
    expect(String(init.body)).toContain("grant_type=client_credentials")
  })

  it("sends the secret in the header, not the body", async () => {
    // Keeps it out of the place most likely to reach a log or a proxy trace.
    const send = token({ access_token: "t-1" })
    await resolveEhrAccessToken(OAUTH, { fetchImpl: send, now: NOW })

    const init = (send as unknown as ReturnType<typeof vi.fn>).mock.calls[0][1]
    expect(init.headers.Authorization).toBe(
      `Basic ${Buffer.from("lospor:s3cret", "utf8").toString("base64")}`,
    )
    expect(String(init.body)).not.toContain("s3cret")
  })

  it("sends a scope only when one is configured", async () => {
    const withScope = token({ access_token: "t" })
    await resolveEhrAccessToken({ ...OAUTH, scope: "system/*.rw" }, { fetchImpl: withScope, now: NOW })
    expect(String((withScope as unknown as ReturnType<typeof vi.fn>).mock.calls[0][1].body))
      .toContain("scope=system")

    clearEhrTokenCache()
    const without = token({ access_token: "t" })
    await resolveEhrAccessToken(OAUTH, { fetchImpl: without, now: NOW })
    expect(String((without as unknown as ReturnType<typeof vi.fn>).mock.calls[0][1].body))
      .not.toContain("scope")
  })

  it("refuses when there is nowhere to exchange them", async () => {
    const result = await resolveEhrAccessToken(
      { ...OAUTH, tokenUrl: "" }, { now: NOW },
    )

    expect(result).toMatchObject({ permanent: true, errorCode: "TOKEN_URL_NOT_CONFIGURED" })
  })
})

describe("tokens are reused until they are nearly expired", () => {
  it("does not buy a new token for every message", async () => {
    const send = token({ access_token: "t-1", expires_in: 600 })

    await resolveEhrAccessToken(OAUTH, { fetchImpl: send, now: NOW })
    await resolveEhrAccessToken(OAUTH, { fetchImpl: send, now: NOW + 1000 })

    expect(send).toHaveBeenCalledTimes(1)
  })

  it("re-exchanges once the token is close to expiring", async () => {
    // Slightly before expiry, not at it: a token that dies in flight fails a
    // delivery that had nothing wrong with it.
    const send = token({ access_token: "t-1", expires_in: 60 })

    await resolveEhrAccessToken(OAUTH, { fetchImpl: send, now: NOW })
    await resolveEhrAccessToken(OAUTH, { fetchImpl: send, now: NOW + 40_000 })

    expect(send).toHaveBeenCalledTimes(2)
  })

  it("assumes a short life when the server does not say", async () => {
    const send = token({ access_token: "t-1" })

    await resolveEhrAccessToken(OAUTH, { fetchImpl: send, now: NOW })
    await resolveEhrAccessToken(OAUTH, { fetchImpl: send, now: NOW + 400_000 })

    expect(send).toHaveBeenCalledTimes(2)
  })

  it("keeps separate tokens for separate configurations", async () => {
    const send = token({ access_token: "t", expires_in: 600 })

    await resolveEhrAccessToken(OAUTH, { fetchImpl: send, now: NOW })
    await resolveEhrAccessToken({ ...OAUTH, clientId: "other" }, { fetchImpl: send, now: NOW })

    expect(send).toHaveBeenCalledTimes(2)
  })
})

describe("which token failures are worth repeating", () => {
  it("gives up on credentials the server rejected", async () => {
    // They will still be wrong in an hour, and repeated rejects against an
    // authorisation server get accounts locked.
    for (const status of [400, 401]) {
      clearEhrTokenCache()
      const result = await resolveEhrAccessToken(OAUTH, { fetchImpl: token({}, status), now: NOW })
      expect(result).toMatchObject({ permanent: true })
    }
  })

  it("retries an authorisation server that is having a bad day", async () => {
    const result = await resolveEhrAccessToken(OAUTH, { fetchImpl: token({}, 503), now: NOW })

    expect(result).toMatchObject({ permanent: false, errorCode: "TOKEN_HTTP_503" })
  })

  it("retries a response with no token in it", async () => {
    const result = await resolveEhrAccessToken(OAUTH, { fetchImpl: token({ nope: 1 }), now: NOW })

    expect(result).toMatchObject({ permanent: false, errorCode: "TOKEN_RESPONSE_INVALID" })
  })

  it("does not cache a failure", async () => {
    const failing = token({}, 503)
    await resolveEhrAccessToken(OAUTH, { fetchImpl: failing, now: NOW })

    const working = token({ access_token: "t-2", expires_in: 600 })
    const result = await resolveEhrAccessToken(OAUTH, { fetchImpl: working, now: NOW + 100 })

    expect(result).toEqual({ ok: true, token: "t-2" })
  })
})

/**
 * A rotated secret must not be able to serve a token bought with the old one.
 *
 * The key was the token URL, the client id and the scope -- so replacing the
 * secret changed nothing about which cache entry was consulted, and the old
 * token kept being sent until it expired. That matters most in the case
 * rotation exists for: a secret is replaced because it may have leaked, and
 * carrying on with a token minted from the leaked one is the opposite of what
 * the rotation was for.
 *
 * The comment above the key claimed this was handled. It was not.
 */
describe("a token belongs to the secret that bought it", () => {
  const base = {
    mode: "OAUTH2_CLIENT_CREDENTIALS" as const,
    tokenUrl: "https://auth.hospital.example/token",
    clientId: "lospor",
    scope: null,
  }

  function server(token: string) {
    return (async () => ({
      ok: true, status: 200,
      json: async () => ({ access_token: token, expires_in: 3600 }),
    })) as unknown as typeof fetch
  }

  beforeEach(() => clearEhrTokenCache())

  it("buys a new one when the secret changes", async () => {
    const first = await resolveEhrAccessToken(
      { ...base, clientSecret: "old" }, { fetchImpl: server("token-old") },
    )
    const second = await resolveEhrAccessToken(
      { ...base, clientSecret: "new" }, { fetchImpl: server("token-new") },
    )

    expect(first).toMatchObject({ ok: true, token: "token-old" })
    expect(second).toMatchObject({ ok: true, token: "token-new" })
  })

  // Still cached for the same credential, or every delivery buys a token.
  it("reuses one while the secret is unchanged", async () => {
    let exchanges = 0
    const counting = (async () => {
      exchanges += 1
      return {
        ok: true, status: 200,
        json: async () => ({ access_token: "token", expires_in: 3600 }),
      }
    }) as unknown as typeof fetch

    await resolveEhrAccessToken({ ...base, clientSecret: "same" }, { fetchImpl: counting })
    await resolveEhrAccessToken({ ...base, clientSecret: "same" }, { fetchImpl: counting })
    expect(exchanges).toBe(1)
  })

  /**
   * A token can stop working before it expires -- revoked at the hospital's
   * end, or invalidated by a change there. Without this the appliance replays
   * the same dead token for the rest of its lifetime, failing every delivery
   * in between for a reason one exchange would have fixed.
   */
  it("buys a new one after the server rejects the old", async () => {
    const config = { ...base, clientSecret: "same" }
    await resolveEhrAccessToken(config, { fetchImpl: server("stale") })

    forgetEhrAccessToken(config)

    const next = await resolveEhrAccessToken(config, { fetchImpl: server("fresh") })
    expect(next).toMatchObject({ ok: true, token: "fresh" })
  })

  // A refused exchange is reported as permanent, so the caller stops rather
  // than retrying credentials that will still be wrong in an hour.
  it("calls a refusal permanent", async () => {
    const refused = (async () => ({ ok: false, status: 401, json: async () => ({}) })) as unknown as typeof fetch
    const result = await resolveEhrAccessToken(
      { ...base, clientSecret: "wrong" }, { fetchImpl: refused },
    )
    expect(result).toMatchObject({ ok: false, permanent: true, errorCode: "TOKEN_HTTP_401" })
  })
})
