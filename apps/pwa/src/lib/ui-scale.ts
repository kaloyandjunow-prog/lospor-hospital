import * as SecureStore from "expo-secure-store"
import { Platform } from "react-native"

/**
 * The display size on the web build (PWA), a per-device setting (10.0.0):
 * everything larger or smaller together, as browser zoom does. The phone app
 * itself follows the operating system's text size instead.
 *
 * React Native Web sizes everything in pixels, so the root font size the web
 * app scales would change nothing here. Nor does CSS zoom work: screens sized
 * from the window width (intraop) stay at the unzoomed width and run off the
 * side. The viewport is scaled instead, as a phone browser zooms: the app is
 * laid out for a narrower window and drawn larger, so it reflows to fit.
 * Desktop browsers ignore the viewport; there the web app has its own size.
 */
const DEFAULT_VIEWPORT = "width=device-width, initial-scale=1, shrink-to-fit=no"
export const UI_SCALE_KEY = "lospor_ui_scale"
export const UI_SCALE_MIN = 80
export const UI_SCALE_MAX = 150
export const UI_SCALE_STEP = 5
export const UI_SCALE_DEFAULT = 100

export function parseUiScale(value: unknown): number {
  const number = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN
  if (!Number.isFinite(number)) return UI_SCALE_DEFAULT
  const stepped = Math.round(number / UI_SCALE_STEP) * UI_SCALE_STEP
  return Math.min(UI_SCALE_MAX, Math.max(UI_SCALE_MIN, stepped))
}

/** Whether the setting does anything here: the web build only. */
export const uiScaleSupported = Platform.OS === "web"

let appliedFactor = 1
let scaleReported = false

/**
 * React Native Web takes the window to be the visual viewport times its scale,
 * so that a pinch-zoom does not resize the app -- and so a scaled viewport did
 * not either: screens kept the unscaled width and ran off the side. The scale
 * is fixed at the display size (pinch is locked to it), so the viewport
 * reports its scale relative to that: 1, unless something else zooms it.
 */
function reportScaleRelativeToDisplaySize(): void {
  const viewport = window.visualViewport
  if (scaleReported || !viewport) return
  const native = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(viewport), "scale")?.get
  if (!native) return
  Object.defineProperty(viewport, "scale", { configurable: true, get: () => (native.call(viewport) as number) / appliedFactor })
  scaleReported = true
}

export function applyUiScale(percent: number): void {
  if (!uiScaleSupported || typeof document === "undefined") return
  const scale = parseUiScale(percent)
  const meta = document.querySelector('meta[name="viewport"]')
  if (!meta) return
  const factor = scale / 100
  reportScaleRelativeToDisplaySize()
  appliedFactor = factor
  meta.setAttribute("content", scale === UI_SCALE_DEFAULT
    ? DEFAULT_VIEWPORT
    : `width=${Math.round(screen.width / factor)}, initial-scale=${factor}, minimum-scale=${factor}, maximum-scale=${factor}, shrink-to-fit=no`)
  // The window's size changes, but no resize event says so: screens sized from
  // it (intraop) kept the old width until something else resized the window.
  window.dispatchEvent(new Event("resize"))
  window.visualViewport?.dispatchEvent(new Event("resize"))
}

export async function loadUiScale(): Promise<number> {
  const stored = await SecureStore.getItemAsync(UI_SCALE_KEY).catch(() => null)
  return parseUiScale(stored)
}

export async function saveUiScale(percent: number): Promise<number> {
  const scale = parseUiScale(percent)
  applyUiScale(scale)
  await SecureStore.setItemAsync(UI_SCALE_KEY, String(scale)).catch(() => {})
  return scale
}
