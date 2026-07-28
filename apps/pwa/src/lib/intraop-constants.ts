// Presentation-only colour palettes for the intraop screen.
// The option *lists* come from the OptionLibrary API; these are presentation
// constants (category accents) and clinical quick-pick defaults.

export const MOBILE_DRUG_CAT_COLOR: Record<string, string> = {
  "Induction": "#3b82f6", "Opioids": "#a855f7", "Relaxants": "#f59e0b", "Reversal": "#10b981",
  "Vasopressors": "#ef4444", "Antiemetics": "#14b8a6", "Analgesics": "#f97316", "Local anaesthetics": "#0891b2",
}
export const MOBILE_FLUID_CAT_COLOR: Record<string, string> = {
  "Crystalloids": "#06b6d4", "Colloids": "#818cf8", "Blood products": "#fb7185", "Other": "#94a3b8",
}
export const MOBILE_AGENT_COLOR: Record<string, string> = { Sevoflurane: "#a855f7", Desflurane: "#3b82f6", Isoflurane: "#10b981" }
export const MOBILE_POSITION_COLOR: Record<string, string> = {
  SUPINE: "#3b82f6", PRONE: "#6366f1", LEFT_LATERAL: "#06b6d4", RIGHT_LATERAL: "#06b6d4",
  GYNECOLOGICAL: "#a855f7", TRENDELENBURG: "#f97316", REVERSE_TRENDELENBURG: "#f59e0b",
  FOWLER: "#22c55e", BEACH_CHAIR: "#14b8a6", LLOYD_DAVIES: "#8b5cf6",
  LATERAL_DECUBITUS_LEFT: "#0ea5e9", LATERAL_DECUBITUS_RIGHT: "#0ea5e9",
  SITTING: "#22c55e", JACKKNIFE: "#64748b", KNEE_CHEST: "#64748b",
}

