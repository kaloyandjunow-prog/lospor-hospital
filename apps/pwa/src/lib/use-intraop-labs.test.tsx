import React from "react"
import { act } from "react-test-renderer"
import { describe, expect, it, vi } from "vitest"

vi.mock("@/lib/notify", () => ({ notify: vi.fn() }))

import { render } from "@/test/render"
import { useIntraopLabs } from "./use-intraop-labs"

// saveLabs used to count a queued, refused or failed write as saved; the
// hospital import then recorded results as accepted that the case never got.

const lab = { test: "Haemoglobin (Hb)", value: "118", unit: "g/L", takenAt: "2026-09-27T10:30:00.000Z" }

function setup(outcomes: Array<{ result: string } | undefined | Error>) {
  const patch = vi.fn(async () => {
    const next = outcomes.shift()
    if (next instanceof Error) throw next
    return next
  })
  let save!: ReturnType<typeof useIntraopLabs>["saveLabs"]
  function Harness() {
    save = useIntraopLabs(patch, "error").saveLabs
    return null
  }
  render(<Harness />)
  const run = async (list: unknown[]) => {
    let kept!: boolean
    await act(async () => { kept = await save(list as never) })
    return kept
  }
  return { patch, run }
}

describe("whether the intraoperative labs reached the case", () => {
  it("says kept when saved or queued, and not when refused, dropped or thrown", async () => {
    for (const [outcome, kept] of [
      [{ result: "saved" }, true],
      [{ result: "queued" }, true],
      [{ result: "blocked" }, false],
      [{ result: "failed" }, false],
      [{ result: "conflict" }, false],
      [undefined, false],
      [new Error("offline store full"), false],
    ] as const) {
      const { run } = setup([outcome as never])
      expect(await run([lab]), JSON.stringify(outcome ?? "undefined")).toBe(kept)
    }
  })

  it("sends a refused list again rather than taking it as already saved", async () => {
    const { patch, run } = setup([{ result: "blocked" }, { result: "saved" }])
    expect(await run([lab])).toBe(false)
    expect(await run([lab])).toBe(true)
    expect(patch).toHaveBeenCalledTimes(2)
  })

  it("does not send an unchanged list twice once it is saved", async () => {
    const { patch, run } = setup([{ result: "saved" }])
    expect(await run([lab])).toBe(true)
    expect(await run([lab])).toBe(true)
    expect(patch).toHaveBeenCalledTimes(1)
  })
})
