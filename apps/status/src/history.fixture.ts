import type { AuditHistoryView } from "./control-plane.js"

export function historyFixture(over: Partial<AuditHistoryView> = {}): AuditHistoryView {
  return {
    rows: [
      { id: "a1", at: "2026-11-09T08:30:00.000Z", action: "INTRAOP_AUTOMATION_UPDATE", category: "SECURITY", labelEn: "Intraoperative suggestion settings changed", labelBg: "Променени настройки за интраоперативните предложения", who: "Status" },
      { id: "a2", at: "2026-11-08T17:05:00.000Z", action: "HOSPITAL_NAME_UPDATE", category: "SECURITY", labelEn: "Hospital name on the record changed", labelBg: "Променено име на болницата в протокола", who: "Dr. <b>Ivan</b> Petrov" },
      { id: "a3", at: "2026-11-01T09:00:00.000Z", action: "HOSPITAL_LOGO_UPDATE", category: "SECURITY", labelEn: "Hospital logo changed", labelBg: "Променено лого на болницата", who: null },
    ],
    total: 120,
    page: 1,
    pageSize: 50,
    categories: ["ACCOUNT", "CENTRAL", "SECURITY"],
    actions: [
      { code: "INTRAOP_AUTOMATION_UPDATE", category: "SECURITY", labelEn: "Intraoperative suggestion settings changed", labelBg: "Променени настройки за интраоперативните предложения" },
      { code: "ACCOUNT_PROVISION", category: "ACCOUNT", labelEn: "Account created", labelBg: "Създаден профил" },
    ],
    ...over,
  }
}
