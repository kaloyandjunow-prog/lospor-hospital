"use client"

import { useEffect, useRef, useState } from "react"
import { pendingCloseState } from "@lospor/core/case-close-window"

/**
 * Ticks once a second while a case sits in AWAITING_REVIEW, reading the
 * server's `awaitingReviewAt` rather than a per-browser clock -- the wizard
 * used to anchor this to a `localStorage` timestamp set when *this browser*
 * opened the summary step, so the same case showed a different time left on
 * a different device. Calls `onExpire` exactly once when the window closes.
 */
export function usePendingCloseCountdown(
  awaitingReviewAt: string | null | undefined,
  finalizedAt: string | null | undefined,
  onExpire: () => void,
): number | null {
  const [secsLeft, setSecsLeft] = useState<number | null>(null)
  const onExpireRef = useRef(onExpire)
  useEffect(() => { onExpireRef.current = onExpire })

  useEffect(() => {
    // Syncing local render state from a value computed off an external clock
    // (the server timestamp vs. wall time), not from other React state --
    // there is nothing to read this from except by computing it here.
    const tick = () => {
      if (!awaitingReviewAt || finalizedAt) {
        setSecsLeft(null)
        return false
      }
      const state = pendingCloseState({ awaitingReviewAt, finalizedAt }, new Date())
      if (state.kind === "counting-down") {
        setSecsLeft(Math.ceil(state.remainingMs / 1000))
        return true
      }
      if (state.kind === "expired") {
        setSecsLeft(0)
        onExpireRef.current()
        return false
      }
      setSecsLeft(null)
      return false
    }
    if (!tick()) return
    const id = setInterval(() => { if (!tick()) clearInterval(id) }, 1000)
    return () => clearInterval(id)
  }, [awaitingReviewAt, finalizedAt])

  return secsLeft
}
