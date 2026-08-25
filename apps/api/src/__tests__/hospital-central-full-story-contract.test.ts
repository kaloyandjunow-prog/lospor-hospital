import { readFile } from "node:fs/promises"
import { describe, expect, it } from "vitest"
import { startSyntheticCentral } from "./fixtures/synthetic-central"

const supportUrl = new URL("../../../../scripts/exchange-contract-support.json", import.meta.url)
const fixtureUrl = new URL("./fixtures/synthetic-central.ts", import.meta.url)

describe("synthetic Central release fixture contract", () => {
  it("declares one current and at least one previous supported exchange version", async () => {
    const support = JSON.parse(await readFile(supportUrl, "utf8")) as {
      schemaVersion: number
      current: string
      supported: string[]
    }
    expect(support.schemaVersion).toBe(1)
    expect(support.supported.length).toBeGreaterThanOrEqual(2)
    expect(support.supported.at(-1)).toBe(support.current)
    expect(new Set(support.supported).size).toBe(support.supported.length)
  })

  it("is independent test code with no sibling Central import or production fallback", async () => {
    const source = await readFile(fixtureUrl, "utf8")
    expect(source).not.toMatch(/from\s+["'][^"']*lospor-central/i)
    expect(source).not.toContain("../../../../lospor-central")
    expect(source).toContain('from "@lospor/exchange-contract"')
  })

  it("rejects a malformed manifest before accepting upload parts", async () => {
    const central = await startSyntheticCentral({
      contractVersion: "2.2.0",
      siteId: "synthetic-contract-site",
      siteSigningPublicKeyPem: "not-used-before-manifest-validation",
      expectedSequence: 1,
    })
    try {
      const response = await fetch(`${central.baseUrl}/v1/exchange/batches`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-lospor-site-id": "synthetic-contract-site",
        },
        body: JSON.stringify({ manifest: { schema: "wrong" }, envelope: {}, totalParts: 1 }),
      })
      expect(response.status).toBe(400)
      await expect(response.json()).resolves.toMatchObject({ code: "MANIFEST_INVALID" })
      expect(central.observations).toEqual([
        expect.objectContaining({ method: "POST", status: 400, batchId: null }),
      ])
    } finally {
      await central.close()
    }
  })
})
