export const darkColors = {
  background: "#090B0D",
  surface: "#101418",
  surfaceRaised: "#171D22",
  surfacePressed: "#1D252B",
  border: "#2A343B",
  borderStrong: "#3A4852",

  textPrimary: "#F2F5F7",
  textSecondary: "#A9B4BC",
  textMuted: "#66737D",

  primary: "#4DA3FF",
  primarySoft: "#102A44",

  hr: "#4ADE80",
  spo2: "#38BDF8",
  bp: "#FB7185",
  etco2: "#FBBF24",
  temp: "#C084FC",

  drugInduction: "#60A5FA",
  drugOpioid: "#A78BFA",
  drugRelaxant: "#F59E0B",
  vasopressor: "#F43F5E",
  fluid: "#22D3EE",
  agent: "#34D399",

  danger: "#EF4444",
  warning: "#FBBF24",
  success: "#22C55E",
} as const

export const lightColors = {
  background: "#F5F7FA",
  surface: "#FFFFFF",
  surfaceRaised: "#FFFFFF",
  surfacePressed: "#E8EEF4",
  border: "#D8E0E8",
  borderStrong: "#B9C6D2",

  textPrimary: "#111827",
  textSecondary: "#465462",
  textMuted: "#7B8794",

  primary: "#0066CC",
  primarySoft: "#DCEEFF",

  hr: "#15803D",
  spo2: "#0284C7",
  bp: "#E11D48",
  etco2: "#B45309",
  temp: "#7E22CE",

  drugInduction: "#2563EB",
  drugOpioid: "#7C3AED",
  drugRelaxant: "#D97706",
  vasopressor: "#E11D48",
  fluid: "#0891B2",
  agent: "#059669",

  danger: "#DC2626",
  warning: "#B45309",
  success: "#16A34A",
} as const

export type ColorScheme = "dark" | "light"
export type Colors = Record<keyof typeof darkColors, string>
export let colors: Colors = darkColors

export function setColorScheme(scheme: ColorScheme) {
  colors = scheme === "light" ? lightColors : darkColors
}

export type ClinicalKind =
  | "primary" | "hr" | "spo2" | "bp" | "etco2" | "temp"
  | "fluid" | "agent" | "danger" | "warning" | "success"

export function clinicalColor(kind: ClinicalKind): string {
  return colors[kind]
}

export function withAlpha(hex: string, alpha: string): string {
  return `${hex}${alpha}`
}
