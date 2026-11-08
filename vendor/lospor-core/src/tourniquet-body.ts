/**
 * The tourniquet body picker (10.2.0): a line-art body for the patient's age
 * band (infant, child, adult woman, adult man) with a pneumatic cuff spot on
 * each upper arm, forearm, thigh and calf. Tourniquet on asks where it went
 * on; Tourniquet off asks which one was released. The geometry is computed
 * here so the web chart and the phone draw the same body and the same cuffs;
 * each app only renders the paths and places a button on each spot.
 *
 * Sides are the patient's: the patient faces the viewer, so the patient's
 * right is on the viewer's left.
 */

export const TOURNIQUET_SITES = [
  "RIGHT_UPPER_ARM", "LEFT_UPPER_ARM", "RIGHT_FOREARM", "LEFT_FOREARM",
  "RIGHT_THIGH", "LEFT_THIGH", "RIGHT_CALF", "LEFT_CALF",
] as const
export type TourniquetSite = typeof TOURNIQUET_SITES[number]

const SITE_WORDS: Record<TourniquetSite, { en: string; bg: string }> = {
  RIGHT_UPPER_ARM: { en: "Right upper arm", bg: "Дясна мишница" },
  LEFT_UPPER_ARM: { en: "Left upper arm", bg: "Лява мишница" },
  RIGHT_FOREARM: { en: "Right forearm", bg: "Дясна предмишница" },
  LEFT_FOREARM: { en: "Left forearm", bg: "Лява предмишница" },
  RIGHT_THIGH: { en: "Right thigh", bg: "Дясно бедро" },
  LEFT_THIGH: { en: "Left thigh", bg: "Ляво бедро" },
  RIGHT_CALF: { en: "Right calf", bg: "Дясна подбедрица" },
  LEFT_CALF: { en: "Left calf", bg: "Лява подбедрица" },
}

export const isTourniquetSite = (value: unknown): value is TourniquetSite =>
  typeof value === "string" && (TOURNIQUET_SITES as readonly string[]).includes(value)

/** A site in the screen's language; anything else as it was written. */
export function tourniquetSiteLabel(site: string | null | undefined, locale: string): string {
  if (!site) return ""
  return isTourniquetSite(site) ? SITE_WORDS[site][locale === "bg" ? "bg" : "en"] : site
}

export const isLowerLimbSite = (site: string | null | undefined): boolean => site != null && /THIGH|CALF/.test(site)

export type BodyBand = "infant" | "child" | "adultMale" | "adultFemale"

/** Under a year an infant, under 13 a child, then an adult by recorded sex (a man when unknown). */
export function bodyBandFor(patient: { ageDays: number | null; sex?: string | null }): BodyBand {
  const years = patient.ageDays == null ? null : patient.ageDays / 365.2425
  if (years != null && years < 1) return "infant"
  if (years != null && years < 13) return "child"
  return patient.sex === "FEMALE" ? "adultFemale" : "adultMale"
}

type Proportions = {
  H: number; rx: number; neck: number; nk: number; sw: number; ww: number; hw: number; tl: number; al: number
  at: number; ft: number; aAng: number; ll: number; tt: number; ct: number; lEnd: number; adult?: boolean; female?: boolean
}

const PROPORTIONS: Record<BodyBand, Proportions> = {
  adultMale: { H: 60, rx: 0.37, neck: 13, nk: 10, sw: 47, ww: 30, hw: 37, tl: 168, al: 206, at: 11, ft: 10, aAng: 15, ll: 246, tt: 18.5, ct: 12, lEnd: 0.5, adult: true },
  adultFemale: { H: 58, rx: 0.36, neck: 13, nk: 8.5, sw: 41, ww: 24, hw: 41, tl: 166, al: 198, at: 9.5, ft: 8.5, aAng: 15, ll: 240, tt: 19, ct: 11.5, lEnd: 0.42, adult: true, female: true },
  child: { H: 60, rx: 0.42, neck: 8, nk: 10, sw: 37, ww: 28, hw: 31, tl: 122, al: 142, at: 9.5, ft: 8.5, aAng: 16, ll: 162, tt: 15.5, ct: 10.5, lEnd: 0.55 },
  infant: { H: 60, rx: 0.47, neck: 3, nk: 13, sw: 35, ww: 33, hw: 33, tl: 82, al: 84, at: 11, ft: 10, aAng: 24, ll: 88, tt: 16, ct: 12.5, lEnd: 0.62 },
}

type Pt = [number, number]
type Profile = [number, number, number][]

export type TourniquetSpot = {
  site: TourniquetSite
  /** Centre of the cuff on the drawing, in drawing px. */
  x: number
  y: number
  /** Cuff size across and along the limb, in drawing px. */
  w: number
  h: number
  /** Rotation in degrees, along the limb. */
  angle: number
  /** Which way the cuff's hose leaves: away from the midline. */
  outward: 1 | -1
}

export type TourniquetBody = {
  width: number
  height: number
  /** Filled outlines: legs, arms, torso, hair, head (back to front). */
  outlines: string[]
  /** Lighter surface lines: knees, elbows, navel, collarbones. */
  details: string[]
  spots: TourniquetSpot[]
}

const add = (a: Pt, b: Pt, k: number): Pt => [a[0] + b[0] * k, a[1] + b[1] * k]

function limbFrom(start: Pt, angle: number, len: number, prof: Profile) {
  const r = angle * Math.PI / 180
  const dir: Pt = [Math.sin(r), Math.cos(r)]
  const nOut: Pt = [dir[1], -dir[0]]
  const at = (f: number) => add(start, dir, len * f)
  const outer = prof.map(([f, o]) => add(at(f), nOut, o))
  const inner = prof.slice().reverse().map(([f, , i]) => add(at(f), nOut, -i))
  return { pts: outer.concat(inner), at, dir, prof, len }
}

function widthAt(prof: Profile, f: number): number {
  let k = 0
  while (k < prof.length - 2 && prof[k + 1]![0] < f) k++
  const [f0, o0, i0] = prof[k]!
  const [f1, o1, i1] = prof[k + 1]!
  const t = (f - f0) / (f1 - f0)
  return (o0 + (o1 - o0) * t) + (i0 + (i1 - i0) * t)
}

const fixed = (n: number) => n.toFixed(1)

/** The body and its cuff spots for a band, fitted to a drawing of this size. */
export function tourniquetBody(band: BodyBand, width = 358, height = 480): TourniquetBody {
  const P = PROPORTIONS[band]
  const ysh = P.H + P.neck
  const yCr = ysh + P.tl
  const { at: aT, ft, tt, ct } = P
  const arm = limbFrom([P.sw - aT * 0.55, ysh + aT * 0.7], P.aAng, P.al, [
    [0, aT * 1.1, aT * 0.9], [0.1, aT * 1.15, aT * 0.95], [0.28, aT * 0.98, aT * 0.88], [0.43, aT * 0.8, aT * 0.76],
    [0.52, ft * 1.0, ft * 0.9], [0.66, ft * 0.86, ft * 0.74], [0.8, ft * 0.55, ft * 0.5], [0.86, ft * 0.78, ft * 0.62],
    [0.94, ft * 0.7, ft * 0.55], [1.0, ft * 0.28, ft * 0.28]])
  const legStart: Pt = [P.hw * 0.5, yCr - P.tl * 0.12]
  const legEnd = P.hw * P.lEnd
  const legAngle = Math.atan2(legEnd - legStart[0], P.ll + P.tl * 0.12) * 180 / Math.PI
  const leg = limbFrom(legStart, legAngle, P.ll + P.tl * 0.12, [
    [0, tt * 1.05, tt * 0.92], [0.12, tt * 1.1, tt * 0.9], [0.3, tt * 0.96, tt * 0.8], [0.46, tt * 0.7, tt * 0.62],
    [0.53, tt * 0.68, tt * 0.6], [0.61, ct * 1.06, ct * 0.95], [0.76, ct * 0.8, ct * 0.7], [0.9, ct * 0.47, ct * 0.44],
    [0.95, ct * 0.6, ct * 0.5], [0.985, ct * 0.98, ct * 0.56], [1.0, ct * 0.9, ct * 0.5]])
  const torsoRight: Pt[] = [[P.nk, P.H * 0.86], [P.nk, ysh - 5], [P.sw * 0.62, ysh - 1], [P.sw, ysh + 7], [P.sw * 0.99, ysh + P.tl * 0.12],
    [P.sw * 0.86, ysh + P.tl * 0.22], [P.sw * 0.83, ysh + P.tl * 0.36], [P.ww, ysh + P.tl * 0.62], [P.hw * 0.96, ysh + P.tl * 0.8],
    [P.hw, ysh + P.tl * 0.9], [P.hw * 0.55, yCr - 2], [0, yCr + 3]]
  const torso = torsoRight.concat(torsoRight.slice(0, -1).reverse().map(([x, y]): Pt => [-x, y]))
  const hr = P.H / 2
  const hx = P.H * P.rx
  const hair: Pt[] | null = P.female
    ? Array.from({ length: 28 }, (_, i): Pt => { const a = Math.PI * (0.92 + i / 27 * 1.16); return [Math.cos(a) * hx * 1.16, hr + Math.sin(a) * hr * 1.08] })
      .concat([[hx * 1.22, hr * 1.55], [hx * 0.95, hr * 1.95], [hx * 0.62, hr * 1.7], [-hx * 0.62, hr * 1.7], [-hx * 0.95, hr * 1.95], [-hx * 1.22, hr * 1.55]])
    : null
  const head = Array.from({ length: 24 }, (_, i): Pt => {
    const a = i / 24 * Math.PI * 2
    const jaw = Math.sin(a) > 0 ? 1 - 0.12 * Math.sin(a) ** 3 : 1
    return [Math.cos(a) * hx * jaw, hr + Math.sin(a) * hr]
  })

  const total = yCr - P.tl * 0.12 + leg.len + 4
  const k = Math.min((height - 16) / total, 1.6)
  const ox = width / 2
  const oy = (height - total * k) / 2 + 4
  const S = ([x, y]: Pt): Pt => [ox + x * k, oy + y * k]
  const mirror = ([x, y]: Pt): Pt => [-x, y]
  const smooth = (pts: Pt[]) => {
    const p = pts.map(S)
    const n = p.length
    let d = `M${fixed(p[0]![0])},${fixed(p[0]![1])}`
    for (let i = 0; i < n; i++) {
      const p0 = p[(i - 1 + n) % n]!, p1 = p[i]!, p2 = p[(i + 1) % n]!, p3 = p[(i + 2) % n]!
      const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6]
      const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6]
      d += `C${fixed(c1[0]!)},${fixed(c1[1]!)} ${fixed(c2[0]!)},${fixed(c2[1]!)} ${fixed(p2[0])},${fixed(p2[1])}`
    }
    return d + "Z"
  }
  const curve = (a: Pt, c: Pt, b: Pt) => {
    const A = S(a), C = S(c), B = S(b)
    return `M${fixed(A[0])},${fixed(A[1])} Q${fixed(C[0])},${fixed(C[1])} ${fixed(B[0])},${fixed(B[1])}`
  }
  const both = (fn: (side: 1 | -1) => string) => [fn(1), fn(-1)]
  const fx = (side: number, p: Pt): Pt => [p[0] * side, p[1]]

  const outlines = [smooth(leg.pts), smooth(leg.pts.map(mirror)), smooth(arm.pts), smooth(arm.pts.map(mirror)), smooth(torso)]
  if (hair) outlines.push(smooth(hair))
  outlines.push(smooth(head))

  const details: string[] = []
  const knee = leg.at(0.5)
  const elbow = arm.at(0.45)
  details.push(...both(s => curve(fx(s, [knee[0] - tt * 0.35, knee[1] - 4]), fx(s, [knee[0], knee[1] + 6]), fx(s, [knee[0] + tt * 0.35, knee[1] - 4]))))
  const navel = S([0, ysh + P.tl * 0.64])
  const r = 1.4 * k + 0.6
  details.push(`M${fixed(navel[0] - r)},${fixed(navel[1])} a${fixed(r)},${fixed(r)} 0 1,0 ${fixed(r * 2)},0 a${fixed(r)},${fixed(r)} 0 1,0 ${fixed(-r * 2)},0`)
  details.push(...both(s => curve(fx(s, [P.hw * 0.92, ysh + P.tl * 0.84]), fx(s, [P.hw * 0.55, ysh + P.tl * 0.9]), fx(s, [P.hw * 0.22, yCr - 1]))))
  if (P.adult) {
    details.push(...both(s => curve(fx(s, [3, ysh + 4]), fx(s, [P.sw * 0.4, ysh - 1]), fx(s, [P.sw * 0.74, ysh + 3]))))
    if (P.female) details.push(...both(s => curve(fx(s, [P.sw * 0.12, ysh + P.tl * 0.27]), fx(s, [P.sw * 0.42, ysh + P.tl * 0.42]), fx(s, [P.sw * 0.8, ysh + P.tl * 0.24]))))
    else {
      details.push(...both(s => curve(fx(s, [2, ysh + P.tl * 0.3]), fx(s, [P.sw * 0.45, ysh + P.tl * 0.34]), fx(s, [P.sw * 0.78, ysh + P.tl * 0.22]))))
      const a = S([0, ysh + P.tl * 0.34]), b = S([0, ysh + P.tl * 0.56])
      details.push(`M${fixed(a[0])},${fixed(a[1])} L${fixed(b[0])},${fixed(b[1])}`)
    }
    details.push(...both(s => curve(fx(s, [P.nk * 0.9, P.H * 0.92]), fx(s, [P.nk * 1.4, ysh - 6]), fx(s, [P.nk * 2.1, ysh - 1]))))
  } else {
    const wrist = arm.at(0.8)
    details.push(...both(s => curve(fx(s, [wrist[0] - ft * 0.45, wrist[1]]), fx(s, [wrist[0], wrist[1] + 2]), fx(s, [wrist[0] + ft * 0.5, wrist[1]]))))
  }
  details.push(...both(s => curve(fx(s, [elbow[0] - aT * 0.2, elbow[1] - 2]), fx(s, [elbow[0] + aT * 0.1, elbow[1] + 3]), fx(s, [elbow[0] + aT * 0.45, elbow[1]]))))

  const places: [string, typeof arm, number, number][] = [
    ["UPPER_ARM", arm, 0.24, 0.13], ["FOREARM", arm, 0.6, 0.1], ["THIGH", leg, 0.24, 0.12], ["CALF", leg, 0.66, 0.09],
  ]
  const spots: TourniquetSpot[] = places.flatMap(([part, limb, f, along]) => ([-1, 1] as const).map(side => {
    const centre = limb.at(f)
    const [x, y] = S([side * centre[0], centre[1]])
    return {
      // The viewer's left (side -1) is the patient's right.
      site: `${side < 0 ? "RIGHT" : "LEFT"}_${part}` as TourniquetSite,
      x, y,
      w: (widthAt(limb.prof, f) + 7) * k,
      h: Math.max(limb.len * along, 12) * k,
      angle: (Math.atan2(limb.dir[0], limb.dir[1]) * 180 / Math.PI) * -side,
      outward: side,
    }
  }))
  return { width, height, outlines, details, spots }
}
