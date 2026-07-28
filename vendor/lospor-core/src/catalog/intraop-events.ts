// INTRAOP_EVENT — clinical event categories (IntraopTimetable.tsx
// CLINICAL_EVENT_CATS), including complications (isComplication: true).
export const CLINICAL_EVENT_CATS: {
  cat: string
  color: string
  isComplication?: boolean
  events: { label: string; labelBg: string; color: string }[]
}[] = [
  { cat: "Airway", color: "#6366f1", events: [
    { label: "Induction", labelBg: "Увод", color: "#3b82f6" }, { label: "Mask vent", labelBg: "Маскова вентилация", color: "#0891b2" }, { label: "Intubated", labelBg: "Интубация", color: "#6366f1" },
    { label: "LMA in", labelBg: "Поставяне на ларингеална маска", color: "#6366f1" }, { label: "Extubated", labelBg: "Екстубация", color: "#22c55e" }, { label: "Failed intubation", labelBg: "Неуспешна интубация", color: "#ef4444" },
    { label: "Airway exchange", labelBg: "Смяна на дихателното устройство", color: "#f97316" }, { label: "DLT placed", labelBg: "Поставяне на двулуменна тръба", color: "#6366f1" },
  ]},
  { cat: "Regional", color: "#a855f7", events: [
    { label: "Spinal in", labelBg: "Спинална анестезия", color: "#a855f7" }, { label: "Epidural in", labelBg: "Поставяне на епидурален катетър", color: "#a855f7" }, { label: "CSE", labelBg: "Комбинирана спинално-епидурална анестезия (CSE)", color: "#a855f7" },
    { label: "Block done", labelBg: "Извършен регионален блок", color: "#8b5cf6" }, { label: "LA top-up", labelBg: "Допълнителен болус локален анестетик", color: "#8b5cf6" }, { label: "Spinal removed", labelBg: "Отстранен спинален катетър", color: "#64748b" },
    { label: "Epidural removed", labelBg: "Отстранен епидурален катетър", color: "#64748b" },
  ]},
  { cat: "Access", color: "#f59e0b", events: [
    { label: "Art line in", labelBg: "Поставяне на артериална линия", color: "#f59e0b" }, { label: "CVC in", labelBg: "Поставяне на централен венозен катетър (ЦВК)", color: "#f59e0b" }, { label: "PA cath", labelBg: "Поставяне на катетър в белодробната артерия", color: "#d97706" },
    { label: "PICC", labelBg: "Поставяне на PICC катетър", color: "#d97706" }, { label: "IO access", labelBg: "Интраосален достъп", color: "#d97706" },
  ]},
  { cat: "Surgical", color: "#ef4444", events: [
    { label: "Positioned", labelBg: "Позициониране", color: "#64748b" }, { label: "Incision", labelBg: "Оперативен разрез", color: "#ef4444" }, { label: "Procedure started", labelBg: "Начало на процедурата", color: "#ef4444" },
    { label: "Procedure ended", labelBg: "Край на процедурата", color: "#22c55e" }, { label: "Tourniquet on", labelBg: "Турникет надут", color: "#f97316" }, { label: "Tourniquet off", labelBg: "Турникет отпуснат", color: "#22c55e" },
    { label: "Closure", labelBg: "Затваряне на оперативната рана", color: "#22c55e" },
  ]},
  { cat: "Transfer", color: "#22c55e", events: [
    { label: "To PACU", labelBg: "Към зала за събуждане (PACU)", color: "#22c55e" }, { label: "To ICU", labelBg: "Към ОАИЛ (ICU)", color: "#f97316" }, { label: "To HDU", labelBg: "Към звено за интензивно наблюдение (HDU)", color: "#f59e0b" }, { label: "To ward", labelBg: "Към отделение", color: "#22c55e" },
  ]},
  { cat: "Complications", color: "#ef4444", isComplication: true, events: [
    { label: "Hypotension", labelBg: "Хипотония", color: "#ef4444" }, { label: "Hypertension", labelBg: "Хипертония", color: "#ef4444" }, { label: "Bradycardia", labelBg: "Брадикардия", color: "#ef4444" },
    { label: "Tachycardia", labelBg: "Тахикардия", color: "#ef4444" }, { label: "Cardiac arrest", labelBg: "Сърдечен арест", color: "#ef4444" }, { label: "Hypoxia / desaturation", labelBg: "Хипоксия / десатурация", color: "#ef4444" },
    { label: "Laryngospasm", labelBg: "Ларингоспазъм", color: "#ef4444" }, { label: "Bronchospasm", labelBg: "Бронхоспазъм", color: "#ef4444" }, { label: "Aspiration", labelBg: "Белодробна аспирация", color: "#ef4444" },
    { label: "Anaphylaxis / allergic reaction", labelBg: "Анафилаксия / алергична реакция", color: "#ef4444" }, { label: "Drug error", labelBg: "Медикаментозна грешка", color: "#ef4444" }, { label: "LAST", labelBg: "Системна токсичност на локалните анестетици (LAST)", color: "#ef4444" },
    { label: "Massive haemorrhage", labelBg: "Масивна кръвозагуба", color: "#ef4444" }, { label: "Awareness under anaesthesia", labelBg: "Будност по време на анестезия", color: "#ef4444" },
  ]},
]
