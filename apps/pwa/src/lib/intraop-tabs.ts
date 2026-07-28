export const INTRAOP_TAB_KEYS = [
  "equipment",
  "technique",
  "timing",
  "position",
  "monitoring",
  "airway",
  "vascular",
  "premedication",
  "log",
  "events",
] as const

export type IntraopTab = typeof INTRAOP_TAB_KEYS[number]

export function adjacentIntraopTab(current: IntraopTab, direction: -1 | 1): IntraopTab {
  const index = INTRAOP_TAB_KEYS.indexOf(current)
  const nextIndex = Math.max(0, Math.min(INTRAOP_TAB_KEYS.length - 1, index + direction))
  return INTRAOP_TAB_KEYS[nextIndex]
}

export function centeredTabRailScrollX(
  layout: { x: number; width: number },
  screenWidth: number,
): number {
  return Math.max(0, layout.x + layout.width / 2 - screenWidth / 2)
}

export function intraopTabSwipeDirection(dx: number, dy: number): -1 | 1 | null {
  if (Math.abs(dx) <= Math.abs(dy) * 1.5 || Math.abs(dx) <= 20) return null
  if (dx < -50) return 1
  if (dx > 50) return -1
  return null
}
