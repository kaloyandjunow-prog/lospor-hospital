import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))
const { authorize, check } = vi.hoisted(() => ({
  authorize: vi.fn(async () => null as Response | null),
  check: vi.fn(async (_content: string, input: { file?: string }) => ({ file: input.file ?? "checked.json", outcome: "would-import" })),
}))
vi.mock("@/lib/hospital/control-plane-http", async importOriginal => ({
  ...await importOriginal<typeof import("@/lib/hospital/control-plane-http")>(),
  authorizeAccountControl: authorize,
}))
vi.mock("@/lib/hospital/ehr-inbox-folder", () => ({ checkInboxDocument: check }))

import { POST } from "./route"

const post = (body: unknown) => {
  const text = JSON.stringify(body)
  return POST(new Request("http://api/x", {
    method: "POST",
    headers: { "content-type": "application/json", "content-length": String(Buffer.byteLength(text)) },
    body: text,
  }))
}

// Status's "check a file" (1.5.0): the inbox's own reader, nothing stored.
describe("checking a sample file from Status", () => {
  beforeEach(() => { authorize.mockResolvedValue(null); check.mockClear() })

  it("runs the inbox reader on the content and returns its answer", async () => {
    const response = await post({ file: "sample.json", content: '{"identifier":"42"}' })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ report: { file: "sample.json", outcome: "would-import" } })
    expect(check).toHaveBeenCalledWith('{"identifier":"42"}', { file: "sample.json" })
  })

  it("answers only an authorised Status", async () => {
    authorize.mockResolvedValue(new Response(null, { status: 401 }))
    expect((await post({ content: "{}" })).status).toBe(401)
    expect(check).not.toHaveBeenCalled()
  })

  it("takes a sample of up to a megabyte, and refuses more or nothing", async () => {
    expect((await post({ content: "x".repeat(1024 * 1024) })).status).toBe(200)
    expect((await post({ content: "x".repeat(1024 * 1024 + 8192) })).status).toBe(400)
    expect((await post({ content: "" })).status).toBe(400)
    expect((await post({ content: "{}", extra: 1 })).status).toBe(400)
  })
})
