// The preoperative summary and the written consent for anaesthesia.
//
// Both are optional and off unless a hospital switches them on (Status, on
// the appliance). The consent is printed and signed on paper: Закон за
// здравето чл. 89 asks for written consent for general anaesthesia, and a
// printed sheet the patient or parent signs by hand meets that. Nothing here
// stores a patient's name -- the sheet prints blank lines for it, like the
// anaesthesia record.
//
// The text is a hospital's own, edited in Status. Two Bulgarian texts are
// bundled as the starting point: one for children under 14 (the parent
// signs) and one for adults that also serves patients of 14 to 18 (the
// patient and a parent sign, чл. 87).

import type { PreopFormSection } from "./preop-assessment"

/** Which bundled text a patient gets: by age, not by the case's clinical mode. */
export type ConsentPopulation = "ADULT" | "PEDIATRIC"

export const CONSENT_POPULATIONS: readonly ConsentPopulation[] = ["ADULT", "PEDIATRIC"]

/** Under 14 the parent consents for the child (чл. 87, ал. 1). */
export const CONSENT_PARENT_ONLY_BELOW_YEARS = 14
/** From 14 to 18 the minor and a parent both sign (чл. 87, ал. 2). */
export const CONSENT_ADULT_FROM_YEARS = 18

export type ConsentSignerRole = "PATIENT" | "PARENT" | "ANAESTHETIST"

/**
 * The text for a patient of this age: the children's text below 14, the
 * adult text from 14. An unknown age gets the adult text, which carries a
 * parent line for anyone under 18 anyway.
 */
export function consentPopulationForAge(ageYears: number | null | undefined): ConsentPopulation {
  return ageYears != null && Number.isFinite(ageYears) && ageYears < CONSENT_PARENT_ONLY_BELOW_YEARS ? "PEDIATRIC" : "ADULT"
}

/**
 * Who signs, in print order. The anaesthetist always signs: the paper form
 * had no line for them, and чл. 88 makes the doctor the one who informs.
 * An unknown age on the adult text keeps the parent line, marked "under 18".
 */
export function consentSigners(ageYears: number | null | undefined): ConsentSignerRole[] {
  const known = ageYears != null && Number.isFinite(ageYears)
  if (known && ageYears < CONSENT_PARENT_ONLY_BELOW_YEARS) return ["PARENT", "ANAESTHETIST"]
  if (known && ageYears >= CONSENT_ADULT_FROM_YEARS) return ["PATIENT", "ANAESTHETIST"]
  return ["PATIENT", "PARENT", "ANAESTHETIST"]
}

export const CONSENT_SIGNER_LABELS: Record<"en" | "bg", Record<ConsentSignerRole, string>> = {
  en: { PATIENT: "Patient", PARENT: "Parent or guardian", ANAESTHETIST: "Anaesthetist" },
  bg: { PATIENT: "Пациент", PARENT: "Родител, настойник, попечител", ANAESTHETIST: "Лекар анестезиолог" },
}

// ── The text format ───────────────────────────────────────────────────────
//
// Plain text a hospital can edit in a text box, with three marks:
//   "## Heading"       a heading of its own line
//   "- item"           a list item
//   "**words**"        bold, inside a line
// Paragraphs are separated by a blank line. "{{procedure}}" and the other
// fields below are filled in from the case when the sheet prints.
//
// A heading may end in a technique tag, "## Обща анестезия [general]". The
// tag never prints; it tells layout C which section describes which
// technique, and layout D which rows make its table.

export const CONSENT_FIELDS = ["hospital", "diagnosis", "procedure", "date", "anaesthetist"] as const
export type ConsentField = typeof CONSENT_FIELDS[number]
export type ConsentFieldValues = Partial<Record<ConsentField, string | null>>

/** The longest text Status accepts: the bundled ones are about a third of it. */
export const CONSENT_TEXT_MAX_LENGTH = 40_000
export const CONSENT_TITLE_MAX_LENGTH = 200

/** The techniques a heading can be tagged with, in the order the bundled texts describe them. */
export const CONSENT_TECHNIQUES = ["general", "neuraxial", "block", "sedation", "combined", "cvc", "arterial", "ventilation"] as const
export type ConsentTechnique = typeof CONSENT_TECHNIQUES[number]

export const CONSENT_TECHNIQUE_LABELS: Record<"en" | "bg", Record<ConsentTechnique, string>> = {
  en: {
    general: "General anaesthesia",
    neuraxial: "Spinal, epidural or caudal anaesthesia",
    block: "Peripheral nerve block",
    sedation: "Sedation / premedication",
    combined: "Combined anaesthesia",
    cvc: "Central venous line",
    arterial: "Arterial line",
    ventilation: "Ventilation after the operation",
  },
  bg: {
    general: "Обща анестезия",
    neuraxial: "Спинална, епидурална, каудална анестезия",
    block: "Периферен нервен блок",
    sedation: "Седация / премедикация",
    combined: "Комбинирана анестезия",
    cvc: "Канюлиране на централна вена",
    arterial: "Канюлиране на артерия",
    ventilation: "Изкуствена белодробна вентилация след операцията",
  },
}

/** Layout C always describes general anaesthesia: it is the fallback when a block fails. */
export const CONSENT_FALLBACK_TECHNIQUE: ConsentTechnique = "general"

export function isConsentTechnique(value: unknown): value is ConsentTechnique {
  return typeof value === "string" && (CONSENT_TECHNIQUES as readonly string[]).includes(value)
}

const TECHNIQUE_TAG = /\s*\[([^\]\s]*)\]\s*$/

/** A heading's words and its technique tag, if it has one. */
function splitHeading(line: string): { text: string; tag: string | null } {
  const match = line.match(TECHNIQUE_TAG)
  return match ? { text: line.slice(0, match.index).trim(), tag: match[1]! } : { text: line, tag: null }
}

/** Technique tags in the text that LOSPOR does not know. */
export function unknownConsentTechniques(body: string): string[] {
  const unknown = new Set<string>()
  for (const raw of canonicalConsentText(body).split("\n")) {
    const line = raw.trim()
    if (!line.startsWith("## ")) continue
    const { tag } = splitHeading(line.slice(3).trim())
    if (tag != null && !isConsentTechnique(tag)) unknown.add(tag)
  }
  return [...unknown]
}

export type ConsentInline = { text: string; bold: boolean }
export type ConsentBlock =
  | { kind: "heading"; text: ConsentInline[]; technique?: ConsentTechnique }
  | { kind: "paragraph"; text: ConsentInline[] }
  | { kind: "list"; items: ConsentInline[][] }

/** Line endings and trailing spaces normalised: the form the fingerprint is taken of. */
export function canonicalConsentText(body: string): string {
  return body
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map(line => line.replace(/\s+$/, ""))
    .join("\n")
    .replace(/^\n+|\n+$/g, "")
}

/** Fields named in the text that LOSPOR does not know: "{{surgeon}}" would print as typed. */
export function unknownConsentFields(body: string): string[] {
  const known = new Set<string>(CONSENT_FIELDS)
  const unknown = new Set<string>()
  for (const match of body.matchAll(/\{\{\s*([^}]*?)\s*\}\}/g)) {
    if (!known.has(match[1]!)) unknown.add(match[1]!)
  }
  return [...unknown]
}

export type ConsentTextProblem = "EMPTY" | "TOO_LONG" | "TITLE_EMPTY" | "TITLE_TOO_LONG" | "UNKNOWN_FIELD" | "UNKNOWN_TECHNIQUE"

/** What Status refuses to save. */
export function consentTextProblems(input: { title: string; body: string }): ConsentTextProblem[] {
  const problems: ConsentTextProblem[] = []
  const title = input.title.trim()
  const body = canonicalConsentText(input.body)
  if (!title) problems.push("TITLE_EMPTY")
  if (title.length > CONSENT_TITLE_MAX_LENGTH) problems.push("TITLE_TOO_LONG")
  if (!body.trim()) problems.push("EMPTY")
  if (body.length > CONSENT_TEXT_MAX_LENGTH) problems.push("TOO_LONG")
  if (unknownConsentFields(body).length > 0) problems.push("UNKNOWN_FIELD")
  if (unknownConsentTechniques(body).length > 0) problems.push("UNKNOWN_TECHNIQUE")
  return problems
}

/** What an empty field prints: a line to write on. */
export const CONSENT_BLANK = "…".repeat(12)

/** The fields filled in; a field the case has no value for prints as a line for the pen. */
export function fillConsentFields(text: string, values: ConsentFieldValues): string {
  return text.replace(/\{\{\s*([a-z]+)\s*\}\}/g, (whole, name: string) => {
    if (!(CONSENT_FIELDS as readonly string[]).includes(name)) return whole
    const value = values[name as ConsentField]?.trim()
    return value ? value : CONSENT_BLANK
  })
}

function inline(line: string): ConsentInline[] {
  const parts: ConsentInline[] = []
  const pattern = /\*\*(.+?)\*\*/g
  let last = 0
  for (const match of line.matchAll(pattern)) {
    if (match.index! > last) parts.push({ text: line.slice(last, match.index), bold: false })
    parts.push({ text: match[1]!, bold: true })
    last = match.index! + match[0].length
  }
  if (last < line.length) parts.push({ text: line.slice(last), bold: false })
  return parts.length > 0 ? parts : [{ text: "", bold: false }]
}

/** The text as blocks to draw; the fields are filled in first. */
export function parseConsentText(body: string, values: ConsentFieldValues = {}): ConsentBlock[] {
  const blocks: ConsentBlock[] = []
  let paragraph: string[] = []
  let list: ConsentInline[][] | null = null
  const flush = () => {
    if (paragraph.length > 0) blocks.push({ kind: "paragraph", text: inline(paragraph.join(" ")) })
    paragraph = []
    if (list) blocks.push({ kind: "list", items: list })
    list = null
  }
  for (const raw of fillConsentFields(canonicalConsentText(body), values).split("\n")) {
    const line = raw.trim()
    if (!line) { flush(); continue }
    if (line.startsWith("## ")) {
      flush()
      const { text, tag } = splitHeading(line.slice(3).trim())
      blocks.push(isConsentTechnique(tag) ? { kind: "heading", text: inline(text), technique: tag } : { kind: "heading", text: inline(text) })
      continue
    }
    if (line.startsWith("- ")) {
      if (paragraph.length > 0) { blocks.push({ kind: "paragraph", text: inline(paragraph.join(" ")) }); paragraph = [] }
      list ??= []
      list.push(inline(line.slice(2).trim()))
      continue
    }
    if (list) { blocks.push({ kind: "list", items: list }); list = null }
    paragraph.push(line)
  }
  flush()
  return blocks
}

export type ConsentSection = {
  heading: ConsentInline[]
  /** Null for a section that is not a technique (fasting, the declaration). */
  technique: ConsentTechnique | null
  blocks: ConsentBlock[]
}

/**
 * The text cut at its headings: what comes before the first heading (the
 * introduction), then one section per heading. Layouts C and D print the
 * technique sections their own way; every other section prints as written.
 */
export function consentSections(body: string, values: ConsentFieldValues = {}): { intro: ConsentBlock[]; sections: ConsentSection[] } {
  const intro: ConsentBlock[] = []
  const sections: ConsentSection[] = []
  for (const block of parseConsentText(body, values)) {
    if (block.kind === "heading") sections.push({ heading: block.text, technique: block.technique ?? null, blocks: [] })
    else if (sections.length > 0) sections[sections.length - 1]!.blocks.push(block)
    else intro.push(block)
  }
  return { intro, sections }
}

/**
 * The columns of layout D's table: the bold lead-ins the technique sections
 * share ("Какво правим.", "Какво да очаквате.", "Възможни усложнения."), in
 * the order they first appear, at most three. A paragraph whose lead-in is a
 * column goes in it without the lead-in; a section with none spans the row.
 */
export function consentTableColumns(sections: readonly ConsentSection[]): string[] {
  const columns: string[] = []
  for (const section of sections) {
    if (!section.technique) continue
    for (const block of section.blocks) {
      const lead = block.kind === "paragraph" && block.text[0]?.bold ? block.text[0].text.trim() : null
      if (lead && !columns.includes(lead) && columns.length < 3) columns.push(lead)
    }
  }
  return columns
}

/** One technique section as layout D's table row: a cell per column, or the whole text when it has no lead-ins. */
export function consentTableRow(section: ConsentSection, columns: readonly string[]): { cells: ConsentBlock[][] } | { span: ConsentBlock[] } {
  const cells: ConsentBlock[][] = columns.map(() => [])
  let placed = false
  const rest: ConsentBlock[] = []
  for (const block of section.blocks) {
    const lead = block.kind === "paragraph" && block.text[0]?.bold ? block.text[0].text.trim() : null
    const column = lead ? columns.indexOf(lead) : -1
    if (block.kind === "paragraph" && column >= 0) {
      const text = block.text.slice(1)
      if (text[0]) text[0] = { ...text[0], text: text[0].text.replace(/^\s+/, "") }
      cells[column]!.push({ kind: "paragraph", text })
      placed = true
    } else {
      rest.push(block)
    }
  }
  if (!placed) return { span: section.blocks }
  // A paragraph without a lead-in stays with the row, after its last cell.
  if (rest.length > 0) cells[cells.length - 1]!.push(...rest)
  return { cells }
}

// ── The bundled texts ─────────────────────────────────────────────────────
//
// From the paediatric hospital's Document №2 (typos corrected). The adult
// text is the same content worded for the patient. The closing declaration
// is new: the paper form ended without one.

export type ConsentTemplate = { title: string; body: string }

const TECHNIQUES_LEGEND = "Чести — по-често от 1 на 100; редки — по-рядко от 1 на 100. Всяка анестезия, макар и рядко, носи риск от усложнения, някои от които тежки, например алергични реакции /анафилактичен шок/."

const PEDIATRIC_BODY = `**Уважаеми родители, настойници и попечители,**

Предстоящата анестезия има за цел да осигури обезболяване, безопасност и подходящи условия за извършване на оперативната или диагностичната процедура на Вашето дете. Видът на анестезията се определя от лекар анестезиолог според възрастта, теглото, общото състояние на детето, придружаващите заболявания, вида на процедурата, очаквания риск и медицинската необходимост.

Преди започване на анестезията детето може да бъде помолено да съблече част от дрехите си, за да се осигури достъп до оперативното поле и възможност за поставяне на мониторинг. При малки деца, тревожност или затруднено съдействие медицинският персонал ще помогне. След подготовката детето ще бъде покрито с операционна престилка или чаршаф.

За провеждане на анестезията обичайно се поставя периферен венозен път — тънка пластмасова канюла във вена на ръката или друго подходящо място. През него се прилагат медикаменти и инфузионни разтвори. Убождането може да бъде неприятно. Възможни, но обикновено леки усложнения са болка, посиняване, кървене, възпаление или запушване на вената. Изключително рядко може да се засегне нерв или артерия. При малки или силно тревожни деца венозният път може да бъде поставен след началото на анестезията, ако анестезиологът прецени, че това е по-подходящо и безопасно.

Преди и по време на анестезията детето се свързва с монитор. Обичайно се поставят електроди за сърдечна дейност, маншет за кръвно налягане и сензор на пръст, ръка или крак за измерване на кислорода в кръвта. При нужда се използват и допълнителни методи за наблюдение.

При обща анестезия детето може да диша кислород и анестетичен газ през маска или да получи медикаменти през венозния път, след което заспива. При необходимост след заспиване може да бъде поставена тръба в трахеята или друго средство за осигуряване на дихателните пътища. Възможни временни оплаквания след това са болки в гърлото, дрезгав глас, затруднено преглъщане, гадене или повръщане. Рядко могат да настъпят кървене от носа, увреждане на зъби, попадане на стомашно съдържимо в белия дроб /аспирация/, алергична реакция, дихателни или сърдечно-съдови усложнения.

При регионална анестезия — спинална, епидурална или периферен нервен блок — се инжектира местен анестетик в близост до нервни структури, за да се обезболи определена част от тялото. Преди това кожата се почиства и дезинфекцира. Обичайно са достатъчни един до няколко опита. Възможни усложнения са болка на мястото на убождане, спадане на кръвното налягане, гадене, главоболие, хематом, инфекция, непълен или неуспешен блок, токсична реакция към локален анестетик или много рядко неврологично увреждане. Ако регионалната анестезия не може да бъде осъществена или е недостатъчна, може да се наложи промяна на анестезиологичния план.

При деца от 0 до 14 години подходът се съобразява с възрастта, развитието, поведението и възможността за съдействие. При кърмачета, малки деца, силна тревожност, особености в развитието или невъзможност за съдействие анестезиологичният екип може да приложи подходяща премедикация, присъствие на родител до определен етап от подготовката, въвеждане в анестезия с маска или друг безопасен подход според конкретната ситуация и правилата на лечебното заведение.

В медицината няма манипулация без риск. Анестезиологичният екип познава възможните усложнения и предприема мерки за тяхното предотвратяване, ранно разпознаване и лечение. При необходимост от лечение в интензивно отделение, продължителна апаратна вентилация, кръвопреливане или друга допълнителна намеса ще бъде предоставена допълнителна информация, когато състоянието и спешността позволяват това.

В долните редове ще откриете подробно описание на някои от най-честите процедури и манипулации, които се извършват в хода на една анестезия.

${TECHNIQUES_LEGEND}

## Обща анестезия [general]

**Какво правим.** С помощта на венозни медикаменти и/или газ ще приспим Вашето дете. Може да му бъде поставена дихателна тръба в трахеята или ларингеална маска в гърлото, а с помощта на машина да бъде заместено неговото дишане.

**Какво да очаквате.** Детето няма да бъде в съзнание. Ще бъдат потиснати повечето му рефлекси, като дишане, гълтане, мигане и кашлица, както и усещането за болка.

**Възможни усложнения.** Чести: гадене, повръщане, световъртеж, главоболие, обърканост; сухота или болка в гърлото; дрезгав глас. Редки: нараняване на устата, езика, зъбите, очите /вкл. загуба на зрение/; пневмония, попадане на стомашно съдържимо в белия дроб; слабост, изтръпване или болка при увреждане на нерв /вкл. трайни/; будност по време на процедурата и спомен; екстремно покачване на телесната температура /малигнена хипертермия/.

## Спинална, епидурална, каудална анестезия [neuraxial]

**Какво правим.** С помощта на игла или тънка тръбичка инжектираме медикамент в ликвора /спинална/ или около твърдата мозъчна обвивка /епидурална, каудална/, който обезчувства долната част на тялото.

**Какво да очаквате.** Вашето дете може да бъде в съзнание, но може и да бъде приспано. Няма да усеща обезчувствената зона /гърди, корем, крака/. В началото може да има чувство на затопляне в нея. Вероятно е да има затруднения /вкл. невъзможност/ да движи съответните части на тялото, докато действа анестезията. Обичайно ефектите продължават известен период след операцията.

**Възможни усложнения.** Чести: гадене, повръщане, световъртеж, главоболие; болка, сърбеж, дразнене на мястото на убождането. Редки: слабост, изтръпване или болка при увреждане на нерв /вкл. трайни/; затруднения в уринирането, които могат да наложат поставяне на уретрален катетър; инфекция.

## Периферен нервен блок [block]

**Какво правим.** Въвеждаме медикамент с помощта на игла или тънка тръбичка в областта на нерва на ръка, крак, глава, гърди или корем, който обезчувства за няколко часа съответната част на тялото. Обичайно се прави под ехографски контрол и/или с невростимулатор, но не е задължително.

**Какво да очаквате.** Вашето дете може да бъде в съзнание или да бъде приспано. То няма да има болка в обезчувствената част на тялото. Вероятно е да има затруднения /вкл. невъзможност/ да движи съответните части на тялото, докато продължава анестезията. Обичайно ефектите продължават известен период след операцията.

**Възможни усложнения.** Чести: дискомфорт и болка на мястото на убождането. Редки: увреждане на кръвоносен съд; гърчове; слабост, изтръпване или болка при увреждане на нерв /вкл. трайни/; пневмоторакс; инфекция.

## Седация / премедикация [sedation]

**Какво правим.** Медикаменти, поставени венозно/мускулно, през носа или изпити през устата, ще направят Вашето дете по-отпуснато и спокойно.

**Какво да очаквате.** Вашето дете ще бъде в съзнание, но ще е по-малко притеснено. Ще е по-отпуснато и сънливо.

**Възможни усложнения.** Гадене, повръщане, световъртеж, главоболие, обърканост, халюцинации, потискане на дишането.

## Комбинирана анестезия [combined]

Комбинацията от няколко от посочените техники за анестезия обикновено повишава ползите за пациента, като намалява усложненията, без обаче да ги изключва.

## Канюлиране на централна вена [cvc]

**Какво правим.** С помощта на ехограф и/или по анатомични ориентири поставяме относително по-широк катетър в голяма вена на врата /шията/, гърдите или бедрото.

**Какво да очаквате.** Канюлата може да остане по-дълго време от абоката. Позволява бързо и надеждно вливане на кръвни продукти и на медикаменти, които често водят до възпаление и запушване на по-малките вени, и взимане на кръв за изследвания без нови убождания. Може да се прави оценка на обема кръв в тялото.

**Възможни усложнения.** Чести: болка и дразнене на мястото на убождането. Редки: кръвоизлив, запушване на съда, нарушения на сърдечния ритъм, увреждане на сърцето и/или белия дроб; инфекция.

## Канюлиране на артерия [arterial]

**Какво правим.** Поставяме специален катетър или венозна канюла в една от артериите на Вашето дете, обикновено на ръката.

**Какво да очаквате.** Артериалната канюла позволява продължително и прецизно измерване на артериалното налягане и често взимане на кръвни проби без ново убождане.

**Възможни усложнения.** Чести: болка и дразнене на мястото на убождането. Редки: кървене, подуване в областта на убождането, увреждане или запушване на артерията; нарушаване на кръвообращението в крайника; инфекция.

## Изкуствена белодробна вентилация след операцията [ventilation]

**Какво правим.** С помощта на дихателен апарат подпомагаме дишането на Вашето дете чрез дихателна тръба.

**Какво да очаквате.** Дишането на Вашето дете ще бъде подпомагано, докато собственото му не стане достатъчно ефективно и/или няма непосредствен риск за спирането му.

**Възможни усложнения.** Чести: спомен за престоя с тръбата. Редки: увреждане на белите дробове; инфекция /пневмония/.

## Гладуване

Освен ако изрично не е посочено друго, преди анестезията Вашето дете НЕ трябва да приема:
- вода или чай — 2 часа преди анестезията;
- кърма — 4 часа преди анестезията;
- адаптирано мляко — 6 часа преди анестезията;
- друга храна — 8 часа преди анестезията.

## Декларация

С подписа си декларирам, че получих разбираема информация за предстоящата анестезия на детето ми, нейните рискове и възможните алтернативи, имах възможност да задам въпроси и получих отговори на тях, и давам съгласието си за провеждането ѝ.`

const ADULT_BODY = `**Уважаеми пациенти, родители, настойници и попечители,**

Предстоящата анестезия има за цел да осигури обезболяване, безопасност и подходящи условия за извършване на оперативната или диагностичната процедура. Видът на анестезията се определя от лекар анестезиолог според възрастта, теглото, общото Ви състояние, придружаващите заболявания, вида на процедурата, очаквания риск и медицинската необходимост.

Преди започване на анестезията може да бъдете помолени да съблечете част от дрехите си, за да се осигури достъп до оперативното поле и възможност за поставяне на мониторинг. След подготовката ще бъдете покрити с операционна престилка или чаршаф.

За провеждане на анестезията обичайно се поставя периферен венозен път — тънка пластмасова канюла във вена на ръката или друго подходящо място. През него се прилагат медикаменти и инфузионни разтвори. Убождането може да бъде неприятно. Възможни, но обикновено леки усложнения са болка, посиняване, кървене, възпаление или запушване на вената. Изключително рядко може да се засегне нерв или артерия.

Преди и по време на анестезията ще бъдете свързани с монитор. Обичайно се поставят електроди за сърдечна дейност, маншет за кръвно налягане и сензор на пръст за измерване на кислорода в кръвта. При нужда се използват и допълнителни методи за наблюдение.

При обща анестезия ще получите медикаменти през венозния път или ще дишате кислород и анестетичен газ през маска, след което ще заспите. При необходимост след заспиване може да бъде поставена тръба в трахеята или друго средство за осигуряване на дихателните пътища. Възможни временни оплаквания след това са болки в гърлото, дрезгав глас, затруднено преглъщане, гадене или повръщане. Рядко могат да настъпят кървене от носа, увреждане на зъби, попадане на стомашно съдържимо в белия дроб /аспирация/, алергична реакция, дихателни или сърдечно-съдови усложнения.

При регионална анестезия — спинална, епидурална или периферен нервен блок — се инжектира местен анестетик в близост до нервни структури, за да се обезболи определена част от тялото. Преди това кожата се почиства и дезинфекцира. Обичайно са достатъчни един до няколко опита. Възможни усложнения са болка на мястото на убождане, спадане на кръвното налягане, гадене, главоболие, хематом, инфекция, непълен или неуспешен блок, токсична реакция към локален анестетик или много рядко неврологично увреждане. Ако регионалната анестезия не може да бъде осъществена или е недостатъчна, може да се наложи промяна на анестезиологичния план.

В медицината няма манипулация без риск. Анестезиологичният екип познава възможните усложнения и предприема мерки за тяхното предотвратяване, ранно разпознаване и лечение. При необходимост от лечение в интензивно отделение, продължителна апаратна вентилация, кръвопреливане или друга допълнителна намеса ще Ви бъде предоставена допълнителна информация, когато състоянието и спешността позволяват това.

По-долу ще откриете подробно описание на някои от най-честите процедури и манипулации, които се извършват в хода на една анестезия.

${TECHNIQUES_LEGEND}

## Обща анестезия [general]

**Какво правим.** С помощта на венозни медикаменти и/или газ ще Ви приспим. Може да Ви бъде поставена дихателна тръба в трахеята или ларингеална маска в гърлото, а с помощта на апарат да бъде заместено дишането Ви.

**Какво да очаквате.** Няма да бъдете в съзнание. Ще бъдат потиснати повечето Ви рефлекси, като дишане, гълтане, мигане и кашлица, както и усещането за болка.

**Възможни усложнения.** Чести: гадене, повръщане, световъртеж, главоболие, обърканост; сухота или болка в гърлото; дрезгав глас. Редки: нараняване на устата, езика, зъбите, очите /вкл. загуба на зрение/; пневмония, попадане на стомашно съдържимо в белия дроб; слабост, изтръпване или болка при увреждане на нерв /вкл. трайни/; будност по време на процедурата и спомен; екстремно покачване на телесната температура /малигнена хипертермия/.

## Спинална, епидурална, каудална анестезия [neuraxial]

**Какво правим.** С помощта на игла или тънка тръбичка инжектираме медикамент в ликвора /спинална/ или около твърдата мозъчна обвивка /епидурална, каудална/, който обезчувства долната част на тялото.

**Какво да очаквате.** Може да бъдете в съзнание или приспани. Няма да усещате обезчувствената зона /гърди, корем, крака/. В началото може да усетите затопляне в нея. Вероятно ще имате затруднения /вкл. невъзможност/ да движите съответните части на тялото, докато действа анестезията. Обичайно ефектите продължават известно време след операцията.

**Възможни усложнения.** Чести: гадене, повръщане, световъртеж, главоболие; болка, сърбеж, дразнене на мястото на убождането. Редки: слабост, изтръпване или болка при увреждане на нерв /вкл. трайни/; затруднения в уринирането, които могат да наложат поставяне на уретрален катетър; инфекция.

## Периферен нервен блок [block]

**Какво правим.** Въвеждаме медикамент с помощта на игла или тънка тръбичка в областта на нерва на ръка, крак, глава, гърди или корем, който обезчувства за няколко часа съответната част на тялото. Обичайно се прави под ехографски контрол и/или с невростимулатор, но не е задължително.

**Какво да очаквате.** Може да бъдете в съзнание или приспани. Няма да имате болка в обезчувствената част на тялото. Вероятно ще имате затруднения /вкл. невъзможност/ да я движите, докато продължава анестезията. Обичайно ефектите продължават известно време след операцията.

**Възможни усложнения.** Чести: дискомфорт и болка на мястото на убождането. Редки: увреждане на кръвоносен съд; гърчове; слабост, изтръпване или болка при увреждане на нерв /вкл. трайни/; пневмоторакс; инфекция.

## Седация / премедикация [sedation]

**Какво правим.** Медикаменти, поставени венозно/мускулно, през носа или приети през устата, ще Ви направят по-отпуснати и спокойни.

**Какво да очаквате.** Ще бъдете в съзнание, но по-малко притеснени. Ще сте по-отпуснати и сънливи.

**Възможни усложнения.** Гадене, повръщане, световъртеж, главоболие, обърканост, халюцинации, потискане на дишането.

## Комбинирана анестезия [combined]

Комбинацията от няколко от посочените техники за анестезия обикновено повишава ползите за пациента, като намалява усложненията, без обаче да ги изключва.

## Канюлиране на централна вена [cvc]

**Какво правим.** С помощта на ехограф и/или по анатомични ориентири поставяме относително по-широк катетър в голяма вена на врата /шията/, гърдите или бедрото.

**Какво да очаквате.** Канюлата може да остане по-дълго време от абоката. Позволява бързо и надеждно вливане на кръвни продукти и на медикаменти, които често водят до възпаление и запушване на по-малките вени, и взимане на кръв за изследвания без нови убождания. Може да се прави оценка на обема кръв в тялото.

**Възможни усложнения.** Чести: болка и дразнене на мястото на убождането. Редки: кръвоизлив, запушване на съда, нарушения на сърдечния ритъм, увреждане на сърцето и/или белия дроб; инфекция.

## Канюлиране на артерия [arterial]

**Какво правим.** Поставяме специален катетър или венозна канюла в една от артериите Ви, обикновено на ръката.

**Какво да очаквате.** Артериалната канюла позволява продължително и прецизно измерване на артериалното налягане и често взимане на кръвни проби без ново убождане.

**Възможни усложнения.** Чести: болка и дразнене на мястото на убождането. Редки: кървене, подуване в областта на убождането, увреждане или запушване на артерията; нарушаване на кръвообращението в крайника; инфекция.

## Изкуствена белодробна вентилация след операцията [ventilation]

**Какво правим.** С помощта на дихателен апарат подпомагаме дишането Ви чрез дихателна тръба.

**Какво да очаквате.** Дишането Ви ще бъде подпомагано, докато собственото Ви не стане достатъчно ефективно и/или няма непосредствен риск за спирането му.

**Възможни усложнения.** Чести: спомен за престоя с тръбата. Редки: увреждане на белите дробове; инфекция /пневмония/.

## Гладуване

Освен ако изрично не е посочено друго, преди анестезията НЕ трябва да приемате:
- вода или чай — 2 часа преди анестезията;
- храна, мляко, сокове — 8 часа преди анестезията.

## Декларация

С подписа си декларирам, че получих разбираема информация за предстоящата анестезия, нейните рискове и възможните алтернативи, имах възможност да задам въпроси и получих отговори на тях, и давам съгласието си за провеждането ѝ. Когато пациентът е на възраст между 14 и 18 години, съгласието се дава и от родител или настойник.`

export const BUNDLED_CONSENT_TEMPLATES: Record<ConsentPopulation, ConsentTemplate> = {
  PEDIATRIC: { title: "Информирано съгласие за анестезия (деца до 14 г.)", body: PEDIATRIC_BODY },
  ADULT: { title: "Информирано съгласие за анестезия (възрастни и деца 14–18 г.)", body: ADULT_BODY },
}

// ── The settings a hospital chooses ───────────────────────────────────────

/**
 * How the summary and the consent print. A hospital picks one in Status.
 *   A  the ward's Document №2, with LOSPOR's answers printed in
 *   B  a summary page, then the whole consent in two columns
 *   C  the consent describes only the techniques ticked before printing
 *   D  one sheet: a dense summary on the front, the consent as a table on the back
 *   E  a copy for the hospital, and a large-print copy for the patient or parent
 */
export const PREOP_DOCUMENT_LAYOUTS = ["A", "B", "C", "D", "E"] as const
export type PreopDocumentLayout = typeof PREOP_DOCUMENT_LAYOUTS[number]
export const DEFAULT_PREOP_DOCUMENT_LAYOUT: PreopDocumentLayout = "B"

export function isPreopDocumentLayout(value: unknown): value is PreopDocumentLayout {
  return typeof value === "string" && (PREOP_DOCUMENT_LAYOUTS as readonly string[]).includes(value)
}

export const PREOP_DOCUMENT_LAYOUT_LABELS: Record<"en" | "bg", Record<PreopDocumentLayout, { name: string; description: string }>> = {
  en: {
    A: { name: "Document №2, filled in", description: "The ward's paper form in its own order, sections I to V, with every answer LOSPOR holds printed in and the rest left for the pen. The consent follows in full." },
    B: { name: "Summary, then consent", description: "A summary for the colleague taking the case over, with the whole questionnaire, then the whole consent in two columns." },
    C: { name: "Consent per technique", description: "Before printing, the anaesthetist ticks the planned techniques. The consent describes only those, and general anaesthesia as the fallback, each with a box for the patient's initials." },
    D: { name: "One sheet, both sides", description: "A dense summary on the front and the consent as a table on the back, one row per technique, word for word. Needs a double-sided printer." },
    E: { name: "Hospital copy and patient's copy", description: "The hospital's pages carry the summary and the signatures. A large-print page with the fasting instructions, and the full consent text, go home with the patient or parent." },
  },
  bg: {
    A: { name: "Документ №2, попълнен", description: "Хартиеният формуляр на отделението в неговия ред, раздели І–V, с всички отговори, които LOSPOR съдържа; останалото се попълва на ръка. Следва пълният текст на съгласието." },
    B: { name: "Обобщение, после съгласие", description: "Обобщение за колегата, който поема случая, с целия въпросник, след него целият текст на съгласието в две колони." },
    C: { name: "Съгласие по техники", description: "Преди печат анестезиологът отбелязва планираните техники. Съгласието описва само тях и общата анестезия като резервен план, всяка с поле за инициалите на пациента." },
    D: { name: "Един лист, двустранно", description: "Сбито обобщение на лицето и съгласието като таблица на гърба, по един ред за техника, дословно. Изисква двустранен принтер." },
    E: { name: "Екземпляр за болницата и за пациента", description: "Страниците за болницата съдържат обобщението и подписите. Страница с едър шрифт с указанията за гладуване и пълният текст на съгласието остават за пациента или родителя." },
  },
}

/** Both off unless a hospital switches them on in Status. */
export type PreopDocumentSettings = {
  /** A summary page between preop and intraop, printable. */
  summaryEnabled: boolean
  /** The written consent prints after the summary. Needs the summary. */
  consentEnabled: boolean
  /** How the summary and the consent print. */
  layout: PreopDocumentLayout
}

export const DEFAULT_PREOP_DOCUMENT_SETTINGS: PreopDocumentSettings = { summaryEnabled: false, consentEnabled: false, layout: DEFAULT_PREOP_DOCUMENT_LAYOUT }

/** The consent prints from the summary, so it is off whenever the summary is. An unknown layout is B. */
export function effectivePreopDocumentSettings(settings: Partial<PreopDocumentSettings> | null | undefined): PreopDocumentSettings {
  const summaryEnabled = settings?.summaryEnabled === true
  return {
    summaryEnabled,
    consentEnabled: summaryEnabled && settings?.consentEnabled === true,
    layout: isPreopDocumentLayout(settings?.layout) ? settings.layout : DEFAULT_PREOP_DOCUMENT_LAYOUT,
  }
}

/** POST /v1/cases/:id/consent-prints: which text a sheet carried, in which layout, describing which techniques. */
export type ConsentPrintInput = {
  population: ConsentPopulation
  version: number
  sha256: string
  layout?: PreopDocumentLayout
  /** Layout C: the techniques ticked before printing. */
  techniques?: ConsentTechnique[]
}

/**
 * The technique sections layout C prints: the ticked ones, and general
 * anaesthesia always. Nothing ticked prints every technique, as layout B.
 */
export function consentTechniquesToPrint(chosen: readonly ConsentTechnique[] | null | undefined): Set<ConsentTechnique> {
  if (!chosen || chosen.length === 0) return new Set(CONSENT_TECHNIQUES)
  return new Set([CONSENT_FALLBACK_TECHNIQUE, ...chosen])
}

/** Reads "general,block" from a URL into known techniques, in the canonical order. */
export function parseConsentTechniques(raw: string | null | undefined): ConsentTechnique[] {
  const wanted = new Set((raw ?? "").split(",").map(part => part.trim()))
  return CONSENT_TECHNIQUES.filter(technique => wanted.has(technique))
}

/** One population's text as the apps receive it: the hospital's latest, or the bundled one (version 0). */
export type ConsentTemplateVersionView = ConsentTemplate & {
  population: ConsentPopulation
  /** 0 is the bundled text, never saved by anyone. */
  version: number
  /** SHA-256 of the canonical text, hex; what a printed sheet records. */
  sha256: string
}

/** GET /v1/preop/documents. */
export type PreopDocumentsResponse = PreopDocumentSettings & {
  templates: Record<ConsentPopulation, ConsentTemplateVersionView> | null
}

// ── The questionnaire on the summary ──────────────────────────────────────
//
// The summary prints the whole questionnaire the clinician was shown: every
// question switched on for the patient's population, with its answer, "no"
// included. A follow-up is listed under its question only when that question
// was answered "yes", as the form shows it.

export type PreopQuestionnaireAnswer = "YES" | "NO" | "UNKNOWN" | "NOT_APPLICABLE"

export type PreopQuestionnaireItem = {
  stableKey: string
  /** The question this one follows up, printed indented under it. */
  parentKey: string | null
  formSection: PreopFormSection
  /** The question as the form words it. */
  label: { en: string; bg: string }
  /** Null: the question was shown and left unanswered. */
  answer: PreopQuestionnaireAnswer | null
  /** A choice question's answer, e.g. the procedure type for Gupta. */
  option: { en: string; bg: string } | null
}

export const PREOP_QUESTIONNAIRE_ANSWER_LABELS: Record<"en" | "bg", Record<PreopQuestionnaireAnswer | "NONE", string>> = {
  en: { YES: "Yes", NO: "No", UNKNOWN: "Unknown", NOT_APPLICABLE: "N/A", NONE: "—" },
  bg: { YES: "Да", NO: "Не", UNKNOWN: "Неизвестно", NOT_APPLICABLE: "Неприложимо", NONE: "—" },
}

/** The order the form shows its sections in, which the summary follows. */
export const PREOP_QUESTIONNAIRE_SECTIONS: readonly PreopFormSection[] = [
  "demographics", "case_details", "medical_history", "current_medications", "anamnesis", "physical_exam", "airway", "labs", "risk_scores",
]

export const PREOP_QUESTIONNAIRE_SECTION_LABELS: Record<"en" | "bg", Record<PreopFormSection, string>> = {
  en: {
    demographics: "Patient",
    case_details: "Operation",
    medical_history: "Medical history",
    current_medications: "Medications",
    anamnesis: "History",
    physical_exam: "Examination",
    airway: "Airway",
    labs: "Laboratory",
    risk_scores: "Risk factors",
  },
  bg: {
    demographics: "Пациент",
    case_details: "Операция",
    medical_history: "Придружаващи заболявания",
    current_medications: "Медикаменти",
    anamnesis: "Анамнеза",
    physical_exam: "Преглед",
    airway: "Дихателни пътища",
    labs: "Лаборатория",
    risk_scores: "Рискови фактори",
  },
}

export type PreopQuestionnaireGroup = {
  section: PreopFormSection
  rows: Array<{ item: PreopQuestionnaireItem; depth: 0 | 1 }>
}

/** The questionnaire in the form's sections, each follow-up straight after its question. */
export function groupPreopQuestionnaire(items: readonly PreopQuestionnaireItem[]): PreopQuestionnaireGroup[] {
  const children = new Map<string, PreopQuestionnaireItem[]>()
  for (const item of items) {
    if (item.parentKey) children.set(item.parentKey, [...(children.get(item.parentKey) ?? []), item])
  }
  const groups: PreopQuestionnaireGroup[] = []
  for (const section of PREOP_QUESTIONNAIRE_SECTIONS) {
    const rows: PreopQuestionnaireGroup["rows"] = []
    for (const item of items) {
      if (item.parentKey || item.formSection !== section) continue
      rows.push({ item, depth: 0 })
      for (const child of children.get(item.stableKey) ?? []) rows.push({ item: child, depth: 1 })
    }
    if (rows.length > 0) groups.push({ section, rows })
  }
  return groups
}

/** The answer as printed: the option for a choice question, else Yes / No / Unknown / N/A, or a dash. */
export function preopQuestionnaireAnswerText(item: PreopQuestionnaireItem, language: "en" | "bg"): string {
  if (item.option) return item.option[language]
  return PREOP_QUESTIONNAIRE_ANSWER_LABELS[language][item.answer ?? "NONE"]
}

/**
 * Age in years for choosing the text and the signers: a child's age is
 * stored in its own unit (days, months, years), an adult's in whole years.
 */
export function preopAgeInYears(preop: {
  ageYears?: number | null
  ageValue?: number | null
  ageUnit?: "DAYS" | "MONTHS" | "YEARS" | null
} | null | undefined): number | null {
  if (preop?.ageValue != null && Number.isFinite(preop.ageValue) && preop.ageUnit) {
    if (preop.ageUnit === "YEARS") return preop.ageValue
    if (preop.ageUnit === "MONTHS") return preop.ageValue / 12
    return preop.ageValue / 365.25
  }
  return preop?.ageYears != null && Number.isFinite(preop.ageYears) ? preop.ageYears : null
}

/**
 * A person's name with their title in front, unless the name already starts
 * with it ("д-р" typed into both the name and the title printed "д-р д-р").
 */
export function titledName(person: { name: string; title?: string | null } | null | undefined): string | null {
  const name = person?.name?.trim()
  if (!name) return null
  const title = person?.title?.trim()
  if (!title || name.toLocaleLowerCase().startsWith(title.toLocaleLowerCase())) return name
  return `${title} ${name}`
}

/**
 * The allergy line on the summary: the recorded allergens, then latex when
 * the latex question is answered yes, unless an allergen already names it.
 */
export function allergyLine(allergens: readonly (string | null | undefined)[], latex: boolean, latexLabel: string): string {
  const named = allergens.map(label => label?.trim() ?? "").filter(Boolean)
  const latexNamed = named.some(label => /latex|латекс/i.test(label))
  return [named.join(", "), latex && !latexNamed ? latexLabel : null].filter(Boolean).join(" · ")
}


/** One nil-by-mouth assignment: this intake stops so many hours before the operation. */
export type ConsentFastingRow = { category: string; hoursBefore: number }

const FASTING_ORDER = ["CLEAR_FLUIDS", "BREAST_MILK", "INFANT_FORMULA_UNDER_1_YEAR", "SOLID_FOOD_OR_COW_MILK"]
const FASTING_WORDS: Record<"en" | "bg", Record<string, string>> = {
  bg: { CLEAR_FLUIDS: "вода или чай", BREAST_MILK: "кърма", INFANT_FORMULA_UNDER_1_YEAR: "адаптирано мляко", SOLID_FOOD_OR_COW_MILK: "друга храна или краве мляко" },
  en: { CLEAR_FLUIDS: "water or tea", BREAST_MILK: "breast milk", INFANT_FORMULA_UNDER_1_YEAR: "formula milk", SOLID_FOOD_OR_COW_MILK: "other food or cow's milk" },
}
// A lookahead, not \b: \b only knows Latin letters, so "Гладуване" never matched it.
const FASTING_HEADING = /^##\s+(гладуване|nil by mouth|fasting)(?=\s|\[|$)/i

function fastingHours(hours: number, language: "en" | "bg"): string {
  const shown = String(hours).replace(".", language === "bg" ? "," : ".")
  if (language === "bg") return `${shown} ${hours === 1 ? "час" : "часа"} преди анестезията`
  return `${shown} ${hours === 1 ? "hour" : "hours"} before anaesthesia`
}

/**
 * The consent text with its nil-by-mouth list replaced by the hours assigned
 * at the preop visit, so the sheet the parent signs says what the anaesthetist
 * prescribed. The list is the one under the heading "Гладуване" (or
 * "Fasting" / "Nil by mouth"); its wording follows that heading's language.
 * Without assignments, or without such a heading, the text is unchanged.
 */
export function consentWithAssignedFasting(body: string, rows: readonly ConsentFastingRow[] | null | undefined): string {
  const assigned = (rows ?? []).filter(row => FASTING_ORDER.includes(row.category) && Number.isFinite(row.hoursBefore))
  if (assigned.length === 0) return body
  const lines = body.replace(/\r\n/g, "\n").split("\n")
  const heading = lines.findIndex(line => FASTING_HEADING.test(line.trim()))
  if (heading < 0) return body
  const language: "en" | "bg" = /[а-я]/i.test(lines[heading]) ? "bg" : "en"
  let end = lines.findIndex((line, index) => index > heading && line.trim().startsWith("## "))
  if (end < 0) end = lines.length
  const ordered = FASTING_ORDER.flatMap(category => assigned.filter(row => row.category === category))
  const list = ordered.map((row, index) => `- ${FASTING_WORDS[language][row.category]} — ${fastingHours(row.hoursBefore, language)}${index === ordered.length - 1 ? "." : ";"}`)
  const listStart = lines.findIndex((line, index) => index > heading && index < end && line.trim().startsWith("- "))
  if (listStart < 0) {
    const insertAt = end > 0 && lines[end - 1].trim() === "" ? end - 1 : end
    return [...lines.slice(0, insertAt), ...list, ...lines.slice(insertAt)].join("\n")
  }
  let listEnd = listStart
  while (listEnd < end && lines[listEnd].trim().startsWith("- ")) listEnd++
  return [...lines.slice(0, listStart), ...list, ...lines.slice(listEnd)].join("\n")
}
