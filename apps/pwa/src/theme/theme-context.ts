import { createContext, useContext } from "react"

import type { ColorScheme } from "@/theme/colors"

/**
 * The colour scheme on its own context (1.4.9), supplied by PreferencesProvider.
 * Kept apart from the preferences module so that anything can follow the theme
 * -- shared primitives rendered without the provider, and tests that mock
 * preferences -- falling back to dark.
 */
export const ThemeSchemeContext = createContext<ColorScheme>("dark")

/** The colour scheme, subscribing the caller to theme changes. */
export function useThemeScheme(): ColorScheme {
  return useContext(ThemeSchemeContext)
}
