/**
 * The user guide's reference pages, written from what Core actually holds
 * (10.2.0), so a page can never say something the app does not do.
 *
 *   npx rolldown scripts/guide-reference.ts --platform node --format esm -o .guide-gen/run.mjs
 *   node .guide-gen/run.mjs <path to lospor-user-guide>
 *
 * Writes the Bulgarian page (docs/reference/<name>.md) and the English page
 * (i18n/en/.../reference/<name>.md). Re-run after the catalogue changes and
 * commit the result in the guide.
 */
import { mkdirSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { AUTOMATIONS } from "../src/intraop-suggestions/automations"
import { SUGGESTION_CARDS } from "../src/intraop-suggestions/catalogue"
import { CLINICAL_EVENT_CATS } from "../src/catalog/intraop-events"
import { COMPLICATION_CATEGORIES, canonicalComplicationLabel } from "../src/complications"
import { clinicalDisplayLabel } from "../src/display"
import { AUTOMATION_GROUPS } from "../src/intraop-automation"

import { drugsPage } from "./guide-drugs"
import { t, table, type Lang, type Page } from "./guide-lib"

/* ---------- automation ---------- */

const GROUP_TEXT: Record<string, { en: string; bg: string; whatEn: string; whatBg: string }> = {
  treatmentSuggestions: {
    en: "Treatment suggestions", bg: "Предложения за лечение",
    whatEn: "After a complication is logged, a card (or a checklist for the time-critical ones) lists the treatment with doses filled in for this patient.",
    whatBg: "След записано усложнение карта (или списък със стъпки за животозастрашаващите) показва лечението с дози, попълнени за този пациент.",
  },
  reverseQuestions: {
    en: "Questions after a rescue drug", bg: "Въпроси след спасителен медикамент",
    whatEn: "A rescue drug, fluid or shock charted without its complication asks which complication it was for.",
    whatBg: "Спасително лекарство, течност или шок, записани без усложнение, питат за кое усложнение са били.",
  },
  readingQuestions: {
    en: "Questions from the readings", bg: "Въпроси от показанията",
    whatEn: "Unusual SpO₂, EtCO₂, temperature and TOF ask whether to log the complication.",
    whatBg: "Необичайни SpO₂, EtCO₂, температура и TOF питат дали да запишат усложнението.",
  },
  labQuestions: {
    en: "Questions from the labs", bg: "Въпроси от лабораторните изследвания",
    whatEn: "A laboratory result outside its limits, typed or imported during the case, asks whether to log the complication.",
    whatBg: "Лабораторен резултат извън границите, въведен или внесен по време на случая, пита дали да запише усложнението.",
  },
  reminders: {
    en: "Reminders and warnings", bg: "Напомняния и предупреждения",
    whatEn: "Facts from the preoperative record and the local anaesthetic maximum, said at the moment they matter.",
    whatBg: "Факти от предоперативния запис и максималната доза локален анестетик, казани в момента, в който имат значение.",
  },
  timers: {
    en: "Follow-ups", bg: "Последващи стъпки",
    whatEn: "Timed prompts after a treatment: the next rhythm check, repeat bolus, repeat dantrolene, tourniquet time.",
    whatBg: "Напомняния по време след лечение: следваща проверка на ритъма, повторен болус, повторен дантролен, време на турникета.",
  },
}

function automationPage(): Page {
  const body = (lang: Lang) => {
    const parts = [
      t(lang,
        `# Intraoperative automation

Everything here is a **question or a suggestion**: nothing is recorded without your tap. The one exception: starting a Propofol TCI infusion records TCI as the anaesthesia technique. Every group and every line is on by default, in the public demo and on a hospital appliance; the hospital switches any of them off in **Status**. Each clinician can still turn a group or a line off for themselves in **Settings → Automation**. Off in Status is off for everyone.

This page lists every automation, written from what the app actually holds.`,
        `# Интраоперативна автоматизация

Всичко тук е **въпрос или предложение**: нищо не се записва без вашето докосване. Единственото изключение: започването на инфузия на пропофол с TCI записва TCI като анестезиологична техника. Всяка група и всеки ред са включени по подразбиране, в публичната демонстрация и на болничния аплайънс; болницата изключва всяка от тях в **Status**. Всеки лекар може да изключи група или ред за себе си в **Настройки → Автоматизация**. Изключено в Status е изключено за всички.

Тази страница изброява всяка автоматизация, написана по това, което приложението действително съдържа.`),
    ]
    for (const group of AUTOMATION_GROUPS) {
      const info = GROUP_TEXT[group]!
      const items = AUTOMATIONS.filter(item => item.group === group)
      parts.push(`## ${t(lang, info.en, info.bg)} (${items.length})\n\n${t(lang, info.whatEn, info.whatBg)}`)
      parts.push(table([t(lang, "Automation", "Автоматизация"), t(lang, "What it does", "Какво прави")],
        items.map(item => [`**${t(lang, item.en, item.bg)}**`, t(lang, item.detailEn, item.detailBg)])))
    }
    parts.push(t(lang,
      `## The vitals questions

Separately from the groups above, the heart-rate and blood-pressure questions ask when a reading falls in the lowest or highest share of this hospital's own readings for the patient's age band. Status sets the share per band and sign, and how many cases a band needs before its statistics are used; until then only the fixed rules ask.`,
      `## Въпросите от жизнените показатели

Отделно от групите по-горе, въпросите за пулс и кръвно налягане питат, когато показанието попадне в най-ниския или най-високия дял от показанията на самата болница за възрастовата група на пациента. Status задава дяла за всяка група и показател и колко случая са нужни на групата, преди да се използва нейната статистика; дотогава питат само фиксираните правила.`))
    parts.push(t(lang,
      `## How each one was received

In **Status**, beside each line, you see how often it was taken up and how often it was put away over the last 90 days. A line that is mostly put away is noise: switch it off there. Reminders and follow-ups open a sheet without marking what is saved, so only their "Not now" answers are counted.`,
      `## Как е приета всяка

В **Status**, до всеки ред, виждате колко често е бил приет и колко често е бил оставен настрана през последните 90 дни. Ред, който почти винаги се оставя настрана, е шум: изключете го там. Напомнянията и последващите стъпки отварят лист, без да отбелязват какво е записано, затова се броят само отговорите им „Не сега“.`))
    return parts.join("\n\n") + "\n"
  }
  return { name: "automation", position: 4, title: { en: "Intraoperative automation", bg: "Интраоперативна автоматизация" }, body: { en: body("en"), bg: body("bg") } }
}

/* ---------- events and complications ---------- */

const EVENT_BEHAVIOUR: Record<string, { en: string; bg: string }> = {
  "Extubated": { en: "Asks about residual blockade when a relaxant was given and the TOF monitor is on.", bg: "Пита за остатъчен блок, когато е даден релаксант и TOF мониторът е включен." },
  "Procedure ended": { en: "Reminds about postoperative nausea and vomiting prophylaxis when the Apfel score or history calls for it. It does not end the case.", bg: "Напомня за профилактика на постоперативно гадене и повръщане, когато скорът на Apfel или анамнезата го налагат. Не приключва случая." },
  "Tourniquet on": { en: "Opens the body picker; each tourniquet has its own timer with prompts at 90 and 120 minutes (children 60 and 75).", bg: "Отваря тялото за избор на място; всеки турникет има собствен таймер с напомняния на 90 и 120 минути (при деца 60 и 75)." },
  "Tourniquet off": { en: "Stops that tourniquet's timer; a re-inflation after 10 minutes or more starts it again.", bg: "Спира таймера на този турникет; повторно надуване след 10 минути или повече го започва отново." },
  "Airway exchange": { en: "Opens the airway-device picker with a 'Why?' line; the old device stays on the list as replaced or failed.", bg: "Отваря избора на дихателно устройство с ред „Защо?“; старото остава в списъка като сменено или неуспешно." },
  "Reintubation": { en: "Opens the airway-device picker; the earlier tube is marked failed and both are counted.", bg: "Отваря избора на дихателно устройство; предишната тръба се отбелязва като неуспешна и двете се броят." },
  "Accidental extubation": { en: "Asks 'Reintubate?'.", bg: "Пита „Реинтубация?“." },
  "Death (exitus letalis)": { en: "Sets the postoperative destination to Deceased and offers, separately, to end the case.", bg: "Задава следоперативното направление „Починал“ и предлага, отделно, да приключите случая." },
  "CPR started": { en: "Part of the cardiac arrest checklist; every further step asks for its own yes.", bg: "Част от списъка за сърдечен арест; всяка следваща стъпка пита за собствено „да“." },
  "ROSC": { en: "Ends the arrest follow-ups.", bg: "Приключва напомнянията при арест." },
  "IV line in": { en: "A new peripheral line after a failed one; the old one stays on the list marked failed.", bg: "Нов периферен път след неуспешен; старият остава в списъка като неуспешен." },
  "Charcoal filters fitted": { en: "A step of the malignant hyperthermia checklist.", bg: "Стъпка от списъка за малигнена хипертермия." },
  "Active cooling started": { en: "A step of the malignant hyperthermia checklist.", bg: "Стъпка от списъка за малигнена хипертермия." },
}

const EVENT_CAT_BG: Record<string, string> = { Airway: "Дихателни пътища", Regional: "Регионална анестезия", Access: "Съдов достъп", Surgical: "Хирургични", Resuscitation: "Ресусцитация" }

function eventsPage(): Page {
  const cardFor = (name: string) => SUGGESTION_CARDS.find(card => card.complications.some(item => canonicalComplicationLabel(item) === canonicalComplicationLabel(name)))
  const eventCount = CLINICAL_EVENT_CATS.filter(cat => !cat.isComplication).reduce((sum, cat) => sum + cat.events.length, 0)
  const complicationCount = COMPLICATION_CATEGORIES.reduce((sum, cat) => sum + cat.items.length, 0)

  const body = (lang: Lang) => {
    const parts = [
      t(lang,
        `# Events and complications

The events you can put on the chart (${eventCount}), and the complications (${complicationCount}) with what the app suggests for each. The suggestions are described in [Intraoperative automation](automation.md).`,
        `# Събития и усложнения

Събитията, които можете да запишете в картата (${eventCount}), и усложненията (${complicationCount}) с това, което приложението предлага за всяко. Предложенията са описани в [Интраоперативна автоматизация](automation.md).`),
    ]
    for (const cat of CLINICAL_EVENT_CATS.filter(item => !item.isComplication)) {
      parts.push(`## ${lang === "bg" ? EVENT_CAT_BG[cat.cat] ?? cat.cat : cat.cat}`)
      parts.push(table([t(lang, "Event", "Събитие"), t(lang, "What it does", "Какво прави")],
        cat.events.map(event => [`**${lang === "bg" ? event.labelBg : event.label}**`, EVENT_BEHAVIOUR[event.label]?.[lang] ?? t(lang, "Charted on the timeline and in the event log.", "Записва се във времевата линия и в дневника на събитията.")])))
    }
    parts.push(t(lang, "## Complications", "## Усложнения"))
    parts.push(t(lang,
      "Each complication is charted with its time. Where the app has a treatment for it, a **card** lists the options with doses filled in; a **checklist** is used for the time-critical ones (cardiac arrest, VF / pulseless VT, local anaesthetic toxicity, malignant hyperthermia, anaphylaxis, massive haemorrhage, hyperkalaemia).",
      "Всяко усложнение се записва с часа си. Когато приложението има лечение за него, **карта** показва възможностите с попълнени дози; **списък със стъпки** се ползва за животозастрашаващите (сърдечен арест, камерно мъждене / безпулсова камерна тахикардия, токсичност от локален анестетик, малигнена хипертермия, анафилаксия, масивен кръвоизлив, хиперкалиемия)."))
    for (const category of COMPLICATION_CATEGORIES) {
      parts.push(`### ${lang === "bg" ? category.titleBg : category.title}`)
      parts.push(table([t(lang, "Complication", "Усложнение"), t(lang, "Suggestion", "Предложение"), t(lang, "Offers", "Предлага")],
        category.items.map(item => {
          const card = cardFor(item)
          const name = lang === "bg" ? clinicalDisplayLabel("complication", item, "bg") : item
          if (!card) return [`**${name}**`, t(lang, "None", "Няма"), ""]
          const rows = card.rows.map(row => (lang === "bg" ? row.title.bg : row.title.en))
          return [`**${name}**`, card.kind === "checklist" ? t(lang, "Checklist", "Списък със стъпки") : t(lang, "Card", "Карта"), rows.join("; ")]
        })))
    }
    return parts.join("\n\n") + "\n"
  }
  return { name: "events", position: 2, title: { en: "Events and complications", bg: "Събития и усложнения" }, body: { en: body("en"), bg: body("bg") } }
}

/* ---------- write ---------- */

const PAGES: Page[] = [automationPage(), eventsPage(), drugsPage()]

const guide = process.argv[2]
if (!guide) throw new Error("Usage: node run.mjs <path to lospor-user-guide>")
for (const page of PAGES) {
  for (const lang of ["bg", "en"] as const) {
    const file = lang === "bg"
      ? join(guide, "docs", "reference", `${page.name}.md`)
      : join(guide, "i18n", "en", "docusaurus-plugin-content-docs", "current", "reference", `${page.name}.md`)
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, `---\nsidebar_position: ${page.position}\ntitle: ${page.title[lang]}\n---\n\n${page.body[lang]}`)
    console.log("wrote", file)
  }
}
