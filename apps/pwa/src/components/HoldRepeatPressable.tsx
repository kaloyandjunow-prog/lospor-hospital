import { useEffect, useRef, type ReactNode } from "react"
import { createGestureHandle } from "@/lib/gesture-lock"
import { HELD_CONTROL_STYLE } from "@/lib/gesture-style"
import { Platform, Pressable, type StyleProp, type ViewStyle } from "react-native"

/**
 * A +/- button that keeps stepping while held. A tap steps once when the
 * finger lifts; a hold steps at 420 ms, then every 120 ms, and every 50 ms after
 * another 1.5 s (as the web stepper does). Nothing steps on touch-down, so a
 * scroll that starts on the button changes nothing.
 *
 * `onStep` is read afresh on every tick. The steppers used to start an
 * interval with the step function of the render the finger went down on, so
 * every tick added one step to the same old value: holding + set the number
 * once and then kept setting it again.
 *
 * In the PWA a long press is also the browser's own gesture: it selects the
 * "+" under the finger, shows the copy/callout menu, and the contextmenu it
 * fires can end the press. On web the button turns all of that off.
 */
export function HoldRepeatPressable({ onStep, disabled, style, children, testID }: {
  onStep: () => void
  disabled?: boolean
  style?: StyleProp<ViewStyle>
  children: ReactNode
  testID?: string
}) {
  const stepRef = useRef(onStep)
  useEffect(() => { stepRef.current = onStep })
  const timers = useRef<{ faster?: ReturnType<typeof setTimeout>; repeat?: ReturnType<typeof setInterval> }>({})
  const nodeRef = useRef<unknown>(null)

  const hold = useRef(createGestureHandle()).current
  function stop() {
    clearTimeout(timers.current.faster)
    clearInterval(timers.current.repeat)
    timers.current = {}
  }
  useEffect(() => () => { stop(); hold.end() }, [hold])

  function repeat() {
    stop()
    const step = () => stepRef.current()
    step()
    timers.current.repeat = setInterval(step, 120)
    timers.current.faster = setTimeout(() => {
      clearInterval(timers.current.repeat)
      timers.current.repeat = setInterval(step, 50)
    }, 1500)
  }

  // Web only: on react-native-web the ref is the DOM element.
  useEffect(() => {
    if (Platform.OS !== "web") return
    const node = nodeRef.current as HTMLElement | null
    if (!node?.addEventListener) return
    const block = (event: Event) => event.preventDefault()
    node.addEventListener("contextmenu", block)
    node.addEventListener("selectstart", block)
    node.style.setProperty("user-select", "none")
    node.style.setProperty("-webkit-user-select", "none")
    node.style.setProperty("-webkit-touch-callout", "none")
    node.style.setProperty("-webkit-tap-highlight-color", "transparent")
    return () => {
      node.removeEventListener("contextmenu", block)
      node.removeEventListener("selectstart", block)
    }
  }, [])

  return (
    <Pressable
      ref={nodeRef as never}
      testID={testID}
      disabled={disabled}
      // After a long press Pressable does not call onPress, so a hold is not also a tap.
      onPress={() => stepRef.current()}
      // From the first touch the finger belongs to this button: a drift sideways is not a tab swipe.
      onPressIn={hold.start}
      onTouchEnd={hold.end}
      onTouchCancel={hold.end}
      onLongPress={repeat}
      delayLongPress={420}
      onPressOut={stop}
      style={[style, HELD_CONTROL_STYLE]}
    >
      {children}
    </Pressable>
  )
}
