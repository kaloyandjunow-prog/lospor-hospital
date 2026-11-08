import { dantroleneVialPlan, type VialPlan } from "./vial-plan"

/**
 * The dantrolene vials as the MH card shows them (10.2.0): the vials to open
 * for the dose in hand, drawn, and how many have been opened in all. Each dose
 * is planned on its own -- vials are reconstituted for the dose in hand, and
 * what is left in an opened vial is not carried over -- and the running count
 * adds the doses already given. Web and phone draw the same vials from here.
 */
export type DantroleneVialsView = {
  weightKg: number
  perKg: number
  doseMg: number
  plan: VialPlan
  /** One drawn vial per vial to open, largest first; `used` is how much of it the dose needs (1 = all). */
  drawing: { size: number; used: number }[]
  givenMg: number
  givenMgPerKg: number
  /** The total with this dose, in mg/kg; at 10 or more the card notes that EMHG sets no hard maximum. */
  afterMgPerKg: number
  reachesNoteAt10: boolean
  /** Vials opened for the doses already given, and in all with this one. */
  openedVials: number
  openedWithThis: number
}

export const DANTROLENE_NOTE_MG_PER_KG = 10

/** Vials opened for a list of doses, each planned alone. */
export function dantroleneVialsOpened(dosesMg: readonly number[], stocked: readonly number[]): { vials: number; mg: number } {
  let vials = 0
  let mg = 0
  for (const dose of dosesMg) {
    const plan = dantroleneVialPlan(dose, stocked)
    vials += plan.count
    mg += plan.totalMg
  }
  return { vials, mg }
}

export function dantroleneVialsView(input: {
  weightKg: number
  perKg: number
  /** The doses already given, in mg. */
  givenDosesMg: readonly number[]
  stocked: readonly number[]
}): DantroleneVialsView | null {
  const { weightKg, perKg } = input
  if (!(weightKg > 0) || !(perKg > 0)) return null
  const doseMg = Math.round(weightKg * perKg * 10) / 10
  const plan = dantroleneVialPlan(doseMg, input.stocked)
  if (plan.count === 0) return null
  let remaining = doseMg
  const drawing: DantroleneVialsView["drawing"] = []
  for (const item of plan.vials) {
    for (let index = 0; index < item.count; index++) {
      drawing.push({ size: item.size, used: Math.min(1, Math.max(0.05, remaining / item.size)) })
      remaining = Math.max(0, remaining - item.size)
    }
  }
  const givenMg = input.givenDosesMg.reduce((sum, dose) => sum + dose, 0)
  const afterMgPerKg = Math.round(((givenMg + doseMg) / weightKg) * 10) / 10
  const openedVials = dantroleneVialsOpened(input.givenDosesMg, input.stocked).vials
  return {
    weightKg,
    perKg,
    doseMg,
    plan,
    drawing,
    givenMg,
    givenMgPerKg: Math.round((givenMg / weightKg) * 10) / 10,
    afterMgPerKg,
    reachesNoteAt10: afterMgPerKg >= DANTROLENE_NOTE_MG_PER_KG,
    openedVials,
    openedWithThis: openedVials + plan.count,
  }
}

/* ---------- the drawing ---------- */

/** Width and height of a vial by size, in drawing px: a bigger vial is drawn bigger. */
export function vialDimensions(size: number): { w: number; h: number } {
  if (size >= 250) return { w: 64, h: 112 }
  if (size >= 120) return { w: 52, h: 92 }
  return { w: 34, h: 66 }
}

/**
 * One glass vial as an SVG document: aluminium cap, rubber stopper, neck, a
 * label with its size, and orange powder. The part of the powder the dose does
 * not use is dimmed, so the last vial shows how much of it is needed.
 */
export function vialSvg(size: number, used = 1): string {
  const { w, h } = vialDimensions(size)
  const bodyTop = h * 0.3
  const bodyH = h - bodyTop - 3
  const powderH = bodyH * 0.5
  const powderTop = h - 3 - powderH
  const usedH = powderH * Math.min(1, Math.max(0, used))
  const labelTop = bodyTop + bodyH * 0.18
  const fontSize = size >= 120 ? 12 : 10
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">`,
    `<defs><clipPath id="b"><rect x="2" y="${bodyTop}" width="${w - 4}" height="${bodyH}" rx="7"/></clipPath>`,
    `<linearGradient id="g" x1="0" x2="1"><stop offset="0" stop-color="#fff" stop-opacity=".30"/><stop offset=".25" stop-color="#fff" stop-opacity=".04"/><stop offset=".8" stop-color="#fff" stop-opacity=".02"/><stop offset="1" stop-color="#fff" stop-opacity=".16"/></linearGradient></defs>`,
    `<rect x="${w * 0.24}" y="0" width="${w * 0.52}" height="${h * 0.09}" rx="2" fill="#94a3b8"/>`,
    `<rect x="${w * 0.2}" y="${h * 0.07}" width="${w * 0.6}" height="${h * 0.08}" rx="2" fill="#475569"/>`,
    `<rect x="${w * 0.3}" y="${h * 0.15}" width="${w * 0.4}" height="${h * 0.16}" fill="#cbd5e1" fill-opacity=".10" stroke="#cbd5e1" stroke-opacity=".7" stroke-width="1.4"/>`,
    `<rect x="2" y="${bodyTop}" width="${w - 4}" height="${bodyH}" rx="7" fill="#cbd5e1" fill-opacity=".07" stroke="#cbd5e1" stroke-opacity=".8" stroke-width="1.6"/>`,
    `<g clip-path="url(#b)"><rect x="0" y="${powderTop}" width="${w}" height="${powderH}" fill="#f59e0b" fill-opacity="${used >= 1 ? 1 : 0.28}"/>`,
    used < 1 ? `<rect x="0" y="${powderTop + powderH - usedH}" width="${w}" height="${usedH}" fill="#f59e0b"/>` : "",
    `<rect x="0" y="${labelTop}" width="${w}" height="${bodyH * 0.26}" fill="#f8fafc" fill-opacity=".92"/>`,
    `<text x="${w / 2}" y="${labelTop + bodyH * 0.19}" text-anchor="middle" font-family="Inter,Arial" font-weight="800" font-size="${fontSize}" fill="#0f172a">${size} mg</text></g>`,
    `<rect x="2" y="${bodyTop}" width="${w - 4}" height="${bodyH}" rx="7" fill="url(#g)"/></svg>`,
  ].join("")
}
