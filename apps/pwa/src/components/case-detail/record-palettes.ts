// Colours of the record on the phone: the paper look in the light theme and a matching dark one.
// (The printed record itself is always white.)
const C_SBP_L = "#e03131", C_HR_L = "#2f9e44"
export const PALETTES = {
  light: {
    card: "#ffffff", ink: "#1e293b", muted: "#64748b", faint: "#94a3b8",
    grid: "#e2e8f0", gridMin: "#f1f5f9", timeBg: "#f1f5f9", timeTxt: "#334155",
    lbl: "#475569", sbp: C_SBP_L, hr: C_HR_L, event: "#4c6ef5", drug: "#7c3aed",
    title: "#1e3a8a",
  },
  dark: {
    card: "#1c1c1c", ink: "#e5e5e5", muted: "#909090", faint: "#7d7d7d",
    grid: "#3a3a3a", gridMin: "#262626", timeBg: "#262626", timeTxt: "#d0d0d0",
    lbl: "#b0b0b0", sbp: "#ff6b6b", hr: "#51cf66", event: "#748ffc", drug: "#9775fa",
    title: "#93c5fd",
  },
}
