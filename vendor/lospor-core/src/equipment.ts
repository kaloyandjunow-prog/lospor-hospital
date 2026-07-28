import { suggestsDifficultAirwayEquipment, type AirwayFindings } from "./risk"

export interface EquipmentInput {
  ageYears?: number | null
  weightKg?: number | null
  heightCm?: number | null
  sex?: string | null
  bmi?: number | null
  airway?: AirwayFindings | null
}

export interface EquipmentItem { label: string; value: string; note?: string }
export interface EquipmentCategory { cat: string; color: string; items: EquipmentItem[] }

export function calcEquipment(input: EquipmentInput): EquipmentCategory[] {
  const age = input.ageYears ?? null
  const weight = input.weightKg ?? null
  const height = input.heightCm ?? null
  const sex = input.sex ?? "OTHER"
  const bmi = input.bmi ?? (weight && height ? weight / ((height / 100) ** 2) : null)
  const isNeonate = age != null && age < 1 / 12
  const isInfant = age != null && age < 1
  const isPed = age != null && age < 18
  const w = weight ?? (isPed ? 20 : 70)
  const a = age ?? 35
  const isFemale = sex === "FEMALE" || sex === "F"

  const ibwKg = isPed || !height ? null : Math.max((isFemale ? 45.5 : 50) + 0.906 * (height - 152.4), 0)

  function ettResult(): { size: string; cuffed: boolean; depth: string } {
    if (isNeonate) {
      const sz = w < 1 ? 2.5 : w < 2.5 ? 3.0 : 3.5
      return { size: `${sz}`, cuffed: false, depth: `${Math.round(10 + w)}` }
    }
    if (isInfant) return { size: "3.5–4.0", cuffed: false, depth: "12" }
    if (isPed) {
      const uncuffed = Math.round((a / 4 + 4) * 2) / 2
      const cuffed = Math.round((a / 4 + 3.5) * 2) / 2
      return { size: `${cuffed} cuffed / ${uncuffed} uncuffed`, cuffed: true, depth: `${Math.round(a / 2 + 12)}` }
    }
    const sz = isFemale ? 7.5 : 8.0
    const depth = height ? Math.round(height / 10 + (isFemale ? 1 : 2)) : sz * 3
    return { size: `${sz}`, cuffed: true, depth: `${depth}` }
  }

  function lmaSize(): string {
    if (w < 5) return "1"
    if (w < 10) return "1.5"
    if (w < 20) return "2"
    if (w < 30) return "2.5"
    if (w < 50) return "3"
    if (w < 70) return "4"
    if (w < 100) return "5"
    return "6"
  }

  function guedel(): string {
    if (w < 3) return "00"
    if (w < 5) return "0"
    if (w < 10) return "1"
    if (w < 20) return "2"
    if (w < 35) return "3"
    if (w < 60) return "4"
    if (w < 90) return "5"
    return "6"
  }

  function laryngoscope(): string {
    if (isNeonate) return "Miller 0"
    if (isInfant) return "Miller 1"
    if (isPed && a < 8) return "Miller 2 / Mac 2"
    if (isPed) return "Mac 2 / Mac 3"
    if (isFemale || w < 60) return "Mac 3"
    if (w > 100 || (height && height > 185)) return "Mac 4"
    return "Mac 3"
  }

  const ett = ettResult()
  const primaryEttSize = parseFloat(ett.size.split("/")[0].trim())
  const ngtDepth = !height ? "" : isPed ? `${Math.round(a * 2.5 + 15)} cm` : `${Math.round(50 + (height - 160) * 0.25)} cm`
  const difficultAirway = input.airway ? suggestsDifficultAirwayEquipment(input.airway) : false

  return [
    {
      cat: "Airway", color: "#3b82f6",
      items: [
        { label: "ETT size", value: ett.size, note: ett.cuffed ? "cuffed" : "uncuffed" },
        { label: "ETT depth (lip)", value: `${ett.depth} cm` },
        { label: "LMA size", value: lmaSize() },
        { label: "Laryngoscope", value: laryngoscope() },
        { label: "Guedel OPA", value: `Size ${guedel()}` },
        { label: "Suction catheter", value: primaryEttSize <= 3.5 ? "6 Fr" : primaryEttSize <= 4.5 ? "8 Fr" : primaryEttSize <= 5.5 ? "10 Fr" : primaryEttSize <= 7.0 ? "12 Fr" : "14 Fr" },
      ],
    },
    {
      cat: "Ventilation", color: "#14b8a6",
      items: [
        { label: "Tidal volume", value: `${Math.round((ibwKg ?? w) * 6)}–${Math.round((ibwKg ?? w) * 8)} mL`, note: "6–8 mL/kg IBW" },
        { label: "Rate", value: isNeonate ? "40–60 /min" : isInfant ? "30–40 /min" : isPed && a < 3 ? "24–30 /min" : isPed && a < 8 ? "18–24 /min" : isPed ? "14–18 /min" : "10–16 /min" },
        { label: "PEEP", value: bmi && bmi >= 30 ? "8–10 cmH₂O" : "5 cmH₂O" },
        { label: "I:E ratio", value: "1:2" },
      ],
    },
    {
      cat: "Fluids", color: "#0ea5e9",
      items: [{ label: "Maintenance", value: `${Math.round(w <= 10 ? w * 4 : w <= 20 ? 40 + (w - 10) * 2 : 60 + (w - 20))} mL/hr`, note: "4-2-1 rule" }],
    },
    {
      cat: "Catheters", color: "#f59e0b",
      items: [
        { label: "Urinary catheter", value: isNeonate ? "5–6 Fr" : isInfant ? "6–8 Fr" : isPed && a < 5 ? "8 Fr" : isPed && a < 10 ? "8–10 Fr" : isPed ? "10–12 Fr" : isFemale ? "12–14 Fr" : "14–16 Fr" },
        { label: "NGT", value: isNeonate ? "5 Fr" : isInfant ? "8 Fr" : isPed && a < 3 ? "8–10 Fr" : isPed && a < 10 ? "10 Fr" : isPed ? "12 Fr" : isFemale ? "14 Fr" : "16 Fr", note: ngtDepth ? `~${ngtDepth} insertion depth` : undefined },
      ],
    },
    {
      cat: "Monitoring", color: "#22c55e",
      items: [
        { label: "BP cuff", value: isNeonate ? "Neonatal (2.5–4 cm)" : isInfant ? "Infant (4–6 cm)" : isPed && a < 6 ? "Child (6–9 cm)" : isPed ? "Child / Small adult" : bmi && bmi >= 40 ? "Large adult / Thigh cuff" : bmi && bmi >= 30 ? "Large adult (15–20 cm)" : "Adult (12–15 cm)" },
        { label: "Defibrillator", value: w < 10 ? "Paediatric (4.5 cm), 4 J/kg" : w < 25 ? "Paediatric or adult (manufacturer-specific)" : "Adult pads" },
      ],
    },
    ...(difficultAirway ? [{
      cat: "Difficult Airway", color: "#ef4444",
      items: [
        { label: "Video laryngoscope", value: "Have available", note: "from today's airway exam" },
        { label: "Bougie / stylet", value: "Have available" },
        { label: "Backup ETT", value: `${Number.isFinite(primaryEttSize) ? primaryEttSize - 0.5 : ett.size} (0.5 smaller)` },
        { label: "Difficult airway trolley", value: "Confirm location" },
      ],
    }] : []),
  ]
}
