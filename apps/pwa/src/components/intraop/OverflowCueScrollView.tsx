import { useCallback, useEffect, useRef, useState, type ReactNode, type RefObject } from "react"
import { Platform, Pressable, ScrollView, View, type NativeScrollEvent, type NativeSyntheticEvent, type ScrollViewProps, type StyleProp, type ViewStyle, type ScrollViewInstance } from "react-native"
import Svg, { Defs, LinearGradient, Path, Rect, Stop } from "react-native-svg"
import { colors, withAlpha } from "@/theme/colors"

type Props = Omit<ScrollViewProps, "children" | "horizontal" | "onScroll" | "onContentSizeChange"> & {
  children: ReactNode
  /** Horizontal rails use left/right cues; vertical sheets use up/down cues. */
  horizontal?: boolean
  scrollRef?: RefObject<ScrollViewInstance | null>
  edgeColor?: string
  cueColor?: string
  startLabel?: string
  endLabel?: string
  testID?: string
  onScroll?: (event: NativeSyntheticEvent<NativeScrollEvent>) => void
  onContentSizeChange?: (width: number, height: number) => void
  contentContainerStyle?: StyleProp<ViewStyle>
  /** Style applied to the actual scroll surface, not the cue wrapper. */
  scrollViewStyle?: StyleProp<ViewStyle>
}

let cueId = 0

function CueChevron({ direction, color }: { direction: "back" | "forward" | "up" | "down"; color: string }) {
  const path = direction === "back" ? "M12.5 4.5 7 10l5.5 5.5"
    : direction === "forward" ? "M7.5 4.5 13 10l-5.5 5.5"
    : direction === "up" ? "M4.5 12.5 10 7l5.5 5.5"
    : "M4.5 7.5 10 13l5.5-5.5"
  return (
    <Svg width={20} height={20} viewBox="0 0 20 20" pointerEvents="none">
      <Path d={path} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  )
}

/**
 * One overflow treatment for clinical rails and sheets.
 *
 * The fade is deliberately an edge overlay rather than a permanent scrollbar:
 * it only appears when content is hidden, remains visible behind a thumb, and
 * gives keyboard, touch and screen-reader users an explicit next/previous
 * action. The same component can be used for a horizontal quick-choice row or
 * a vertical picker without changing the visual language.
 */
export function OverflowCueScrollView({
  children,
  horizontal = false,
  scrollRef,
  edgeColor = colors.surface,
  cueColor = colors.textSecondary,
  startLabel = horizontal ? "Scroll left" : "Scroll up",
  endLabel = horizontal ? "Scroll right" : "Scroll down",
  testID,
  onScroll,
  onContentSizeChange,
  contentContainerStyle,
  scrollViewStyle,
  style,
  ...props
}: Props) {
  const idRef = useRef<number | null>(null)
  if (idRef.current == null) idRef.current = ++cueId
  const id = idRef.current
  const internalRef = useRef<ScrollViewInstance>(null)
  const targetRef = scrollRef ?? internalRef
  const [viewport, setViewport] = useState(0)
  const [content, setContent] = useState(0)
  const offsetRef = useRef(0)
  const [cueVisibility, setCueVisibility] = useState({ start: false, end: false })
  const maxOffset = Math.max(0, content - viewport)
  const canStart = cueVisibility.start
  const canEnd = cueVisibility.end
  const step = Math.max(160, viewport * 0.72)

  const syncCueVisibility = useCallback((nextOffset: number, nextMaxOffset = maxOffset) => {
    const next = { start: nextOffset > 4, end: nextOffset < nextMaxOffset - 4 }
    setCueVisibility(current => current.start === next.start && current.end === next.end ? current : next)
  }, [maxOffset])

  useEffect(() => {
    syncCueVisibility(offsetRef.current)
  }, [syncCueVisibility])

  const handleScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const next = horizontal ? event.nativeEvent.contentOffset.x : event.nativeEvent.contentOffset.y
    offsetRef.current = Math.max(0, next)
    syncCueVisibility(offsetRef.current)
    onScroll?.(event)
  }, [horizontal, onScroll, syncCueVisibility])

  const handleContentSizeChange = useCallback((width: number, height: number) => {
    setContent(horizontal ? width : height)
    onContentSizeChange?.(width, height)
  }, [horizontal, onContentSizeChange])

  // React Native Web does not consistently fire `onContentSizeChange` for a
  // horizontal ScrollView whose children are laid out after the first paint.
  // The scroll surface still has the correct DOM geometry, so use it as a
  // web-only fallback. This keeps the cue primitive honest: a clipped rail
  // gets the same fade/chevron treatment as a native rail or picker.
  const measureWebOverflow = useCallback(() => {
    if (Platform.OS !== "web") return
    const node = (targetRef.current as unknown as { getScrollableNode?: () => HTMLElement | null } | null)?.getScrollableNode?.()
    if (!node) return
    const nextViewport = horizontal ? node.clientWidth : node.clientHeight
    const nextContent = horizontal ? node.scrollWidth : node.scrollHeight
    const nextMaxOffset = Math.max(0, nextContent - nextViewport)
    setViewport(current => current === nextViewport ? current : nextViewport)
    setContent(current => current === nextContent ? current : nextContent)
    setCueVisibility(current => {
      const next = { start: offsetRef.current > 4, end: offsetRef.current < nextMaxOffset - 4 }
      return current.start === next.start && current.end === next.end ? current : next
    })
  }, [horizontal, targetRef])

  useEffect(() => {
    if (Platform.OS !== "web") return
    const frame1 = requestAnimationFrame(measureWebOverflow)
    let frame2 = requestAnimationFrame(() => { frame2 = requestAnimationFrame(measureWebOverflow) })
    const node = (targetRef.current as unknown as { getScrollableNode?: () => HTMLElement | null } | null)?.getScrollableNode?.()
    const ResizeObserverCtor = (globalThis as typeof globalThis & { ResizeObserver?: typeof ResizeObserver }).ResizeObserver
    const resizeObserver = node && ResizeObserverCtor ? new ResizeObserverCtor(measureWebOverflow) : null
    resizeObserver?.observe(node!)
    return () => {
      cancelAnimationFrame(frame1)
      cancelAnimationFrame(frame2)
      resizeObserver?.disconnect()
    }
  }, [measureWebOverflow, targetRef])

  const move = (direction: -1 | 1) => {
    const next = Math.max(0, Math.min(maxOffset, offsetRef.current + direction * step))
    offsetRef.current = next
    if (horizontal) targetRef.current?.scrollTo({ x: next, animated: true })
    else targetRef.current?.scrollTo({ y: next, animated: true })
    syncCueVisibility(next)
  }

  const gradientId = `overflow-cue-${id}`
  const edgeSize = horizontal ? 34 : 36
  const fade = horizontal
    ? { width: edgeSize, top: 0, bottom: 0 }
    : { height: edgeSize, left: 0, right: 0 }

  return (
    <View
      testID={testID}
      onLayout={event => setViewport(horizontal ? event.nativeEvent.layout.width : event.nativeEvent.layout.height)}
      style={[{ position: "relative", minWidth: 0, minHeight: 0 }, style]}
    >
      <ScrollView
        {...props}
        ref={targetRef}
        horizontal={horizontal}
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        onContentSizeChange={handleContentSizeChange}
        style={scrollViewStyle}
        contentContainerStyle={contentContainerStyle}
      >
        {children}
      </ScrollView>

      {canStart ? (
        <>
          <Svg
            pointerEvents="none"
            width={horizontal ? edgeSize : "100%"}
            height={horizontal ? "100%" : edgeSize}
            style={[{ position: "absolute", zIndex: 2 }, horizontal ? { left: 0 } : { top: 0 }, fade]}
          >
            <Defs>
              <LinearGradient id={`${gradientId}-start`} x1={horizontal ? "0" : "0"} y1={horizontal ? "0" : "0"} x2={horizontal ? "1" : "0"} y2={horizontal ? "0" : "1"}>
                <Stop offset="0" stopColor={edgeColor} stopOpacity="0.98" />
                <Stop offset="1" stopColor={edgeColor} stopOpacity="0" />
              </LinearGradient>
            </Defs>
            <Rect width="100%" height="100%" fill={`url(#${gradientId}-start)`} />
          </Svg>
          <Pressable
            testID={testID ? `${testID}-scroll-start` : undefined}
            accessibilityRole="button"
            accessibilityLabel={startLabel}
            onPress={() => move(-1)}
            style={[
              { position: "absolute", zIndex: 3, alignItems: "center", justifyContent: "center", backgroundColor: withAlpha(edgeColor, "D9") },
              horizontal ? { left: 0, top: 0, bottom: 0, width: edgeSize } : { left: 0, right: 0, top: 0, height: edgeSize },
            ]}
          >
            <CueChevron direction={horizontal ? "back" : "up"} color={cueColor} />
          </Pressable>
        </>
      ) : null}

      {canEnd ? (
        <>
          <Svg
            pointerEvents="none"
            width={horizontal ? edgeSize : "100%"}
            height={horizontal ? "100%" : edgeSize}
            style={[{ position: "absolute", zIndex: 2 }, horizontal ? { right: 0 } : { bottom: 0 }, fade]}
          >
            <Defs>
              <LinearGradient id={`${gradientId}-end`} x1={horizontal ? "1" : "0"} y1={horizontal ? "0" : "1"} x2={horizontal ? "0" : "0"} y2={horizontal ? "0" : "0"}>
                <Stop offset="0" stopColor={edgeColor} stopOpacity="0.98" />
                <Stop offset="1" stopColor={edgeColor} stopOpacity="0" />
              </LinearGradient>
            </Defs>
            <Rect width="100%" height="100%" fill={`url(#${gradientId}-end)`} />
          </Svg>
          <Pressable
            testID={testID ? `${testID}-scroll-end` : undefined}
            accessibilityRole="button"
            accessibilityLabel={endLabel}
            onPress={() => move(1)}
            style={[
              { position: "absolute", zIndex: 3, alignItems: "center", justifyContent: "center", backgroundColor: withAlpha(edgeColor, "D9") },
              horizontal ? { right: 0, top: 0, bottom: 0, width: edgeSize } : { left: 0, right: 0, bottom: 0, height: edgeSize },
            ]}
          >
            <CueChevron direction={horizontal ? "forward" : "down"} color={cueColor} />
          </Pressable>
        </>
      ) : null}
    </View>
  )
}
