import * as SecureStore from "expo-secure-store"

export const PRE_AUTH_LANGUAGE_KEY = "lospor_pre_auth_locale_v1"
export const LEGACY_LANGUAGE_KEY = "lospor_language"
export const THEME_KEY = "lospor_theme"
export const PREOP_LAYOUT_KEY = "lospor_preop_layout"
export const POSTOP_LAYOUT_KEY = "lospor_postop_layout"

type StoredLayout = "sections" | "scroll"

/** What this device last chose for theme and screen layouts; anything unreadable or unknown comes back null. */
export async function loadStoredAppearance(): Promise<{ theme: "dark" | "light" | null; preopLayout: StoredLayout | null; postopLayout: StoredLayout | null }> {
  const [theme, preop, postop] = await Promise.all([
    SecureStore.getItemAsync(THEME_KEY),
    SecureStore.getItemAsync(PREOP_LAYOUT_KEY),
    SecureStore.getItemAsync(POSTOP_LAYOUT_KEY),
  ])
  const layout = (value: string | null): StoredLayout | null => value === "sections" || value === "scroll" ? value : null
  return { theme: theme === "dark" || theme === "light" ? theme : null, preopLayout: layout(preop), postopLayout: layout(postop) }
}
