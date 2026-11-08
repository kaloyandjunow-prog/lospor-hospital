/**
 * The fixed words of the printed record and the case summary (mock E, 2026-11-08): one dictionary for the
 * web, the PWA and the print sheet. Bulgarian wording is the maintainer's. Units stay English, and the gas
 * lane is "FGF" in English and spelled out in Bulgarian.
 */
export type RecordLocale = "en" | "bg"

export type RecordLogKind =
  | "event" | "drug" | "fluid" | "airway" | "agent" | "fgf" | "infusion" | "jet" | "complication" | "position"

export type RecordLabelSet = {
  title: string
  patientName: string
  patientId: string
  patient: string
  risk: string
  allergy: string
  noKnownAllergy: string
  times: string
  start: string
  end: string
  airway: string
  airwayDevice: string
  access: string
  technique: string
  eventLog: string
  eventLogNote: string
  time: string
  kind: string
  entry: string
  note: string
  deletedAt: string
  vitals: string
  vitalsEveryFive: string
  viewTable: string
  readings: string
  timetable: string
  episodes: string
  drugTotals: string
  infusionSuffix: string
  fluidBalance: string
  recovery: string
  transferredTo: string
  dose: string
  fromCard: string
  episodeLegend: string
  fgf: string
  signatures: { anaesthesiologist: string; nurse: string; surgeon: string }
  page: string
  of: string
  kinds: Record<RecordLogKind, string>
}

export const RECORD_LABELS: Record<RecordLocale, RecordLabelSet> = {
  en: {
    title: "Anaesthesia record", patientName: "Patient name", patientId: "ID / File №", patient: "Patient", risk: "Risk",
    allergy: "Allergy", noKnownAllergy: "None known", times: "Times", start: "Start", end: "End",
    airway: "Airway", airwayDevice: "Device", access: "Access", technique: "Technique & position",
    eventLog: "Event log", eventLogNote: "everything charted, in the order it happened (deleted entries stay, struck through)",
    time: "Time", kind: "Kind", entry: "Entry", note: "Note", deletedAt: "Deleted",
    vitals: "Vitals recorded", vitalsEveryFive: "every 5 minutes", viewTable: "View table", readings: "readings",
    timetable: "Intraoperative timetable", episodes: "Episodes & what was done", drugTotals: "Drug totals", infusionSuffix: "(infusion)",
    fluidBalance: "Fluid balance", recovery: "Recovery", transferredTo: "Transferred to", dose: "Dose", fromCard: "from a treatment card", episodeLegend: "episode", fgf: "FGF",
    signatures: { anaesthesiologist: "Anaesthesiologist — name & signature", nurse: "Anaesthesia nurse — name & signature", surgeon: "Surgeon — name & signature" },
    page: "Page", of: "of",
    kinds: { event: "Event", drug: "Drug", fluid: "Fluid", airway: "Airway", agent: "Agent", fgf: "FGF", infusion: "Infusion", jet: "Jet", complication: "Complication", position: "Position" },
  },
  bg: {
    title: "Анестезиологичен протокол", patientName: "Име на пациента", patientId: "ЕГН / ИЗ №", patient: "Пациент", risk: "Риск",
    allergy: "Алергия", noKnownAllergy: "Няма известни", times: "Часове", start: "Начало", end: "Край",
    airway: "Осигуряване на дих. пътища", airwayDevice: "Устройство за дих. пътища", access: "Съдов достъп", technique: "Техника и позиция",
    eventLog: "Дневник", eventLogNote: "всичко отбелязано, по реда на настъпване (изтритите записи остават, задраскани)",
    time: "Час", kind: "Вид", entry: "Запис", note: "Бележка", deletedAt: "Изтрито в",
    vitals: "Жизнени показатели", vitalsEveryFive: "на всеки 5 минути", viewTable: "Покажи таблицата", readings: "измервания",
    timetable: "Времева линия", episodes: "Епизоди и предприети действия", drugTotals: "Общо медикаменти", infusionSuffix: "(инфузия)",
    fluidBalance: "Воден баланс", recovery: "Възстановяване от анестезия", transferredTo: "Превежда се в", dose: "Доза", fromCard: "от карта за лечение", episodeLegend: "епизод", fgf: "Поток на свежи газове",
    signatures: { anaesthesiologist: "Анестезиолог — име и подпис", nurse: "Анестезиологична сестра — име и подпис", surgeon: "Хирург — име и подпис" },
    page: "Стр.", of: "от",
    kinds: { event: "Събитие", drug: "Медикамент", fluid: "Течности", airway: "Дих. път", agent: "Анестетик", fgf: "Поток на свежи газове", infusion: "Инфузия", jet: "Джет", complication: "Усложнение", position: "Позиция" },
  },
}

export const recordLabels = (locale: string | null | undefined): RecordLabelSet => (locale === "bg" ? RECORD_LABELS.bg : RECORD_LABELS.en)
