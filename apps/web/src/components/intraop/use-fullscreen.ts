"use client"

import { useCallback, useEffect, useState } from "react"

/**
 * The chart over the whole screen (10.8.0). The browser's own full screen on
 * the chart's root: everything inside keeps working, the layout measures the
 * new width and the columns scale to it. Esc or the button leaves it.
 */
export function useFullscreen(target: () => HTMLElement | null): [boolean, () => void] {
  const [fullscreen, setFullscreen] = useState(false)
  useEffect(() => {
    const sync = () => setFullscreen(!!document.fullscreenElement && document.fullscreenElement === target())
    document.addEventListener("fullscreenchange", sync)
    return () => document.removeEventListener("fullscreenchange", sync)
  }, [target])
  const toggle = useCallback(() => {
    const element = target()
    if (!element) return
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {})
    else void element.requestFullscreen?.().catch(() => {})
  }, [target])
  return [fullscreen, toggle]
}

/** The web chart's root, which goes full screen. */
export const chartRootElement = (): HTMLElement | null => document.querySelector<HTMLElement>("[data-intraop-chart-root]")
