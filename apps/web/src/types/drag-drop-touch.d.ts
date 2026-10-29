// The touch drag-and-drop library ships no types; this is the part the timeline uses.
declare module "@dragdroptouch/drag-drop-touch" {
  export type DragDropTouchOptions = {
    allowDragScroll?: boolean
    contextMenuDelayMS?: number
    dragImageOpacity?: number
    dragScrollPercentage?: number
    dragScrollSpeed?: number
    dragThresholdPixels?: number
    forceListen?: boolean
    isPressHoldMode?: boolean
    pressHoldDelayMS?: number
    pressHoldMargin?: number
    pressHoldThresholdPixels?: number
  }
  export function enableDragDropTouch(dragRoot?: Document | Element, dropRoot?: Document | Element, options?: DragDropTouchOptions): void
}
