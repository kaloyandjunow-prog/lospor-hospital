import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Animated, Easing, PanResponder } from "react-native"
import { sideSwipeExitMs, sideSwipeFade, sideSwipeFollow, sideSwipeGate, sideSwipeStep } from "./side-swipe"

/**
 * One section at a time, changed by a sideways swipe or a tap on the strip,
 * with the motion the preop sections and intraop tabs use (10.0.0): the card
 * follows the finger once the swipe is claimed, leaves at the finger's speed,
 * and the next one glides in from the side it lies on.
 *
 * `enabled` false (the scrolling layout) shows every section and claims no
 * gesture; `go` then only records which one was chosen.
 */
export function useSectionPager<K extends string>(keys: readonly K[], enabled: boolean, screenWidth: number) {
  const [active, setActive] = useState<K>(keys[0])
  const activeRef = useRef(active)
  const keysRef = useRef(keys)
  useEffect(() => { activeRef.current = active }, [active])
  useEffect(() => { keysRef.current = keys }, [keys])
  const slide = useRef(new Animated.Value(0)).current
  const fade = useRef(new Animated.Value(1)).current
  const enterFrom = useRef<1 | -1>(1)

  // A section switched off while it was showing gives way to the first.
  useEffect(() => {
    if (!keys.includes(active)) setActive(keys[0])
  }, [active, keys])

  const springBack = useCallback(() => {
    Animated.parallel([
      Animated.spring(slide, { toValue: 0, useNativeDriver: true, tension: 180, friction: 24 }),
      Animated.timing(fade, { toValue: 1, duration: 180, useNativeDriver: true }),
    ]).start()
  }, [fade, slide])

  // Whatever changed the section, the new one glides in.
  const previous = useRef(active)
  useEffect(() => {
    if (previous.current === active) return
    previous.current = active
    if (!enabled) return
    slide.setValue(enterFrom.current * screenWidth * 0.12)
    fade.setValue(0)
    Animated.parallel([
      Animated.timing(slide, { toValue: 0, duration: 240, useNativeDriver: true, easing: Easing.out(Easing.cubic) }),
      Animated.timing(fade, { toValue: 1, duration: 200, useNativeDriver: true, easing: Easing.out(Easing.quad) }),
    ]).start()
  }, [active, enabled, fade, screenWidth, slide])

  const go = useCallback((key: K) => {
    const current = keysRef.current.indexOf(activeRef.current)
    const target = keysRef.current.indexOf(key)
    if (target < 0 || target === current) return
    enterFrom.current = target > current ? 1 : -1
    if (!enabled) { setActive(key); return }
    Animated.parallel([
      Animated.timing(slide, { toValue: -enterFrom.current * screenWidth * 0.25, duration: 160, useNativeDriver: true, easing: Easing.out(Easing.quad) }),
      Animated.timing(fade, { toValue: 0, duration: 160, useNativeDriver: true, easing: Easing.in(Easing.quad) }),
    ]).start(() => setActive(key))
  }, [enabled, fade, screenWidth, slide])

  const panHandlers = useMemo(() => {
    if (!enabled) return {}
    const gate = sideSwipeGate()
    const neighbour = (step: 1 | -1) => keysRef.current[keysRef.current.indexOf(activeRef.current) + step]
    return PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onStartShouldSetPanResponderCapture: () => gate.start(),
      onMoveShouldSetPanResponder: (_, { dx, dy }) => gate.claims(dx, dy),
      onPanResponderGrant: () => { slide.stopAnimation(); fade.stopAnimation() },
      onPanResponderMove: (_, { dx }) => {
        if (!neighbour(dx < 0 ? 1 : -1)) return
        slide.setValue(sideSwipeFollow(dx))
        fade.setValue(sideSwipeFade(dx, screenWidth))
      },
      onPanResponderRelease: (_, { dx, dy, vx }) => {
        const step = sideSwipeStep(dx, dy, vx, screenWidth)
        const target = step === null ? undefined : neighbour(step)
        if (step === null || target === undefined) { springBack(); return }
        const toward = step === 1 ? -1 : 1
        const exitMs = sideSwipeExitMs(toward * screenWidth - sideSwipeFollow(dx), vx)
        enterFrom.current = step
        Animated.parallel([
          Animated.timing(slide, { toValue: toward * screenWidth, duration: exitMs, useNativeDriver: true, easing: Easing.out(Easing.quad) }),
          Animated.timing(fade, { toValue: 0, duration: exitMs, useNativeDriver: true, easing: Easing.in(Easing.quad) }),
        ]).start(() => setActive(target))
      },
      onPanResponderTerminate: springBack,
    }).panHandlers
  }, [enabled, fade, screenWidth, slide, springBack])

  const style = enabled ? { opacity: fade, transform: [{ translateX: slide }] } : undefined
  const shown = useCallback((key: K) => keys.includes(key) && (!enabled || active === key), [active, enabled, keys])

  return { active, go, panHandlers, style, shown }
}
