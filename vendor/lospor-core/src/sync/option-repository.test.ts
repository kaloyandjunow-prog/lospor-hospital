import { describe, expect, it, vi } from "vitest"
import type { CanonicalLibraryOption } from "../option-contracts"
import { OptionLibraryRepository } from "./option-repository"

const option = (value: string): CanonicalLibraryOption => ({
  id: `id:${value}`,
  category: "POSITION",
  value,
  label: value,
  metadata: null,
  parentId: null,
  labelBg: null,
  group: null,
  color: null,
  description: null,
  drugId: null,
  atcCode: null,
  inn: null,
})

function adapters(fetchCategory: () => Promise<unknown>) {
  const cache = new Map<string, string>()
  const scheduled: Array<() => void> = []
  return {
    cache,
    scheduled,
    value: {
      storage: {
        get: async (key: string) => cache.get(key) ?? null,
        set: async (key: string, value: string) => { cache.set(key, value) },
      },
      fetchCategory,
      bundled: () => [option("SUPINE")],
      scheduler: {
        schedule: (callback: () => void) => {
          scheduled.push(callback)
          return callback
        },
        cancel: vi.fn(),
      },
    },
  }
}

describe("OptionLibraryRepository", () => {
  it("single-flights concurrent loads and caches a live response", async () => {
    let release!: (value: unknown) => void
    const fetchCategory = vi.fn(() => new Promise<unknown>(resolve => { release = resolve }))
    const fixture = adapters(fetchCategory)
    const repository = new OptionLibraryRepository(fixture.value)

    const first = repository.load("POSITION")
    const second = repository.load("POSITION")
    release([option("PRONE")])

    await expect(first).resolves.toMatchObject({ source: "live" })
    await expect(second).resolves.toMatchObject({ source: "live" })
    expect(fetchCategory).toHaveBeenCalledTimes(1)
    expect(fixture.cache.size).toBe(1)
  })

  it("uses cache before bundled fallback and schedules one retry", async () => {
    const fixture = adapters(async () => [])
    fixture.cache.set("lospor_option_library_v4_POSITION", JSON.stringify([option("LATERAL")]))
    const repository = new OptionLibraryRepository(fixture.value)

    await expect(repository.load("POSITION")).resolves.toMatchObject({
      data: [{ id: "id:LATERAL", category: "POSITION", value: "LATERAL" }],
      source: "cached",
    })
    await repository.load("POSITION")
    expect(fixture.scheduled).toHaveLength(1)
  })

  it("uses the bundled catalog when live and cache are empty", async () => {
    const fixture = adapters(async () => { throw new Error("offline") })
    const repository = new OptionLibraryRepository(fixture.value)
    await expect(repository.load("POSITION")).resolves.toMatchObject({
      data: [{ id: "id:SUPINE", category: "POSITION", value: "SUPINE" }],
      source: "bundled",
    })
  })
})
