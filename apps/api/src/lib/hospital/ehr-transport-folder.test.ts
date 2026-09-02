import { mkdtemp, readFile, readdir, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))
vi.mock("@/lib/prisma", () => ({ prisma: {} }))

import {
  dropOutboundMessage,
  outboxFileName,
  OUTBOX,
  writeOutboxFile,
} from "./ehr-transport-folder"

/**
 * The folder transport is a file in a directory, so what is worth testing is
 * not the format but the writing. A hospital watcher polls a directory and will
 * happily pick up a file that is still being written; a truncated protocol
 * filed as a whole one is the failure this has to make impossible.
 */

let root = ""

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "lospor-ehr-folder-"))
})

afterAll(async () => {
  if (root) await rm(root, { recursive: true, force: true })
})

describe("a watcher never sees a partial file", () => {
  it("writes through a staging directory and renames into place", async () => {
    // A rename within one filesystem is atomic: the file either is not there
    // or is complete. Writing straight into the watched directory is the
    // obvious implementation and the one that truncates under load.
    const path = await writeOutboxFile("probe.json", '{"ok":true}\n', root)

    expect(path).toContain(OUTBOX)
    expect(await readFile(path, "utf8")).toBe('{"ok":true}\n')
  })

  it("leaves nothing behind in staging", async () => {
    await writeOutboxFile("second.json", "{}\n", root)

    const staged = await readdir(join(root, ".staging"))
    expect(staged).toEqual([])
  })

  it("creates the directories it needs rather than failing on a fresh install", async () => {
    const fresh = await mkdtemp(join(tmpdir(), "lospor-ehr-fresh-"))
    try {
      await expect(writeOutboxFile("x.json", "{}\n", fresh)).resolves.toContain(OUTBOX)
    } finally {
      await rm(fresh, { recursive: true, force: true })
    }
  })
})

describe("a filename carries no clinical meaning", () => {
  it("names the delivery, never the patient", async () => {
    // A directory listing is the least protected surface in an integration —
    // backups, monitoring, somebody's shoulder. The record number belongs
    // inside the file with the rest of the clinical content.
    const name = outboxFileName("d-1", "PROTOCOL", "json")

    expect(name).toBe("protocol-d-1.json")
    expect(name).not.toMatch(/\d{6,}/)
  })

  it("is stable across a retry, so a redelivery overwrites its own file", async () => {
    expect(outboxFileName("d-1", "PROTOCOL", "json"))
      .toBe(outboxFileName("d-1", "PROTOCOL", "json"))
  })
})

describe("dropping a message", () => {
  it("writes the header and the document as separate files", async () => {
    // A hospital that only files documents can ignore the header; one that only
    // parses structure never has to open the HTML. Both name the same delivery,
    // so a receiver that wants both can pair them.
    const written = await dropOutboundMessage({
      deliveryId: "d-42",
      kind: "PROTOCOL",
      header: { finalization: { sequence: 1 } },
      documentHtml: "<html>record</html>",
    }, root)

    expect(written).toHaveLength(2)
    expect(written.some(p => p.endsWith("protocol-d-42.json"))).toBe(true)
    expect(written.some(p => p.endsWith("protocol-d-42.html"))).toBe(true)
  })

  it("writes only the header when there is no document", async () => {
    // A safety finding is structured; there is no printable record for it.
    const written = await dropOutboundMessage({
      deliveryId: "d-43",
      kind: "SAFETY_FINDINGS",
      header: { kind: "airway", grade: "IV" },
    }, root)

    expect(written).toHaveLength(1)
    expect(written[0].endsWith(".json")).toBe(true)
  })

  it("writes the header as readable JSON, not a single line", async () => {
    // Somebody will open this in an editor while an integration is being set
    // up, and a one-line document is the difference between a working session
    // and a lost afternoon.
    await dropOutboundMessage({
      deliveryId: "d-44", kind: "PROTOCOL", header: { a: 1, b: { c: 2 } },
    }, root)

    const body = await readFile(join(root, OUTBOX, "protocol-d-44.json"), "utf8")
    expect(body.split("\n").length).toBeGreaterThan(3)
    expect(JSON.parse(body)).toEqual({ a: 1, b: { c: 2 } })
  })
})

describe("the atomic write is the mechanism, so the mechanism is tested", () => {
  it("writes to staging and renames into the outbox, never writing in place", async () => {
    // The previous tests all passed with a direct write into the watched
    // directory, which is exactly the bug this module exists to avoid — so the
    // call order is asserted rather than only the end state.
    vi.resetModules()
    const calls: string[] = []
    vi.doMock("node:fs/promises", () => ({
      mkdir: vi.fn(async () => undefined),
      writeFile: vi.fn(async (p: string) => { calls.push(`write:${p}`) }),
      rename: vi.fn(async (from: string, to: string) => { calls.push(`rename:${from}->${to}`) }),
    }))
    const mod = await import("./ehr-transport-folder")
    await mod.writeOutboxFile("atomic.json", "{}\n", "/root")

    expect(calls).toHaveLength(2)
    expect(calls[0]).toContain(".staging")
    expect(calls[0]).not.toContain(`${mod.OUTBOX}`)
    expect(calls[1]).toMatch(/^rename:.*\.staging.*->.*outbox/)
    vi.doUnmock("node:fs/promises")
    vi.resetModules()
  })
})
