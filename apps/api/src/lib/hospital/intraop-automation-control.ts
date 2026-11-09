import type { PrismaClient, Prisma } from "@/generated/prisma/client"
import {
  AUTOMATION_GROUPS,
  DANTROLENE_VIAL_SIZES_MG,
  DEFAULT_HYPERTENSION_BASELINE_PERCENT,
  DEFAULT_VITAL_MIN_CASES,
  DEFAULT_VITAL_TAIL,
  MAX_VITAL_MIN_CASES,
  MIN_VITAL_MIN_CASES,
  VITAL_SIGN_KEYS,
  VITAL_TAIL_STEPS,
  type AutomationGroup,
} from "@lospor/core/intraop-automation"
import { AUTOMATIONS } from "@lospor/core/intraop-suggestions"
import { VITAL_BANDS } from "@lospor/core/vital-questions"
import { readIntraopAutomation, suggestionAcceptance, successionOverviewForStatus } from "@/lib/intraop-automation"

type Db = PrismaClient | Prisma.TransactionClient

/** The days of finished cases the acceptance counts are read over. */
export const ACCEPTANCE_DAYS = 90

const GROUPS: Record<AutomationGroup, { labelEn: string; labelBg: string; detailEn: string; detailBg: string }> = {
  treatmentSuggestions: {
    labelEn: "Treatment cards", labelBg: "Карти за лечение",
    detailEn: "The card or checklist shown after a complication.", detailBg: "Картата или списъкът със стъпки след усложнение.",
  },
  reverseQuestions: {
    labelEn: "Reverse questions", labelBg: "Обратни въпроси",
    detailEn: "A rescue drug, fluid or shock asks about the complication it treats.", detailBg: "Спасителен медикамент, течност или шок пита за усложнението, което лекува.",
  },
  readingQuestions: {
    labelEn: "Reading questions", labelBg: "Въпроси от показания",
    detailEn: "SpO₂, EtCO₂, temperature, the malignant hyperthermia pattern and TOF.", detailBg: "SpO₂, EtCO₂, температура, моделът при малигнена хипертермия и TOF.",
  },
  labQuestions: {
    labelEn: "Laboratory questions", labelBg: "Въпроси от изследвания",
    detailEn: "Results that fall outside their limits.", detailBg: "Резултати извън границите си.",
  },
  reminders: {
    labelEn: "Reminders", labelBg: "Напомняния",
    detailEn: "Preoperative facts, the local anaesthetic maximum, extubation, the end of the procedure, airway questions and Likely now.",
    detailBg: "Предоперативни факти, максимум на местния анестетик, екстубация, край на процедурата, въпроси за дихателния път и „Вероятно сега“.",
  },
  timers: {
    labelEn: "Timed follow-ups", labelBg: "Следене по време",
    detailEn: "Follow-ups after a treatment: arrest, lipid emulsion, anaphylaxis, dantrolene, tourniquet.",
    detailBg: "Следене след лечение: арест, липидна емулсия, анафилаксия, дантролен, турникет.",
  },
}

const SIGNS: Record<string, { labelEn: string; labelBg: string }> = {
  hr: { labelEn: "Heart rate", labelBg: "Пулс" },
  sbp: { labelEn: "Systolic pressure", labelBg: "Систолично налягане" },
  dbp: { labelEn: "Diastolic pressure", labelBg: "Диастолично налягане" },
  map: { labelEn: "Mean pressure", labelBg: "Средно налягане" },
}

/**
 * What the Status SPS page works from (10.2.0): the settings in force, the catalogue Status lists them under
 * (Core's, so a new automation appears without a change here), how each was received over the last
 * `ACCEPTANCE_DAYS` days, and what "Likely now" has learned. Counts only; no case, clinician or patient.
 */
export async function intraopAutomationControlView(db: Db) {
  const [config, acceptance, succession] = await Promise.all([
    readIntraopAutomation(db),
    suggestionAcceptance(db, ACCEPTANCE_DAYS).catch(() => null),
    successionOverviewForStatus(db).catch(() => null),
  ])
  return {
    config,
    groups: AUTOMATION_GROUPS.map(key => ({ key, ...GROUPS[key] })),
    automations: AUTOMATIONS.map(item => ({
      id: item.id, group: item.group, labelEn: item.en, labelBg: item.bg, detailEn: item.detailEn, detailBg: item.detailBg,
    })),
    bands: VITAL_BANDS.map(band => ({ key: band.key, labelEn: band.labelEn, labelBg: band.labelBg })),
    signs: VITAL_SIGN_KEYS.map(key => ({ key, ...SIGNS[key]! })),
    tailSteps: [...VITAL_TAIL_STEPS],
    defaultTail: DEFAULT_VITAL_TAIL,
    defaultMinCases: DEFAULT_VITAL_MIN_CASES,
    minCasesRange: { min: MIN_VITAL_MIN_CASES, max: MAX_VITAL_MIN_CASES },
    vialSizesMg: [...DANTROLENE_VIAL_SIZES_MG],
    hypertensionBaselineDefault: DEFAULT_HYPERTENSION_BASELINE_PERCENT,
    acceptance,
    succession,
  }
}
