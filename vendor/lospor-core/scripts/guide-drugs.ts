import { DRUG_CATALOG } from "../src/catalog/intraop-drugs"
import { INFUSION_CATALOG } from "../src/catalog/intraop-infusions"
import { FLUID_CATALOG } from "../src/catalog/intraop-fluids"
import { AGENT_CATALOG } from "../src/catalog/inhalational-agents"
import { PREMED_DOSES } from "../src/catalog/premed-drugs"
import { parseDoseProfile, type DoseCalc, type DoseProfile, type RouteMode } from "../src/catalog/dose-profile"
import { createPediatricDrugProfileV4Payloads } from "../src/pediatric-drug-profiles-v4"
import { createPediatricInfusionProfileSeeds } from "../src/pediatric-infusion-profiles"
import { clinicalDisplayLabel } from "../src/display"
import { groupBy, numFor, t, table, type Lang, type Page } from "./guide-lib"

/** The dose rule as a sentence: "2 mg/kg IBW, at most 200 mg". */
function calcText(lang: Lang, calc: DoseCalc | undefined, unit: string): string {
  if (!calc) return ""
  const basis = calc.basis ? ` ${calc.basis}` : ""
  const parts: string[] = []
  if (calc.perKg != null) parts.push(`${numFor(lang, calc.perKg)} ${unit}/kg${basis}`)
  if (calc.perM2 != null) parts.push(`${numFor(lang, calc.perM2)} ${unit}/m²`)
  if (calc.flat != null) {
    parts.push(calc.flatFromKg != null
      ? t(lang, `${numFor(lang, calc.flat)} ${unit} from ${calc.flatFromKg} kg`, `${numFor(lang, calc.flat)} ${unit} от ${calc.flatFromKg} kg`)
      : `${numFor(lang, calc.flat)} ${unit}`)
  }
  if (calc.cap != null) parts.push(t(lang, `at most ${numFor(lang, calc.cap)} ${unit}`, `най-много ${numFor(lang, calc.cap)} ${unit}`))
  return parts.join(", ")
}

type Surface = { route: string; unit: string; min?: number; max?: number; step?: number; quick: number[]; suggested: string }

type Unitful = { unit?: string; doseCalc?: DoseCalc; suggestedVolume?: number; suggestedRate?: number }

function suggestedOf(lang: Lang, source: Unitful, unit: string): string {
  const calc = calcText(lang, source.doseCalc, unit)
  if (calc) return calc
  if (source.suggestedVolume != null) return `${numFor(lang, source.suggestedVolume)} mL`
  if (source.suggestedRate != null) return `${numFor(lang, source.suggestedRate)} ${unit}`
  return ""
}

/** One line per route when the routes differ, otherwise one line. */
function surfaces(lang: Lang, profile: DoseProfile): Surface[] {
  const modes = Object.entries(profile.routeModes ?? {})
  if (modes.length > 0) {
    return modes.map(([route, mode]: [string, RouteMode]) => {
      const unit = mode.unit ?? profile.unit ?? ""
      return { route, unit, min: mode.min, max: mode.max, step: mode.step, quick: mode.quickValues, suggested: suggestedOf(lang, mode, unit) }
    })
  }
  const unit = profile.unit ?? ""
  return [{ route: profile.routes.join(", "), unit, min: profile.min, max: profile.max, step: profile.step, quick: profile.quickValues, suggested: suggestedOf(lang, profile, unit) }]
}

const range = (lang: Lang, s: Surface) => (s.min != null && s.max != null ? `${numFor(lang, s.min)}–${numFor(lang, s.max)} ${s.unit}` : s.unit)
const quickText = (lang: Lang, values: number[]) => values.map(value => numFor(lang, value)).join(" · ")
const drugName = (lang: Lang, name: string) => (lang === "bg" ? clinicalDisplayLabel("medication", name, "bg") : name)
const groupName = (lang: Lang, group: string) => (lang === "bg" ? clinicalDisplayLabel("optionGroup", group, "bg") : group)

function ageBand(lang: Lang, from: number, to: number | null | undefined): string {
  const unit = (days: number) => {
    if (days < 28) return t(lang, `${Math.round(days)} d`, `${Math.round(days)} д`)
    if (days < 365) return t(lang, `${Math.round(days / 30.4)} mo`, `${Math.round(days / 30.4)} мес`)
    return t(lang, `${Math.round(days / 365.25)} y`, `${Math.round(days / 365.25)} г`)
  }
  if (to == null || to > 6500) return from <= 0 ? t(lang, "All ages", "Всички възрасти") : t(lang, `from ${unit(from)}`, `от ${unit(from)}`)
  return from <= 0 ? t(lang, `under ${unit(to)}`, `под ${unit(to)}`) : `${unit(from)}–${unit(to)}`
}

export function drugsPage(): Page {
  const adultBolus = DRUG_CATALOG.map(entry => ({ entry, profile: parseDoseProfile(entry.name, "bolus", entry.profile) }))
  const adultInfusions = INFUSION_CATALOG.map(entry => ({ entry, profile: parseDoseProfile(entry.name, "infusion", entry.profile) }))
  const adultFluids = FLUID_CATALOG.filter(entry => !entry.retired).map(entry => ({ entry, profile: parseDoseProfile(entry.name, "fluid", entry.profile) }))
  const paediatric = createPediatricDrugProfileV4Payloads()
  const paedInfusions = createPediatricInfusionProfileSeeds().map(seed => seed.payload)

  const body = (lang: Lang) => {
    const head = [t(lang, "Drug", "Лекарство"), t(lang, "Route", "Път"), t(lang, "Range", "Диапазон"), t(lang, "Step", "Стъпка"), t(lang, "Quick values", "Бързи стойности"), t(lang, "Suggested", "Предложена доза")]
    const surfaceRows = (name: string, profile: DoseProfile) =>
      surfaces(lang, profile).map(s => [`**${drugName(lang, name)}**`, s.route, range(lang, s), s.step != null ? numFor(lang, s.step) : "", quickText(lang, s.quick), s.suggested])
    const parts = [
      t(lang,
        `# Drugs, infusions and fluids

Every drug, infusion, fluid and agent the chart offers, with the range of its slider, its step, its quick buttons and the dose it opens on. These are the values in the app, for adults and for children. A dose is only ever a starting point: you can slide, tap or type over it.

For adults the suggested dose is worked out from the patient's weight where the drug has a rule (for example 2 mg/kg on ideal body weight, rounded to a step, with a cap); a drug with no rule opens empty. Children have their own rules by age band, with the same shape: a dose per kilogram or per m², a rounding step and a ceiling, and some drugs are left to manual entry on purpose.`,
        `# Лекарства, инфузии и течности

Всяко лекарство, инфузия, течност и агент, които картата предлага, с диапазона на плъзгача, стъпката, бързите бутони и дозата, с която се отваря. Това са стойностите в приложението, за възрастни и за деца. Дозата е само начало: можете да я плъзнете, докоснете или напишете върху нея.

При възрастни предложената доза се изчислява от теглото на пациента, когато лекарството има правило (например 2 mg/kg върху идеалното телесно тегло, закръглено до стъпка, с таван); лекарство без правило се отваря празно. Децата имат свои правила по възрастови групи със същата форма: доза на килограм или на m², стъпка на закръгляване и таван, а някои лекарства са оставени за ръчно въвеждане нарочно.`),
      t(lang, "## Adults", "## Възрастни"),
      t(lang, `### Drugs by bolus (${adultBolus.length})`, `### Лекарства на болус (${adultBolus.length})`),
    ]
    for (const [group, items] of groupBy(adultBolus, item => item.entry.category)) {
      parts.push(`#### ${groupName(lang, group)}`)
      parts.push(table(head, items.flatMap(item => surfaceRows(item.entry.name, item.profile))))
    }
    parts.push(t(lang, `### Infusions (${adultInfusions.length})`, `### Инфузии (${adultInfusions.length})`))
    parts.push(table(head, adultInfusions.flatMap(item => surfaceRows(item.entry.name, item.profile))))
    parts.push(t(lang, `### Fluids and blood products (${adultFluids.length})`, `### Течности и кръвни продукти (${adultFluids.length})`))
    parts.push(table(head, adultFluids.flatMap(item => surfaceRows(item.entry.name, item.profile))))
    parts.push(t(lang, `### Inhalational agents (${AGENT_CATALOG.length})`, `### Инхалационни агенти (${AGENT_CATALOG.length})`))
    parts.push(table([t(lang, "Agent", "Агент"), t(lang, "Range", "Диапазон"), t(lang, "Step", "Стъпка"), t(lang, "Quick values", "Бързи стойности")],
      AGENT_CATALOG.map(agent => {
        const profile = parseDoseProfile(agent.value, "agent", agent.profile)
        return [`**${agent.label}**`, `${numFor(lang, profile.min ?? 0)}–${numFor(lang, profile.max ?? 0)} ${profile.unit ?? "%"}`, numFor(lang, profile.step ?? 0), quickText(lang, profile.quickValues)]
      })))
    const premeds = Object.entries(PREMED_DOSES)
    parts.push(t(lang, `### Premedication (${premeds.length})`, `### Премедикация (${premeds.length})`))
    parts.push(table([t(lang, "Drug", "Лекарство"), t(lang, "Route", "Път"), t(lang, "Suggested", "Предложена доза"), t(lang, "Range", "Диапазон"), t(lang, "Step", "Стъпка")],
      premeds.flatMap(([name, config]) => Object.entries(config.routeDoses).map(([route, rule]) => {
        const unit = `${rule.unit}${rule.perKg ? "/kg" : ""}`
        return [`**${drugName(lang, name)}**`, route, rule.dose == null ? t(lang, "as prescribed", "по предписание") : `${numFor(lang, rule.dose)} ${unit}`,
          `${numFor(lang, rule.min)}–${numFor(lang, rule.max)} ${unit}`, numFor(lang, rule.step)]
      }))))

    parts.push(t(lang, "## Children", "## Деца"))
    parts.push(t(lang,
      "Children are dosed by their own rules, in age bands. A drug marked *manual entry* opens empty on purpose: it has no safe routine dose to suggest.",
      "Децата се дозират по свои правила, по възрастови групи. Лекарство, отбелязано с *ръчно въвеждане*, се отваря празно нарочно: то няма безопасна рутинна доза, която да се предложи."))
    const drugCount = new Set(paediatric.map(item => item.medicationKey)).size
    parts.push(t(lang, `### Drugs by bolus (${drugCount})`, `### Лекарства на болус (${drugCount})`))
    const paedHead = [t(lang, "Drug", "Лекарство"), t(lang, "Age", "Възраст"), t(lang, "Route", "Път"), t(lang, "Range", "Диапазон"), t(lang, "Step", "Стъпка"), t(lang, "Quick values", "Бързи стойности"), t(lang, "Suggested", "Предложена доза")]
    for (const [group, items] of groupBy(paediatric, item => item.category ?? "")) {
      parts.push(`#### ${groupName(lang, group)}`)
      parts.push(table(paedHead, items.flatMap(item => {
        const name = `**${drugName(lang, item.medicationKey)}**`
        const age = ageBand(lang, item.minimumAgeDays ?? 0, item.maximumAgeDaysExclusive)
        if (!item.profile || item.availability !== "AUTO") return [[name, age, "", "", "", "", t(lang, "*manual entry*", "*ръчно въвеждане*")]]
        return surfaces(lang, item.profile as DoseProfile).map(s => [name, age, s.route, range(lang, s), s.step != null ? numFor(lang, s.step) : "", quickText(lang, s.quick), s.suggested])
      })))
    }
    const infusionCount = new Set(paedInfusions.map(item => item.itemKey)).size
    parts.push(t(lang, `### Infusions (${infusionCount})`, `### Инфузии (${infusionCount})`))
    parts.push(table([t(lang, "Infusion", "Инфузия"), t(lang, "Age", "Възраст"), t(lang, "Offered as", "Предлага се като"), t(lang, "Range", "Диапазон"), t(lang, "Step", "Стъпка"), t(lang, "Suggested", "Предложена доза")],
      paedInfusions.map(item => {
        const name = `**${drugName(lang, item.itemKey)}**`
        const age = ageBand(lang, item.minimumAgeDays ?? 0, item.maximumAgeDaysExclusive)
        const profile = item.profile as DoseProfile | null
        if (!profile || item.disposition === "HIDDEN") return [name, age, t(lang, "not offered", "не се предлага"), "", "", ""]
        const unit = item.manualUnit ?? profile.unit ?? ""
        return [name, age, item.manualEntryOnly ? t(lang, "manual entry", "ръчно въвеждане") : t(lang, "suggested", "предложена"),
          profile.min != null && profile.max != null ? `${numFor(lang, profile.min)}–${numFor(lang, profile.max)} ${unit}` : unit,
          profile.step != null ? numFor(lang, profile.step) : "",
          profile.suggestedRate != null ? `${numFor(lang, profile.suggestedRate)} ${unit}` : calcText(lang, profile.doseCalc, unit)]
      })))
    return parts.join("\n\n") + "\n"
  }
  return { name: "drugs", position: 3, title: { en: "Drugs, infusions and fluids", bg: "Лекарства, инфузии и течности" }, body: { en: body("en"), bg: body("bg") } }
}
