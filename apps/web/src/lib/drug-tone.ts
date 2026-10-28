import { useSyncExternalStore, type CSSProperties } from "react"
import { drugColorTones } from "@lospor/core/drug-colors"

/**
 * A hospital's own drug colour (10.0.0) on the web. Its tones for both themes
 * travel as CSS variables and the `drug-tone` class (globals.css) picks the
 * theme's, so any colour, a free one included, stays readable.
 */
export function drugToneStyle(hex: string): CSSProperties {
  const { light, dark } = drugColorTones(hex)
  return {
    "--tone-bg": light.bg, "--tone-text": light.text, "--tone-border": light.border,
    "--tone-bg-dark": dark.bg, "--tone-text-dark": dark.text, "--tone-border-dark": dark.border,
  } as CSSProperties
}

/** A chip in the hospital's colour if one is set, else in the bundled classes. */
export function drugChip(bundledClasses: string, customColor: string | null | undefined): { className: string; style?: CSSProperties } {
  return customColor ? { className: "drug-tone", style: drugToneStyle(customColor) } : { className: bundledClasses }
}

/** The colour itself, readable on the page in the theme in use (bars, lane text). */
export function drugSolid(hex: string, dark: boolean): string {
  const tones = drugColorTones(hex)
  return dark ? tones.dark.solid : tones.light.solid
}

function subscribe(onChange: () => void): () => void {
  const observer = new MutationObserver(onChange)
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] })
  return () => observer.disconnect()
}

/** Whether the dark theme is on, following the theme switch as it happens. */
export function useDarkTheme(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => document.documentElement.classList.contains("dark"),
    () => true,
  )
}
