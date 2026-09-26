import { useCallback } from "react"

import { useThemeScheme } from "@/theme/theme-context"
import type { ColorScheme } from "@/theme/colors"
import { LIGHT_SHADES } from "@/theme/light-shades"

function expand(hex: string): { base: string; alpha: string } {
  let body = hex.slice(1).toLowerCase()
  if (body.length === 3 || body.length === 4) body = body.split("").map(char => char + char).join("")
  return { base: `#${body.slice(0, 6)}`, alpha: body.slice(6) }
}

/**
 * A colour written for the dark theme, as the current theme shows it (1.4.9).
 * Dark returns it unchanged; light returns its counterpart from LIGHT_SHADES
 * (the web light theme's slate neutrals and readable accents), keeping any
 * alpha suffix. One table, so the two themes cannot drift screen by screen.
 */
export function shadeFor(scheme: ColorScheme, hex: string): string {
  if (scheme !== "light") return hex
  const { base, alpha } = expand(hex)
  return (LIGHT_SHADES[base] ?? base) + alpha
}

/**
 * The theme-aware colour function for a component. It reads the theme from
 * context, so a component using it re-renders the moment the theme changes --
 * memoised rows included -- with no reload.
 */
export function useShade(): (hex: string) => string {
  const theme = useThemeScheme()
  return useCallback((hex: string) => shadeFor(theme, hex), [theme])
}

/** Subscribes a component that reads the shared `colors` to theme changes. */
export function useThemeRefresh(): void {
  useThemeScheme()
}
