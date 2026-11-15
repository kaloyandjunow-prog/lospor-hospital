import { describe, expect, it, vi } from "vitest"
import { caseCodeStamp, generateCaseCode, parseCaseCode, renumberCaseCode, reserveCaseCode } from "./case-code"

/**
 * A `Db` standing in for the counter table.
 *
 * `stored` is the row's `next` value, or null when the clinician has no counter
 * for that year yet.
 */
function db(stored: number | null) {
  const state = { next: stored }
  const upsert = vi.fn().mockImplementation(({ create, update }) => {
    if (state.next === null) state.next = create.next
    else state.next += update.next.increment
    return Promise.resolve({ next: state.next })
  })
  const findUnique = vi.fn().mockImplementation(() =>
    Promise.resolve(state.next === null ? null : { next: state.next }))
  const create = vi.fn().mockImplementation(({ data }) => {
    state.next = data.next
    return Promise.resolve(data)
  })
  const update = vi.fn().mockImplementation(({ data }) => {
    state.next = data.next
    return Promise.resolve(data)
  })
  return {
    client: { caseCodeSequence: { upsert, findUnique, create, update } } as never,
    state, upsert, findUnique, create, update,
  }
}

// 15 Nov 2026, 14:32:07 in Sofia (UTC+2 in winter).
const AT = new Date("2026-11-15T12:32:07Z")

describe("case codes", () => {
  it("carries the department's date and time, then the clinician's number", async () => {
    const { client } = db(null)
    expect(await generateCaseCode("user-1", client, AT)).toBe("20261115-143207-0001")
  })

  it("issues consecutive numbers, so cases created in the same second differ", async () => {
    const { client } = db(null)
    const issued = []
    for (let n = 0; n < 3; n++) issued.push(await generateCaseCode("user-1", client, AT))
    expect(issued).toEqual(["20261115-143207-0001", "20261115-143207-0002", "20261115-143207-0003"])
  })

  it("continues from the stored counter", async () => {
    const { client } = db(42)
    expect(await generateCaseCode("user-1", client, AT)).toBe("20261115-143207-0042")
  })

  // Sofia's New Year comes two hours before UTC's: the counter must follow the
  // department's calendar, the same one the code prints.
  it("counts in the department's year and day, not the server's", async () => {
    const { client, upsert } = db(null)
    expect(await generateCaseCode("user-1", client, new Date("2026-12-31T22:30:00Z"))).toBe("20270101-003000-0001")
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId_year: { userId: "user-1", year: 2027 } } }),
    )
  })

  it("keeps summer time", () => {
    expect(caseCodeStamp(new Date("2026-07-01T05:04:03Z"))).toBe("20260701-080403")
  })
})

describe("parsing a code", () => {
  it("reads both the stamped and the older format", () => {
    expect(parseCaseCode("20261115-143207-0042")).toEqual({ year: 2026, issued: 42, stamp: "20261115-143207" })
    expect(parseCaseCode("2026-0042")).toEqual({ year: 2026, issued: 42, stamp: null })
    expect(parseCaseCode("not-a-code")).toBeNull()
  })
})

describe("renumbering on handover", () => {
  it("keeps the date and time and changes only the number", async () => {
    const { client } = db(9)
    expect(await renumberCaseCode("peer-1", client, "20261115-143207-0042")).toBe("20261115-143207-0009")
  })

  // Handovers routinely cross the New Year; a 2026 operation stays in 2026.
  it("stays in the year the code carries", async () => {
    const { client, upsert } = db(null)
    expect(await renumberCaseCode("peer-1", client, "20261231-235959-0042")).toBe("20261231-235959-0001")
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId_year: { userId: "peer-1", year: 2026 } } }),
    )
  })

  it("keeps an older code in its own format", async () => {
    const { client } = db(5)
    expect(await renumberCaseCode("peer-1", client, "2019-0042")).toBe("2019-0005")
  })
})

describe("reserving a code that arrived by handover", () => {
  // The bug this exists for. A handed-over case usually keeps its number, so it
  // lands in the recipient's sequence without their counter knowing. Left alone
  // the counter walks up to it and issues it a second time, and two operations
  // then carry the same number.
  it("pushes the counter past an incoming number", async () => {
    const { client, state } = db(2)
    await reserveCaseCode("user-1", client, "2026-0007")
    expect(state.next).toBe(8)
    expect(await generateCaseCode("user-1", client, AT)).toBe("20261115-143207-0008")
  })

  it("creates a counter when the recipient has none for that year", async () => {
    const { client, state, create } = db(null)
    await reserveCaseCode("user-1", client, "2026-0004")
    expect(create).toHaveBeenCalled()
    expect(state.next).toBe(5)
  })

  // A clinician who receives an old, low-numbered case must not have their
  // counter dragged back over numbers they have already been issued.
  it("never moves the counter backwards", async () => {
    const { client, state, update } = db(50)
    await reserveCaseCode("user-1", client, "2026-0004")
    expect(update).not.toHaveBeenCalled()
    expect(state.next).toBe(50)
  })

  it("reads the year and number of a stamped code", async () => {
    const { client, state } = db(2)
    await reserveCaseCode("user-1", client, "20261115-143207-0007")
    expect(state.next).toBe(8)
  })

  it("ignores a code it cannot parse", async () => {
    const { client, findUnique } = db(5)
    await reserveCaseCode("user-1", client, "not-a-code")
    expect(findUnique).not.toHaveBeenCalled()
  })
})
