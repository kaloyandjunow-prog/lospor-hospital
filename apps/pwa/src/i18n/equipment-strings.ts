import type { EquipmentCategory } from "@lospor/core/equipment"

/**
 * Bulgarian rendering of the fixed equipment guidance.
 *
 * The guidance itself stays in `@lospor/core`, in English, versioned by
 * `EQUIPMENT_GUIDANCE_VERSION` and cited by `EQUIPMENT_GUIDANCE_SOURCE_REFS`.
 * Translating it there would put presentation inside the clinical layer and
 * give the canonical wording two homes; keying off the exact English string
 * keeps one source of truth and makes every rendered phrase auditable against
 * it.
 *
 * The risk of that choice is drift: reword a string in core and the Bulgarian
 * silently reverts to English. `equipment-strings.test.ts` closes it by running
 * `calcEquipment` across the full input space and asserting that every phrase it
 * can emit is either translated or deliberately unit-only. A wording change in
 * core fails that test rather than reaching a clinician.
 *
 * Numbers, sizes and units (`20.5 cm`, `12–14 Fr`, `Mac 3`, `1:2`, `5 cmH₂O`)
 * are intentionally absent — they read the same in both languages.
 */

export type EquipmentLanguage = "en" | "bg"

export const EQUIPMENT_CATEGORIES_BG: Record<string, string> = {
  "Airway": "Дихателен път",
  "Ventilation": "Вентилация",
  "Fluids": "Течности",
  "Catheters": "Катетри",
  "Monitoring": "Мониторинг",
  "Difficult Airway": "Труден дихателен път",
}

export const EQUIPMENT_LABELS_BG: Record<string, string> = {
  "BP cuff": "Маншет за АН",
  "Backup ETT": "Резервна ЕТТ",
  "Bougie / stylet": "Бужи / стилет",
  "Defibrillator": "Дефибрилатор",
  "Difficult airway trolley": "Количка за труден дихателен път",
  "ETT depth (lip)": "Дълбочина на ЕТТ (устна)",
  "ETT size": "Размер на ЕТТ",
  "Guedel OPA": "Орофарингеален въздуховод (Guedel)",
  "I:E ratio": "I:E съотношение",
  "LMA size": "Размер на ларингеална маска",
  "Laryngoscope": "Ларингоскоп",
  "Maintenance": "Поддържаща инфузия",
  "NGT": "Назогастрална сонда",
  "PEEP": "PEEP",
  "Rate": "Честота",
  "Suction catheter": "Аспирационен катетър",
  "Tidal volume": "Дихателен обем",
  "Urinary catheter": "Уринарен катетър",
  "Video laryngoscope": "Видеоларингоскоп",
}

export const EQUIPMENT_VALUES_BG: Record<string, string> = {
  "Adult (12–15 cm)": "Възрастен (12–15 cm)",
  "Adult pads": "Електроди за възрастни",
  "Age required": "Необходима е възраст",
  "Age required; choose exact blade manually": "Необходима е възраст; изберете точния клинок ръчно",
  "Calculate manually from actual ETT ID": "Изчислете ръчно от реалния вътрешен диаметър на ЕТТ",
  "Confirm location": "Потвърдете позицията",
  "Have available": "Да е на разположение",
  "IBW unavailable": "Идеалното телесно тегло не е налично",
  "Large adult (15–20 cm)": "Голям възрастен (15–20 cm)",
  "Large adult / Thigh cuff": "Голям възрастен / маншет за бедро",
  "Manual selection": "Ръчен избор",
  "Measure manually": "Измерете ръчно",
  "Measure mid-upper-arm circumference": "Измерете обиколката на средата на мишницата",
  "Pediatric AED mode if available; adult pads anteroposterior":
    "Педиатричен AED режим, ако е наличен; електроди за възрастни антеропостериорно",
  "Prepare 0.5 mm smaller than the clinically planned ETT":
    "Подгответе 0.5 mm по-малка от клинично планираната ЕТТ",
  "Prepare a curved blade; choose exact size manually":
    "Подгответе извит клинок; изберете точния размер ръчно",
  "Prepare a straight blade; choose exact size manually":
    "Подгответе прав клинок; изберете точния размер ръчно",
  "Select and measure manually": "Изберете и измерете ръчно",
  "Select manually": "Изберете ръчно",
  "Standard adult AED mode; anterolateral or anteroposterior pads":
    "Стандартен AED режим за възрастни; антеролатерални или антеропостериорни електроди",
  "Verify AED mode and pad placement": "Проверете AED режима и позицията на електродите",
  "Weight required": "Необходимо е тегло",
}

export const EQUIPMENT_NOTES_BG: Record<string, string> = {
  "4-2-1 rule": "Правило 4-2-1",
  "6–8 mL/kg IBW": "6–8 mL/kg идеално телесно тегло",
  "6–8 mL/kg McLaren IBW": "6–8 mL/kg идеално телесно тегло по McLaren",
  "Anatomy, operator and available direct/video system override":
    "Анатомията, операторът и наличната директна/видео система имат предимство",
  "Avoid pad contact and breast tissue; verify device IFU; no energy shown here":
    "Избягвайте контакт между електродите и гръдната жлеза; проверете инструкцията на апарата; тук не се посочва енергия",
  "Base selection on anatomy, indication and local product range":
    "Изберете според анатомията, показанието и наличната продуктова гама",
  "Catheter occlusion should remain below the applicable fraction of the ETT lumen":
    "Оклузията от катетъра трябва да остане под допустимата част от лумена на ЕТТ",
  "Confirm size and insertion depth clinically":
    "Потвърдете размера и дълбочината на въвеждане клинично",
  "Enter age; confirm depth clinically": "Въведете възраст; потвърдете дълбочината клинично",
  "Enter age; under 2 years remains manual and requires the planned ID ±0.5 mm":
    "Въведете възраст; под 2 години изборът остава ръчен и изисква планирания вътрешен диаметър ±0.5 mm",
  "Enter pediatric age, sex and height for McLaren IBW":
    "Въведете педиатрична възраст, пол и ръст за идеално телесно тегло по McLaren",
  "Enter weight to distinguish pediatric and standard AED mode; energy is shown only in the resuscitation calculator":
    "Въведете тегло, за да се разграничи педиатричен от стандартен AED режим; енергията се показва само в реанимационния калкулатор",
  "Manufacturer weight-band starting point; verify the actual product and current IFU":
    "Отправна точка по тегловен диапазон на производителя; проверете конкретния продукт и актуалната инструкция",
  "Measure from the centre of the incisors to the angle of the mandible; verify product markings":
    "Измерете от средата на резците до ъгъла на долната челюст; проверете маркировките на продукта",
  "Oral starting estimate (age/2 + 12); confirm clinically":
    "Начална орална оценка (възраст/2 + 12); потвърдете клинично",
  "Pediatric pads may be anterolateral only if they do not touch; verify device IFU; no energy shown here":
    "Педиатрични електроди могат да се поставят антеролатерално само ако не се допират; проверете инструкцията на апарата; тук не се посочва енергия",
  "Select the smallest compatible cuff whose printed range includes the measurement":
    "Изберете най-малкия съвместим маншет, чийто отпечатан диапазон включва измерената стойност",
  "Starting estimate; prepare planned ID ±0.5 mm and confirm patient/product factors":
    "Начална оценка; подгответе планирания вътрешен диаметър ±0.5 mm и потвърдете факторите от пациента и продукта",
  "Starting suggestion; adjust clinically": "Начално предложение; коригирайте клинично",
  "Under 2 years: prepare the clinically planned ID ±0.5 mm":
    "Под 2 години: подгответе клинично планирания вътрешен диаметър ±0.5 mm",
  "Under 2 years: select and confirm depth clinically":
    "Под 2 години: изберете и потвърдете дълбочината клинично",
  "Use the selected manufacturer's weight bands and verify the current product IFU":
    "Използвайте тегловите диапазони на избрания производител и проверете актуалната инструкция на продукта",
  "cuffed": "с маншет",
  "from today's airway exam": "от днешния преглед на дихателния път",
}

/**
 * Phrases core builds around a computed number. Matched after the exact tables,
 * so a literal entry always wins.
 */
const EQUIPMENT_PATTERNS_BG: { match: RegExp; replace: string }[] = [
  { match: /^Size (.+)$/u, replace: "Размер $1" },
  { match: /^(.+) cuffed \/ (.+) uncuffed$/u, replace: "$1 с маншет / $2 без маншет" },
  { match: /^(.+) cuffed \(0\.5 mm smaller\)$/u, replace: "$1 с маншет (0.5 mm по-малка)" },
  { match: /^(.+) \(0\.5 smaller\)$/u, replace: "$1 (0.5 по-малка)" },
  { match: /^~(.+) cm insertion depth$/u, replace: "~$1 cm дълбочина на въвеждане" },
]

/** True when a phrase carries no words to translate — a size, a range, a unit. */
export function isUnitOnlyPhrase(text: string): boolean {
  return /^[0-9\s.,:–\-/~+±()]*(mL|mL\/hr|mL\/kg|cm|mm|Fr|kg|cmH₂O|\/min|Mac\s*\d|L)?[0-9\s.,:–\-/~+±()]*$/u.test(text)
    || /^Mac \d$/u.test(text)
}

function translatePhrase(text: string, table: Record<string, string>): string {
  const exact = table[text]
  if (exact !== undefined) return exact
  for (const pattern of EQUIPMENT_PATTERNS_BG) {
    if (pattern.match.test(text)) return text.replace(pattern.match, pattern.replace)
  }
  // Numbers, units and anything core adds later fall through unchanged rather
  // than being dropped or guessed at.
  return text
}

export function translateEquipment(
  categories: EquipmentCategory[],
  language: EquipmentLanguage,
): EquipmentCategory[] {
  if (language !== "bg") return categories
  return categories.map(category => ({
    ...category,
    cat: EQUIPMENT_CATEGORIES_BG[category.cat] ?? category.cat,
    items: category.items.map(item => ({
      ...item,
      label: translatePhrase(item.label, EQUIPMENT_LABELS_BG),
      value: translatePhrase(item.value, EQUIPMENT_VALUES_BG),
      note: item.note === undefined ? undefined : translatePhrase(item.note, EQUIPMENT_NOTES_BG),
    })),
  }))
}
