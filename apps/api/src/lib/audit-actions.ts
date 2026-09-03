/**
 * Append-only action codes for the Hospital audit trail.
 *
 * This API registry is also the display contract for Hospital Web and PWA.
 * Clients must use the bilingual labels returned by the audit endpoint rather
 * than maintaining a second action list that can drift from persisted data.
 * Codes may be added and labels may be improved, but a persisted code must
 * never be renamed or reused for a different event.
 */
export type AuditActionCategory =
  | "ACCOUNT"
  | "AUTHENTICATION"
  | "CASE"
  | "CENTRAL"
  | "CLINICAL_RULES"
  | "INSTITUTION"
  | "MAINTENANCE"
  | "RESEARCH"
  | "SECURITY"

export type AuditActionDefinition = Readonly<{
  code: string
  category: AuditActionCategory
  labels: Readonly<{ bg: string; en: string }>
}>

function defineAuditActions<const T extends readonly AuditActionDefinition[]>(actions: T): T {
  return actions
}

export const AUDIT_ACTION_REGISTRY = defineAuditActions([
  { code: "ACCOUNT_ACTIVATE", category: "ACCOUNT", labels: { bg: "Активиран профил", en: "Account activated" } },
  { code: "ACCOUNT_ANONYMISED", category: "ACCOUNT", labels: { bg: "Анонимизиран профил", en: "Account anonymised" } },
  { code: "ACCOUNT_DELETE_REQUEST", category: "ACCOUNT", labels: { bg: "Заявено изтриване на профил", en: "Account deletion requested" } },
  { code: "ACCOUNT_PROVISION", category: "ACCOUNT", labels: { bg: "Създаден профил", en: "Account created" } },
  { code: "ADMIN_ACCOUNT_AUTHORITY_CHANGE", category: "ACCOUNT", labels: { bg: "Променени права на профил", en: "Account authority changed" } },
  { code: "ADMIN_ACCOUNT_DELETE", category: "ACCOUNT", labels: { bg: "Профилът е поставен за изтриване", en: "Account scheduled for deletion" } },
  { code: "ADMIN_ACCOUNT_DEMOTE", category: "ACCOUNT", labels: { bg: "Понижен от администратор", en: "Demoted from administrator" } },
  { code: "ADMIN_ACCOUNT_PROMOTE", category: "ACCOUNT", labels: { bg: "Повишен до администратор", en: "Promoted to administrator" } },
  { code: "ADMIN_ACCOUNT_REACTIVATE", category: "ACCOUNT", labels: { bg: "Възстановен спрян профил", en: "Suspended account reactivated" } },
  { code: "ADMIN_ACCOUNT_RESTORE", category: "ACCOUNT", labels: { bg: "Възстановен профил за възстановяване на достъпа", en: "Account restored for recovery" } },
  { code: "ADMIN_ACCOUNT_SUSPEND", category: "ACCOUNT", labels: { bg: "Спрян профил", en: "Account suspended" } },
  { code: "HOD_ROLE_REQUEST_APPROVE", category: "ACCOUNT", labels: { bg: "Одобрена заявка за началник отделение", en: "Head-of-department request approved" } },
  { code: "HOD_ROLE_REQUEST_REJECT", category: "ACCOUNT", labels: { bg: "Отказана заявка за началник отделение", en: "Head-of-department request rejected" } },
  { code: "HOSPITAL_APPLIANCE_ADMIN_CREATED", category: "ACCOUNT", labels: { bg: "Създаден първоначален администратор на инсталацията", en: "Initial appliance administrator created" } },
  { code: "HOSPITAL_APPLIANCE_OPERATOR_INITIALIZE", category: "ACCOUNT", labels: { bg: "Инициализиран оператор на инсталацията", en: "Appliance operator initialized" } },
  { code: "HOSPITAL_APPLIANCE_OPERATOR_RECONCILE", category: "ACCOUNT", labels: { bg: "Съгласувани данни за оператора на инсталацията", en: "Appliance operator reconciled" } },
  { code: "HOSPITAL_APPLIANCE_OPERATOR_ROTATE", category: "ACCOUNT", labels: { bg: "Подменени данни за оператора на инсталацията", en: "Appliance operator credential rotated" } },
  { code: "HOSPITAL_APPLIANCE_OPERATOR_TRANSFER", category: "ACCOUNT", labels: { bg: "Прехвърлена ролята на оператор на инсталацията", en: "Appliance operator transferred" } },
  { code: "HOSPITAL_ACCOUNT_ACTIVATED", category: "ACCOUNT", labels: { bg: "Активиран болничен профил", en: "Hospital account activated" } },
  { code: "HOSPITAL_ACCOUNT_CREATED", category: "ACCOUNT", labels: { bg: "Създаден болничен профил", en: "Hospital account created" } },
  { code: "HOSPITAL_ACCOUNT_USERNAME_CHANGED", category: "ACCOUNT", labels: { bg: "Променено потребителско име", en: "Hospital username changed" } },
  { code: "HOSPITAL_USER_CREATE", category: "ACCOUNT", labels: { bg: "Създаден потребител от администратор", en: "Administrator created a user" } },
  { code: "LEGAL_ACCEPTANCE_RECORD", category: "ACCOUNT", labels: { bg: "Приети правни документи", en: "Legal documents accepted" } },
  { code: "PROFILE_CORRECTION", category: "ACCOUNT", labels: { bg: "Коригиран профил", en: "Profile corrected" } },
  { code: "ROLE_REQUEST_SUBMIT", category: "ACCOUNT", labels: { bg: "Подадена заявка за роля", en: "Role request submitted" } },
  { code: "USER_APPROVE", category: "ACCOUNT", labels: { bg: "Одобрен потребител", en: "User approved" } },

  { code: "ACCOUNT_ACTIVATION_TOKEN_REISSUE", category: "AUTHENTICATION", labels: { bg: "Издадена нова връзка за активиране", en: "Activation link reissued" } },
  { code: "ADMIN_MFA_ENROLL", category: "AUTHENTICATION", labels: { bg: "Включена двустъпкова проверка на администратор", en: "Administrator two-step verification enrolled" } },
  { code: "ADMIN_MFA_RECOVERY_CODE_USE", category: "AUTHENTICATION", labels: { bg: "Използван код за възстановяване на администратор", en: "Administrator recovery code used" } },
  { code: "HOSPITAL_ACCOUNT_ACTIVATION_ISSUED", category: "AUTHENTICATION", labels: { bg: "Издадена връзка за активиране", en: "Activation link issued" } },
  { code: "HOSPITAL_ACCOUNT_ACTIVATION_REISSUED", category: "AUTHENTICATION", labels: { bg: "Издадена нова връзка за активиране", en: "Activation link reissued" } },
  { code: "HOSPITAL_ACCOUNT_RECOVERY_CONSUMED", category: "AUTHENTICATION", labels: { bg: "Използвана връзка за възстановяване", en: "Recovery link used" } },
  { code: "HOSPITAL_ACCOUNT_RECOVERY_ISSUED", category: "AUTHENTICATION", labels: { bg: "Издадена връзка за възстановяване", en: "Recovery link issued" } },
  { code: "PASSWORD_CHANGE", category: "AUTHENTICATION", labels: { bg: "Променена парола", en: "Password changed" } },
  { code: "PASSWORD_RECOVERY", category: "AUTHENTICATION", labels: { bg: "Възстановена парола", en: "Password recovered" } },
  { code: "PASSWORD_RECOVERY_TOKEN_ISSUE", category: "AUTHENTICATION", labels: { bg: "Издадена връзка за възстановяване на парола", en: "Password recovery link issued" } },
  { code: "SESSION_REVOKE", category: "AUTHENTICATION", labels: { bg: "Прекратена сесия", en: "Session revoked" } },
  { code: "SESSION_REVOKE_OTHERS", category: "AUTHENTICATION", labels: { bg: "Прекратени други сесии", en: "Other sessions revoked" } },

  { code: "CASE_CENTRAL_EXPORT_DECISION", category: "CENTRAL", labels: { bg: "Променено решение за изпращане към Central", en: "Central export decision changed" } },
  { code: "CASE_CENTRAL_DELIVERY_ACTION", category: "CENTRAL", labels: { bg: "Променено изпращане на случай към Central", en: "Central case delivery changed" } },
  { code: "HOSPITAL_CENTRAL_BATCH_RETRY", category: "CENTRAL", labels: { bg: "Повторен Central пакет", en: "Central batch retried" } },
  { code: "HOSPITAL_CENTRAL_CLINICAL_POLICY_UPDATE", category: "CENTRAL", labels: { bg: "Променена клинична политика за Central", en: "Central clinical policy changed" } },
  { code: "HOSPITAL_CENTRAL_TRANSPORT_CONFIGURE", category: "CENTRAL", labels: { bg: "Конфигурирана връзка с Central", en: "Central transport configured" } },

  // An import is data the hospital system proposed, not the clinician. The
  // trail has to show a value entered the record as a proposal they accepted,
  // rather than as something they typed.
  { code: "EHR_IMPORT_VIEWED", category: "CASE", labels: { bg: "Прегледани данни от болничната система", en: "Hospital system data reviewed" } },
  { code: "EHR_IMPORT_REVIEWED", category: "CASE", labels: { bg: "Решение по данни от болничната система", en: "Hospital system data decided" } },
  { code: "CASE_CONFLICT_OVERRIDE", category: "CASE", labels: { bg: "Преодолян конфликт при запис", en: "Save conflict overridden" } },
  { code: "CASE_CREATE", category: "CASE", labels: { bg: "Създаден случай", en: "Case created" } },
  { code: "CASE_DELETE", category: "CASE", labels: { bg: "Изтрит случай", en: "Case deleted" } },
  { code: "CASE_EVENT_ADD", category: "CASE", labels: { bg: "Добавено събитие към случай", en: "Case event added" } },
  { code: "CASE_EVENT_DELETE", category: "CASE", labels: { bg: "Изтрито събитие от случай", en: "Case event deleted" } },
  { code: "CASE_EVENT_EDIT", category: "CASE", labels: { bg: "Редактирано събитие в случай", en: "Case event edited" } },
  { code: "CASE_FINALIZED", category: "CASE", labels: { bg: "Финализиран случай", en: "Case finalised" } },
  { code: "CASE_PATIENT_LINK_CORRECTED", category: "CASE", labels: { bg: "Коригирана връзка на пациент", en: "Patient link corrected" } },
  { code: "CASE_TRANSFER_ACCEPT", category: "CASE", labels: { bg: "Прието предаване на случай", en: "Case handover accepted" } },
  { code: "CASE_TRANSFER_ASSIGN", category: "CASE", labels: { bg: "Преназначен случай", en: "Case reassigned" } },
  { code: "CASE_TRANSFER_CANCEL", category: "CASE", labels: { bg: "Оттеглено предаване на случай", en: "Case handover withdrawn" } },
  { code: "CASE_TRANSFER_DECLINE", category: "CASE", labels: { bg: "Отказано предаване на случай", en: "Case handover declined" } },
  { code: "CASE_TRANSFER_REQUEST", category: "CASE", labels: { bg: "Заявено предаване на случай", en: "Case handover requested" } },
  { code: "CASE_UNFINALIZED", category: "CASE", labels: { bg: "Отменено финализиране на случай", en: "Case finalisation reversed" } },
  { code: "CASE_UPDATE", category: "CASE", labels: { bg: "Обновен случай", en: "Case updated" } },
  { code: "INTRAOP_TIME_ANOMALY_REPAIRED", category: "CASE", labels: { bg: "Коригирана времева аномалия в интраоперативно събитие", en: "Intraoperative event time anomaly repaired" } },
  { code: "RELATIONAL_SYNC_FAILED", category: "CASE", labels: { bg: "Неуспешна синхронизация на данните за случай", en: "Case data synchronisation failed" } },

  { code: "CLINICAL_BUNDLED_BASELINE_PROVISION", category: "CLINICAL_RULES", labels: { bg: "Инсталиран базов набор от клинични правила", en: "Bundled clinical baseline installed" } },
  { code: "CLINICAL_RULESET_CREATE", category: "CLINICAL_RULES", labels: { bg: "Създаден набор от клинични правила", en: "Clinical ruleset created" } },
  { code: "CLINICAL_RULESET_DEV_RESET", category: "CLINICAL_RULES", labels: { bg: "Нулирани клинични правила за разработка", en: "Development clinical rules reset" } },
  { code: "CLINICAL_RULESET_PEDIATRIC_DRUG_REPLACE", category: "CLINICAL_RULES", labels: { bg: "Заменени педиатрични лекарствени профили", en: "Pediatric medication profiles replaced" } },
  { code: "CLINICAL_RULESET_PRUNE", category: "CLINICAL_RULES", labels: { bg: "Премахнат надживян набор от клинични правила", en: "Superseded clinical ruleset removed" } },
  { code: "CLINICAL_RULESET_PUBLISH", category: "CLINICAL_RULES", labels: { bg: "Публикуван набор от клинични правила", en: "Clinical ruleset published" } },
  { code: "CLINICAL_RULESET_PUBLISH_AND_SELECT", category: "CLINICAL_RULES", labels: { bg: "Публикуван и избран набор от клинични правила", en: "Clinical ruleset published and selected" } },
  { code: "CLINICAL_RULESET_RULE_DELETE", category: "CLINICAL_RULES", labels: { bg: "Изтрито клинично правило", en: "Clinical rule deleted" } },
  { code: "CLINICAL_RULESET_RULE_UPSERT", category: "CLINICAL_RULES", labels: { bg: "Запазено клинично правило", en: "Clinical rule saved" } },
  { code: "CLINICAL_RULESET_SELECT", category: "CLINICAL_RULES", labels: { bg: "Избран набор от клинични правила", en: "Clinical ruleset selected" } },
  { code: "CLINICAL_RULESET_SELECTION_CLEAR", category: "CLINICAL_RULES", labels: { bg: "Премахнат избор на клинични правила", en: "Clinical ruleset selection cleared" } },

  { code: "INSTITUTION_CHANGE_APPROVE", category: "INSTITUTION", labels: { bg: "Одобрена смяна на лечебно заведение", en: "Institution change approved" } },
  { code: "INSTITUTION_CHANGE_REJECT", category: "INSTITUTION", labels: { bg: "Отказана смяна на лечебно заведение", en: "Institution change rejected" } },
  { code: "INSTITUTION_CHANGE_REQUEST_SUBMIT", category: "INSTITUTION", labels: { bg: "Подадена заявка за смяна на лечебно заведение", en: "Institution change requested" } },
  { code: "INSTITUTION_CHANGE_SELF_LEAVE", category: "INSTITUTION", labels: { bg: "Напуснато лечебно заведение", en: "Institution left" } },
  { code: "HOSPITAL_INSTALLATION_INSTITUTION_CREATE", category: "INSTITUTION", labels: { bg: "Създадено лечебно заведение на инсталацията", en: "Appliance institution created" } },
  { code: "HOSPITAL_INSTALLATION_INSTITUTION_UPDATE", category: "INSTITUTION", labels: { bg: "Променено лечебно заведение на инсталацията", en: "Appliance institution changed" } },

  { code: "maintenance.seed_option_library.blocked", category: "MAINTENANCE", labels: { bg: "Блокирано обновяване на библиотеката с опции", en: "Option-library refresh blocked" } },
  { code: "maintenance.seed_option_library.error", category: "MAINTENANCE", labels: { bg: "Неуспешно обновяване на библиотеката с опции", en: "Option-library refresh failed" } },
  { code: "maintenance.seed_option_library.success", category: "MAINTENANCE", labels: { bg: "Обновена библиотека с опции", en: "Option library refreshed" } },

  { code: "HOSPITAL_OMOP_EXPORT_APPROVE", category: "RESEARCH", labels: { bg: "Одобрен OMOP експорт", en: "OMOP export approved" } },
  { code: "HOSPITAL_RESEARCH_GRANT_ISSUE", category: "RESEARCH", labels: { bg: "Издадено болнично разрешение за изследователски достъп", en: "Hospital research grant issued" } },
  { code: "HOSPITAL_RESEARCH_GRANT_REVOKE", category: "RESEARCH", labels: { bg: "Отнето болнично разрешение за изследователски достъп", en: "Hospital research grant revoked" } },
  { code: "HOSPITAL_RESEARCH_GRANT_SUPERSEDE", category: "RESEARCH", labels: { bg: "Заменено болнично разрешение за изследователски достъп", en: "Hospital research grant superseded" } },
  { code: "RESEARCH_BENCHMARK", category: "RESEARCH", labels: { bg: "Изчислен изследователски показател", en: "Research benchmark calculated" } },
  { code: "RESEARCH_CASE_QUERY", category: "RESEARCH", labels: { bg: "Изпълнена заявка за изследователски случаи", en: "Research case query run" } },
  { code: "RESEARCH_CASE_VIEW", category: "RESEARCH", labels: { bg: "Прегледан изследователски случай", en: "Research case viewed" } },
  { code: "RESEARCH_COHORT_CREATE", category: "RESEARCH", labels: { bg: "Създадена изследователска кохорта", en: "Research cohort created" } },
  { code: "RESEARCH_COHORT_DELETE", category: "RESEARCH", labels: { bg: "Изтрита изследователска кохорта", en: "Research cohort deleted" } },
  { code: "RESEARCH_COHORT_UPDATE", category: "RESEARCH", labels: { bg: "Обновена изследователска кохорта", en: "Research cohort updated" } },
  { code: "RESEARCH_COMPARE", category: "RESEARCH", labels: { bg: "Сравнени изследователски кохорти", en: "Research cohorts compared" } },
  { code: "RESEARCH_EXPORT_CREATE", category: "RESEARCH", labels: { bg: "Създаден изследователски експорт", en: "Research export created" } },
  { code: "RESEARCH_EXPORT_DOWNLOAD", category: "RESEARCH", labels: { bg: "Изтеглен изследователски експорт", en: "Research export downloaded" } },
  { code: "RESEARCH_GRANT_CREATE", category: "RESEARCH", labels: { bg: "Създадено разрешение за изследователски достъп", en: "Research access grant created" } },
  { code: "RESEARCH_GRANT_REVOKE", category: "RESEARCH", labels: { bg: "Отнето разрешение за изследователски достъп", en: "Research access grant revoked" } },
  { code: "RESEARCH_GRANT_UPDATE", category: "RESEARCH", labels: { bg: "Променено разрешение за изследователски достъп", en: "Research access grant changed" } },
  { code: "RESEARCH_QUERY", category: "RESEARCH", labels: { bg: "Изпълнена изследователска заявка", en: "Research query run" } },
  { code: "RESEARCH_SELF_AUTHORIZE", category: "RESEARCH", labels: { bg: "Самооторизиран изследователски достъп", en: "Research access self-authorised" } },

  { code: "AI_ADVISE", category: "SECURITY", labels: { bg: "Използван съвет от ИИ", en: "AI advice used" } },
  // The two image routes send a photograph to an external provider. No text
  // redaction is possible on an image, so these are the highest-exposure AI
  // actions in the system and previously recorded nothing on success.
  { code: "AI_LAB_SCAN", category: "SECURITY", labels: { bg: "Сканирано изображение от лабораторен резултат с ИИ", en: "Laboratory report image scanned with AI" } },
  { code: "AI_VITALS_SCAN", category: "SECURITY", labels: { bg: "Сканирано изображение от монитор с ИИ", en: "Monitor image scanned with AI" } },
  { code: "HOSPITAL_EHR_TRANSPORT_CREDENTIAL_REMOVE", category: "SECURITY", labels: { bg: "Премахнати данни за достъп за преноса на ЕЗД", en: "EHR transport credential removed" } },
  { code: "HOSPITAL_EHR_TRANSPORT_CREDENTIAL_REPLACE", category: "SECURITY", labels: { bg: "Подменени данни за достъп за преноса на ЕЗД", en: "EHR transport credential replaced" } },
  { code: "HOSPITAL_EHR_LAB_CODE_MAP", category: "SECURITY", labels: { bg: "Съпоставен лабораторен код от ЕЗД", en: "EHR laboratory code mapped" } },
  { code: "HOSPITAL_EHR_LAB_CODE_UNMAP", category: "SECURITY", labels: { bg: "Премахната съпоставка на лабораторен код от ЕЗД", en: "EHR laboratory code mapping removed" } },
  { code: "HOSPITAL_EHR_TRANSPORT_POLICY_UPDATE", category: "SECURITY", labels: { bg: "Променена политика за преноса на ЕЗД", en: "EHR transport policy changed" } },
  { code: "HOSPITAL_EXTERNAL_AI_CREDENTIAL_REMOVE", category: "SECURITY", labels: { bg: "Премахнати данни за достъп до външен ИИ", en: "External AI credential removed" } },
  { code: "HOSPITAL_EXTERNAL_AI_CREDENTIAL_REPLACE", category: "SECURITY", labels: { bg: "Подменени данни за достъп до външен ИИ", en: "External AI credential replaced" } },
  { code: "HOSPITAL_EXTERNAL_AI_POLICY_UPDATE", category: "SECURITY", labels: { bg: "Променена политика за външен ИИ", en: "External AI policy changed" } },
  { code: "HOSPITAL_GUIDANCE_POLICY_UPDATE", category: "SECURITY", labels: { bg: "Променена политика за изчислителни насоки", en: "Calculation-guidance policy changed" } },
  { code: "HOSPITAL_PATIENT_IDENTIFIER_POLICY_UPDATE", category: "SECURITY", labels: { bg: "Променена политика за национален идентификатор (ЕГН)", en: "National-identifier (ЕГН) policy changed" } },
  { code: "PII_BLOCKED", category: "SECURITY", labels: { bg: "Блокирани лични данни", en: "Personal data blocked" } },
] as const)

export type AuditActionCode = (typeof AUDIT_ACTION_REGISTRY)[number]["code"]

const ACTION_CODE_SET: ReadonlySet<string> = new Set(
  AUDIT_ACTION_REGISTRY.map(action => action.code),
)

export function isAuditActionCode(value: string): value is AuditActionCode {
  return ACTION_CODE_SET.has(value)
}
