import { Platform, type ViewStyle } from "react-native"

/**
 * For anything that is dragged or held: no text selection under the finger, no
 * callout menu, and the browser leaves the touch alone instead of panning or
 * zooming. Native ignores it.
 */
export const HELD_CONTROL_STYLE: ViewStyle = Platform.OS === "web"
  ? ({ userSelect: "none", WebkitUserSelect: "none", WebkitTouchCallout: "none", touchAction: "none" } as ViewStyle)
  : {}
