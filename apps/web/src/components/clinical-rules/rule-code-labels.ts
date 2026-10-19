import { administrationRouteLabel, normalizeAdministrationRoute } from "@lospor/core/clinical-rule-vocabulary"

/**
 * Words for the codes the clinical-rules screens show (2026-10-18): they were
 * printed as stored -- AUTO, MANUAL_NO_PROFILE, INTRATHECAL -- in English and
 * in Bulgarian alike. Anything unlisted is shown as stored.
 */
type Locale = "en" | "bg"
type Table = Readonly<Record<string, readonly [en: string, bg: string]>>

const AVAILABILITY: Table = {
  AUTO: ["Automatic", "Автоматично"],
  MANUAL: ["Manual", "Ръчно"],
  LOCAL: ["Local policy", "Местна политика"],
  HIDDEN: ["Hidden", "Скрит"],
}

const POLICY_DISPOSITION: Table = {
  AUTOFILL_PROFILE: ["Autofilled profile", "Профил с автоматично попълване"],
  MANUAL_PROFILE: ["Manual profile", "Профил с ръчно въвеждане"],
  MANUAL_NO_PROFILE: ["Manual, no profile", "Ръчно, без профил"],
  FORMULARY_REQUIRED: ["Formulary required", "Изисква се местен формуляр"],
  SCHEMA_BLOCKED: ["Blocked by the schema", "Блокирано от схемата"],
  EXCLUDED: ["Excluded", "Изключено"],
  PENDING_RESEARCH: ["Research pending", "Предстои проучване"],
}

const REVIEW_STATUS: Table = {
  PENDING: ["Review pending", "Предстои преглед"],
  EVIDENCE_REVIEWED: ["Evidence reviewed", "Доказателствата са прегледани"],
  LOCAL_POLICY_REQUIRED: ["Local policy required", "Изисква се местна политика"],
  APPROVED: ["Approved", "Одобрено"],
}

const WORDS: Table = {
  DRUG: ["Drug", "Медикамент"],
  INFUSION: ["Infusion", "Инфузия"],
  FLUID: ["Fluid", "Течност"],
  DRUG_POLICY: ["Drug policy", "Политика за медикамента"],
  DIRECT_ENTRY: ["direct entry", "пряко въвеждане"],
  DEFAULT: ["default", "по подразбиране"],
}

const TABLES = { availability: AVAILABILITY, policyDisposition: POLICY_DISPOSITION, reviewStatus: REVIEW_STATUS, word: WORDS }

export function ruleCodeLabel(group: keyof typeof TABLES, code: string | null | undefined, locale: string): string {
  if (!code) return ""
  const entry = TABLES[group][code]
  return entry ? entry[locale.startsWith("bg") ? 1 : 0] : code
}

/** A route by its name ("Intrathecal" / "Интратекално"), not its code. */
export function ruleRouteLabel(route: string, locale: string): string {
  const code = normalizeAdministrationRoute(route)
  return code ? administrationRouteLabel(code, (locale.startsWith("bg") ? "bg" : "en") as Locale) : route
}

export const ruleRoutesLabel = (routes: readonly string[], locale: string) => routes.map(route => ruleRouteLabel(route, locale)).join(", ")
