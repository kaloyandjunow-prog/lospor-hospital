import React, { useRef } from "react"
import {
  Animated,
  Pressable,
  type GestureResponderEvent,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from "react-native"
import { hapticTick } from "@/lib/haptic"

type Props = Omit<PressableProps, "style"> & {
  children: React.ReactNode
  style?: StyleProp<ViewStyle>
  disabled?: boolean
  haptic?: boolean
  pressedScale?: number
  pressedOpacity?: number
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable)

export function FeedbackPressable({
  children,
  style,
  disabled,
  haptic = true,
  pressedScale = 0.97,
  pressedOpacity = 0.82,
  onPressIn,
  onPressOut,
  accessibilityRole = "button",
  ...props
}: Props) {
  const scale = useRef(new Animated.Value(1)).current
  const opacity = useRef(new Animated.Value(1)).current

  function animate(toScale: number, toOpacity: number) {
    Animated.parallel([
      Animated.spring(scale, {
        toValue: toScale,
        useNativeDriver: true,
        speed: 32,
        bounciness: 4,
      }),
      Animated.timing(opacity, {
        toValue: toOpacity,
        duration: 90,
        useNativeDriver: true,
      }),
    ]).start()
  }

  function handlePressIn(event: GestureResponderEvent) {
    if (disabled) return
    if (haptic) hapticTick()
    animate(pressedScale, pressedOpacity)
    onPressIn?.(event)
  }

  function handlePressOut(event: GestureResponderEvent) {
    if (!disabled) animate(1, 1)
    onPressOut?.(event)
  }

  return (
    <AnimatedPressable
      {...props}
      accessibilityRole={accessibilityRole}
      disabled={disabled}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={[style, { opacity, transform: [{ scale }] }]}
    >
      {children}
    </AnimatedPressable>
  )
}
