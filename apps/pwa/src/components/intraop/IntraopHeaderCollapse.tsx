import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { Animated, type NativeScrollEvent, type NativeSyntheticEvent } from "react-native"

type HeaderCollapseContextValue = {
  progress: Animated.Value
  collapsed: boolean
  onScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => void
  scrollEventThrottle: number
}

const HeaderCollapseContext = createContext<HeaderCollapseContextValue | null>(null)

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

/**
 * Keeps the intraoperative chrome in sync with whichever tab is scrolling.
 * Progress is derived from absolute scroll position, so a fast swipe cannot
 * make the header overshoot or expose a transparent frame between states.
 */
export function IntraopHeaderCollapseProvider({ activeKey, children }: { activeKey: string; children: ReactNode }) {
  const progress = useRef(new Animated.Value(0)).current
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    progress.stopAnimation()
    progress.setValue(0)
    setCollapsed(false)
  }, [activeKey, progress])

  const onScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const y = Math.max(0, event.nativeEvent.contentOffset.y)
    // A short dead-zone prevents the header moving when a clinician only
    // nudges the list; the long interpolation keeps the transition calm.
    const next = clamp((y - 18) / 152, 0, 1)
    progress.setValue(next)
    setCollapsed(previous => next >= 0.98 ? true : next <= 0.02 ? false : previous)
  }, [progress])

  const value = useMemo(() => ({ progress, collapsed, onScroll, scrollEventThrottle: 16 }), [collapsed, onScroll, progress])
  return <HeaderCollapseContext.Provider value={value}>{children}</HeaderCollapseContext.Provider>
}

export function useIntraopHeaderScroll(): Pick<HeaderCollapseContextValue, "onScroll" | "scrollEventThrottle"> {
  const context = useContext(HeaderCollapseContext)
  if (!context) return { onScroll: () => undefined, scrollEventThrottle: 16 }
  return context
}

export function useIntraopHeaderCollapse() {
  const context = useContext(HeaderCollapseContext)
  if (!context) throw new Error("useIntraopHeaderCollapse must be used inside IntraopHeaderCollapseProvider")
  return context
}
