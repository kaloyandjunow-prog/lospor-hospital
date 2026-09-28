import React from "react"
import { act } from "react-test-renderer"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// A phone whose clock is wrong by `skewMs`: the server's time is the device's
// minus the skew, which is what the server clock corrects for.
const clock = vi.hoisted(() => ({ skewMs: 0 }))
vi.mock("@/lib/server-clock", () => ({ serverNow: () => new Date(Date.now() - clock.skewMs) }))

import { render } from "@/test/render"
import { useResumeCountdown } from "./use-resume-countdown"

const ENDED = new Date("2026-09-28T10:00:00Z")

function Harness({ initial, onSeconds }: { initial: number; onSeconds: (seconds: number) => void }) {
  const endedAtRef = React.useRef<Date | null>(ENDED)
  const [seconds, setSeconds] = React.useState(initial)
  onSeconds(seconds)
  useResumeCountdown(endedAtRef, seconds, setSeconds)
  return null
}

describe("the resume countdown of an ended case", () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers(); clock.skewMs = 0 })

  it("counts on the server's clock on a phone set ten minutes fast", () => {
    clock.skewMs = 10 * 60_000
    // Five minutes after the end by the server; the phone reads fifteen.
    vi.setSystemTime(new Date(ENDED.getTime() + 15 * 60_000))
    let seconds = 0
    render(<Harness initial={25 * 60} onSeconds={value => { seconds = value }} />)
    act(() => { vi.advanceTimersByTime(1000) })
    expect(seconds).toBe(25 * 60 - 1)
  })

  it("closes at 30 minutes by the server on a phone set an hour slow", () => {
    clock.skewMs = -60 * 60_000
    // 29:58 after the end by the server; the phone is an hour behind the end.
    vi.setSystemTime(new Date(ENDED.getTime() + (29 * 60 + 58) * 1000 - 60 * 60_000))
    let seconds = 0
    render(<Harness initial={2} onSeconds={value => { seconds = value }} />)
    act(() => { vi.advanceTimersByTime(3000) })
    expect(seconds).toBe(0)
  })
})
