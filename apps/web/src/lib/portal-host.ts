/**
 * Where a popover, menu or dialog is drawn. Normally the body; while the chart is in the browser's full screen it
 * must be the full-screen element, because only that element and what is inside it is shown (10.8.0).
 */
export function portalHost(): HTMLElement {
  return (document.fullscreenElement as HTMLElement | null) ?? document.body
}
