import { Platform, type ViewStyle } from "react-native"

/**
 * For anything that is dragged or held: no text selection under the finger, no
 * callout menu, and the browser leaves the touch alone instead of panning or
 * zooming. Native ignores it.
 */
/**
 * A side-scrolling rail inside a page that scrolls down. Without this a swipe with a little vertical drift in it
 * hands the whole gesture to the page, which then scrolls instead of the rail. `pan-x` leaves the rail only the
 * horizontal pan; `contain` stops a rail that has reached its end from passing the swipe on to the page. Native
 * ignores it. Every horizontal ScrollView that sits in a vertically scrolling screen takes this style.
 */
export const SIDE_SCROLL_STYLE: ViewStyle = Platform.OS === "web"
  ? ({ touchAction: "pan-x", overscrollBehaviorX: "contain" } as ViewStyle)
  : {}

export const HELD_CONTROL_STYLE: ViewStyle = Platform.OS === "web"
  ? ({ userSelect: "none", WebkitUserSelect: "none", WebkitTouchCallout: "none", touchAction: "none" } as ViewStyle)
  : {}
