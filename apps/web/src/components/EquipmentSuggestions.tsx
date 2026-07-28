"use client"

import { suggestsDifficultAirwayEquipment } from "@/lib/risk-derivation"

interface Props {
  ageYears?: number | null
  weightKg?: number | null
  heightCm?: number | null
  sex?: string | null
  bmi?: number | null
  mallampati?: string | null
  neckMobility?: string | null
  mouthOpeningCm?: number | null
  cormackLehane?: string | null
}

interface Item { label: string; value: string; note?: string }
interface Category { cat: string; color: string; items: Item[] }

// ── Clinical sizing engine ────────────────────────────────────────────────────
function calculate(p: Props): Category[] {
  const age    = p.ageYears  ?? null
  const wt     = p.weightKg  ?? null
  const ht     = p.heightCm  ?? null
  const sex    = p.sex       ?? "OTHER"
  const bmi    = p.bmi       ?? null

  const isPed  = age != null && age < 18
  const isInfant   = age != null && age < 1
  const isNeonate  = age != null && age < 1/12
  const w = wt ?? (isPed ? 20 : 70)   // fallback weight for calcs
  const a = age ?? 35

  // IBW (Devine, adults) — skip for children
  function ibw() {
    if (!ht || !sex) return null
    const base = sex === "FEMALE" ? 45.5 : 50
    return Math.round(Math.max(base + 0.906 * (ht - 152.4), 0) * 10) / 10
  }
  const ibwKg = isPed ? null : ibw()

  // ── Airway ────────────────────────────────────────────────────────────────
  function ettSize(): { size: string; cuffed: boolean; depth: string } {
    if (isNeonate) {
      const sz = w < 1 ? 2.5 : w < 2.5 ? 3.0 : 3.5
      return { size: `${sz}`, cuffed: false, depth: `${Math.round(10 + w)}` }
    }
    if (isInfant) return { size: "3.5–4.0", cuffed: false, depth: "12" }
    if (isPed) {
      const uncuffed = Math.round((a / 4 + 4) * 2) / 2
      const cuffed   = Math.round((a / 4 + 3.5) * 2) / 2
      const depth    = Math.round(a / 2 + 12)
      return { size: `${cuffed} cuffed / ${uncuffed} uncuffed`, cuffed: true, depth: `${depth}` }
    }
    // Adults — use 3 × ETT size for depth
    const sz = sex === "FEMALE" ? 7.5 : 8.0
    const depth = ht ? Math.round(ht / 10 + (sex === "FEMALE" ? 1 : 2)) : sz * 3
    return { size: `${sz}`, cuffed: true, depth: `${depth}` }
  }

  function lmaSize(): string {
    if (w < 5)   return "1"
    if (w < 10)  return "1.5"
    if (w < 20)  return "2"
    if (w < 30)  return "2.5"
    if (w < 50)  return "3"
    if (w < 70)  return "4"
    if (w < 100) return "5"
    return "6"
  }

  function guedel(): string {
    if (w < 3)   return "00"
    if (w < 5)   return "0"
    if (w < 10)  return "1"
    if (w < 20)  return "2"
    if (w < 35)  return "3"
    if (w < 60)  return "4"
    if (w < 90)  return "5"
    return "6"
  }

  function laryngoscope(): string {
    if (isNeonate)           return "Miller 0"
    if (isInfant)            return "Miller 1"
    if (isPed && a < 8)      return "Miller 2 / Mac 2"
    if (isPed)               return "Mac 2 / Mac 3"
    if (sex === "FEMALE" || w < 60) return "Mac 3"
    if (w > 100 || (ht && ht > 185)) return "Mac 4"
    return "Mac 3"
  }

  const ett = ettSize()

  function suctionFr(): string {
    const sz = parseFloat(ett.size.split("/")[0].trim())
    if (sz <= 3.5) return "6 Fr"
    if (sz <= 4.5) return "8 Fr"
    if (sz <= 5.5) return "10 Fr"
    if (sz <= 7.0) return "12 Fr"
    return "14 Fr"
  }

  // ── Ventilation ───────────────────────────────────────────────────────────
  function tidalVolume(): string {
    const ref = ibwKg ?? w
    const lo  = Math.round(ref * 6)
    const hi  = Math.round(ref * 8)
    return `${lo}–${hi} mL`
  }

  function rr(): string {
    if (isNeonate)              return "40–60 /min"
    if (isInfant)               return "30–40 /min"
    if (isPed && a < 3)         return "24–30 /min"
    if (isPed && a < 8)         return "18–24 /min"
    if (isPed)                  return "14–18 /min"
    return "10–16 /min"
  }

  function peep(): string {
    if (bmi && bmi >= 30) return "8–10 cmH₂O"
    return "5 cmH₂O"
  }

  // ── Fluids ────────────────────────────────────────────────────────────────
  function maintenanceFluids(): string {
    let rate: number
    if (w <= 10)       rate = w * 4
    else if (w <= 20)  rate = 40 + (w - 10) * 2
    else               rate = 60 + (w - 20) * 1
    return `${Math.round(rate)} mL/hr`
  }

  // ── Catheters ─────────────────────────────────────────────────────────────
  function urinaryCath(): string {
    if (isNeonate)          return "5–6 Fr"
    if (isInfant)           return "6–8 Fr"
    if (isPed && a < 5)     return "8 Fr"
    if (isPed && a < 10)    return "8–10 Fr"
    if (isPed)              return "10–12 Fr"
    if (sex === "FEMALE")   return "12–14 Fr"
    return "14–16 Fr"
  }

  function ngt(): string {
    if (isNeonate)          return "5 Fr"
    if (isInfant)           return "8 Fr"
    if (isPed && a < 3)     return "8–10 Fr"
    if (isPed && a < 10)    return "10 Fr"
    if (isPed)              return "12 Fr"
    if (sex === "FEMALE")   return "14 Fr"
    return "16 Fr"
  }

  // NGT depth (NEX): nose → ear → xiphoid ≈ 50 + (ht - 100)/2 for adults
  function ngtDepth(): string {
    if (!ht) return ""
    if (isPed) return `${Math.round(a * 2.5 + 15)} cm`
    return `${Math.round(50 + (ht - 160) * 0.25)} cm`
  }

  // ── Monitoring ────────────────────────────────────────────────────────────
  function bpCuff(): string {
    if (isNeonate)    return "Neonatal (2.5–4 cm)"
    if (isInfant)     return "Infant (4–6 cm)"
    if (isPed && a<6) return "Child (6–9 cm)"
    if (isPed)        return "Child / Small adult"
    if (bmi && bmi >= 40) return "Large adult / Thigh cuff"
    if (bmi && bmi >= 30) return "Large adult (15–20 cm)"
    return "Adult (12–15 cm)"
  }

  function defibPads(): string {
    if (w < 10)  return "Paediatric (4.5 cm), 4 J/kg"
    if (w < 25)  return "Paediatric or adult (manufacturer-specific)"
    return "Adult pads"
  }

  // ── Difficult airway (from today's exam findings, not history) ─────────────
  const difficultAirway = suggestsDifficultAirwayEquipment({
    mallampati: p.mallampati, neckMobility: p.neckMobility,
    mouthOpeningCm: p.mouthOpeningCm, cormackLehane: p.cormackLehane,
  })
  function backupEttSize(): string {
    const primary = parseFloat(ett.size.split("/")[0].trim())
    return Number.isFinite(primary) ? `${primary - 0.5}` : ett.size
  }

  // ─────────────────────────────────────────────────────────────────────────
  return [
    {
      cat: "Airway",
      color: "text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800/40",
      items: [
        { label: "ETT size",         value: ett.size,       note: ett.cuffed ? "cuffed" : "uncuffed" },
        { label: "ETT depth (lip)",  value: `${ett.depth} cm` },
        { label: "LMA size",         value: lmaSize() },
        { label: "Laryngoscope",     value: laryngoscope() },
        { label: "Guedel OPA",       value: `Size ${guedel()}` },
        { label: "Suction catheter", value: suctionFr() },
      ],
    },
    {
      cat: "Ventilation",
      color: "text-teal-700 dark:text-teal-300 bg-teal-50 dark:bg-teal-900/20 border-teal-200 dark:border-teal-800/40",
      items: [
        { label: "Tidal volume",    value: tidalVolume(), note: "6–8 mL/kg IBW" },
        { label: "Rate",            value: rr() },
        { label: "PEEP",            value: peep() },
        { label: "I:E ratio",       value: "1:2" },
      ],
    },
    {
      cat: "Fluids",
      color: "text-sky-700 dark:text-sky-300 bg-sky-50 dark:bg-sky-900/20 border-sky-200 dark:border-sky-800/40",
      items: [
        { label: "Maintenance", value: maintenanceFluids(), note: "4-2-1 rule" },
      ],
    },
    {
      cat: "Catheters",
      color: "text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800/40",
      items: [
        { label: "Urinary catheter", value: urinaryCath() },
        { label: "NGT",              value: ngt(), note: ngtDepth() ? `~${ngtDepth()} insertion depth` : undefined },
      ],
    },
    {
      cat: "Monitoring",
      color: "text-green-700 dark:text-green-300 bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800/40",
      items: [
        { label: "BP cuff",         value: bpCuff() },
        { label: "Defibrillator",   value: defibPads() },
      ],
    },
    ...(difficultAirway ? [{
      cat: "Difficult Airway",
      color: "text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800/40",
      items: [
        { label: "Video laryngoscope", value: "Have available", note: "from today's airway exam" },
        { label: "Bougie / stylet",    value: "Have available" },
        { label: "Backup ETT",         value: `${backupEttSize()} (0.5 smaller)` },
        { label: "Difficult airway trolley", value: "Confirm location" },
      ],
    }] : []),
  ]
}

// ── Component ─────────────────────────────────────────────────────────────────
export function EquipmentSuggestions(props: Props) {
  const categories = calculate(props)

  return (
    <div className="rounded-xl border border-slate-200 dark:border-[#2e2e2e] bg-white dark:bg-[#141414] overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-100 dark:border-[#2a2a2a] bg-slate-50 dark:bg-[#1a1a1a]">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          Suggested equipment &amp; sizes
        </p>
        {props.weightKg && (
          <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">
            Based on {props.weightKg} kg{props.heightCm ? `, ${props.heightCm} cm` : ""}{props.ageYears != null ? `, ${props.ageYears}y` : ""}{props.sex && props.sex !== "OTHER" ? `, ${props.sex === "MALE" ? "M" : "F"}` : ""}
          </p>
        )}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-slate-100 dark:divide-[#2a2a2a]">
        {categories.map(cat => (
          <div key={cat.cat} className="p-3 space-y-1.5">
            <p className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md inline-block border ${cat.color}`}>
              {cat.cat}
            </p>
            <div className="space-y-1">
              {cat.items.map(item => (
                <div key={item.label} className="flex items-baseline justify-between gap-2">
                  <span className="text-xs text-slate-500 dark:text-slate-400 shrink-0">{item.label}</span>
                  <div className="text-right">
                    <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">{item.value}</span>
                    {item.note && <span className="block text-[10px] text-slate-400 dark:text-slate-500">{item.note}</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
