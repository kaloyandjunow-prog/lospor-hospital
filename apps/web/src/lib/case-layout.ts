import type { PreopLayout } from "@/lib/preop-layout"

/**
 * How the case screens are laid out, a per-user setting kept in localStorage
 * (10.0.0).
 *
 * One choice first: the sidebar or not. The sidebar is one panel beside every
 * step of the case -- preop, intraop and postop -- that stays as the case
 * moves on, and it overrides everything else. Without it, each screen is
 * sectioned (one section at a time) or scrollable, chosen screen by screen.
 *
 * The keys are those the earlier settings used, so a choice already made
 * carries over: `preopLayout` was "sidebar" | "scroll" | "tabs" and is now the
 * preop screen's own choice; "sidebar" there meant the sidebar was on.
 * `layoutMode` was, and stays, the intraop screen's.
 */
export type ScreenLayout = "tabs" | "scroll"
export type CaseScreen = "preop" | "intraop" | "postop"
export type CaseLayout = { sidebar: boolean } & Record<CaseScreen, ScreenLayout>

export const CASE_LAYOUT_KEYS = {
  sidebar: "caseSidebar",
  preop: "preopLayout",
  intraop: "layoutMode",
  postop: "postopLayout",
} as const

export const DEFAULT_CASE_LAYOUT: CaseLayout = { sidebar: true, preop: "scroll", intraop: "scroll", postop: "scroll" }

const screenLayout = (value: string | null): ScreenLayout | null => value === "tabs" || value === "scroll" ? value : null

/** The settings as stored, with the earlier keys read the way they were meant. */
export function readCaseLayout(get: (key: string) => string | null): CaseLayout {
  const legacyPreop = get(CASE_LAYOUT_KEYS.preop)
  const sidebarStored = get(CASE_LAYOUT_KEYS.sidebar)
  // Before 10.0.0 the sidebar was the preop layout's default.
  const sidebar = sidebarStored === "on" ? true
    : sidebarStored === "off" ? false
    : legacyPreop === null || legacyPreop === "sidebar"
  const preop = screenLayout(legacyPreop) ?? DEFAULT_CASE_LAYOUT.preop
  const intraop = screenLayout(get(CASE_LAYOUT_KEYS.intraop)) ?? DEFAULT_CASE_LAYOUT.intraop
  // Postop followed the preop choice until it had one of its own.
  const postop = screenLayout(get(CASE_LAYOUT_KEYS.postop)) ?? preop
  return { sidebar, preop, intraop, postop }
}

/** The layout a screen is drawn in: the sidebar overrides the screen's own choice. */
export function screenLayoutOf(layout: CaseLayout, screen: CaseScreen): PreopLayout {
  return layout.sidebar ? "sidebar" : layout[screen]
}

/** The keys and values to store for a change. */
export function caseLayoutWrites(change: Partial<CaseLayout>): Array<[string, string]> {
  const writes: Array<[string, string]> = []
  if (change.sidebar !== undefined) writes.push([CASE_LAYOUT_KEYS.sidebar, change.sidebar ? "on" : "off"])
  for (const screen of ["preop", "intraop", "postop"] as const) {
    const value = change[screen]
    if (value) writes.push([CASE_LAYOUT_KEYS[screen], value])
  }
  return writes
}

export function isCaseLayoutKey(key: string | null): boolean {
  return key !== null && (Object.values(CASE_LAYOUT_KEYS) as string[]).includes(key)
}
