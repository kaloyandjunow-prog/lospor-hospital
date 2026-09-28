import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))
const { authorize, setMapping } = vi.hoisted(() => ({
  authorize: vi.fn(async () => null as Response | null),
  setMapping: vi.fn(async (input: unknown) => input),
}))
vi.mock("@/lib/hospital/control-plane-http", async importOriginal => ({
  ...await importOriginal<typeof import("@/lib/hospital/control-plane-http")>(),
  authorizeAccountControl: authorize,
}))
vi.mock("@/lib/hospital/control-plane", async importOriginal => ({
  ...await importOriginal<typeof import("@/lib/hospital/control-plane")>(),
  setEhrMedicationCodeMapping: setMapping,
}))

import { GET, POST } from "./route"

// Status searches the medication list here and maps a code to a list product
// (1.4.16); it used to page through the first 500 Drug rows.

const search = async (q: string) => (await GET(new Request(`http://api/x?q=${encodeURIComponent(q)}`))).json()
const map = (body: Record<string, unknown>) => POST(new Request("http://api/x", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
}))

describe("the Status medication search and map", () => {
  beforeEach(() => { authorize.mockResolvedValue(null); setMapping.mockClear() })

  it("searches the medication list, and asks nothing of one letter", async () => {
    const found = await search("amlocor")
    expect(found.query).toBe("amlocor")
    expect(found.results.map((row: { catalogId: string }) => row.catalogId)).toEqual(expect.arrayContaining(["cl009:84", "cl009:85"]))
    expect((await search("a")).results).toEqual([])
  })

  it("answers only an authorised Status", async () => {
    authorize.mockResolvedValue(new Response(null, { status: 401 }))
    expect((await GET(new Request("http://api/x?q=amlocor"))).status).toBe(401)
    expect((await map({ system: "", code: "1", catalogId: "cl009:85" })).status).toBe(401)
    expect(setMapping).not.toHaveBeenCalled()
  })

  it("maps to a list product, or to a Drug row from an older Status, but not both or neither", async () => {
    expect((await map({ system: "s", code: "1", catalogId: "cl009:85" })).status).toBe(200)
    expect(setMapping).toHaveBeenLastCalledWith({ system: "s", code: "1", catalogId: "cl009:85" })
    expect((await map({ system: "s", code: "1", drugId: "drug-amlocor" })).status).toBe(200)
    expect(setMapping).toHaveBeenCalledTimes(2)
    for (const body of [
      { system: "s", code: "1" },
      { system: "s", code: "1", drugId: "drug-amlocor", catalogId: "cl009:85" },
      { system: "s", code: "1", catalogId: "atc:C08CA01" },
      { system: "s", code: "1", catalogId: "cl009:8 5" },
    ]) expect((await map(body)).status).toBe(400)
    expect(setMapping).toHaveBeenCalledTimes(2)
  })
})
