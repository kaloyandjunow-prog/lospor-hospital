import type { IntraopMenuAction } from "@lospor/core/intraop-menu"
import type { IntraopEditRefusal } from "@lospor/core/intraop-edits"

export type CellMenuLocale = "bg" | "en"

/** The words of the PWA's cell menu (10.8.0), the same as the web chart's. */
export const CELL_MENU_COPY: Record<CellMenuLocale, {
  labels: Record<IntraopMenuAction, string>
  refusals: Record<IntraopEditRefusal, string>
  done: {
    stopped: (name: string, time: string) => string
    resumed: (name: string, time: string) => string
    fixed: (name: string, time: string) => string
    moved: (name: string, time: string) => string
    deleted: (name: string) => string
    deletedWhole: (name: string) => string
  }
  pair: { question: string; both: string; onlyThis: string }
  wheel: { hours: string; minutes: string }
  undo: string
  undone: string
  redo: string
  redone: string
  /** 10.8.0: a start charted in an earlier cell is asked about at once (as on the web). */
  stillRunning: { question: (title: string, time: string) => string; running: string; stopped: string }
  cancel: string
  confirm: string
}> = {
  bg: {
    labels: {
      stop: "Спри", change_dose: "Промени дозата", change_syringe: "Смени спринцовката/концентрацията",
      switch_agent: "Смени агента", fix_start: "Поправи началото", fix_end: "Поправи края", resume: "Продължи",
      delete_here: "Изтрий", delete_whole: "Изтрий цялото", plan_change: "Планирай промяна", plan_stop: "Планирай спиране",
      remove_planned: "Премахни планираното", repeat_dose: "Повтори дозата", edit: "Редактирай", move: "Премести", delete: "Изтрий",
    },
    refusals: {
      NOT_FOUND: "Записът вече го няма.", NOT_MOVABLE: "Това не се мести.", AFTER_CASE_END: "Не може след края на случая.",
      BEFORE_CASE_START: "Не може преди началото на случая.", DONE_INTO_FUTURE: "Станалото не се мести в бъдещето.",
      START_AFTER_NOW: "Началото на нещо, което тече, не може след „сега“.", NO_END: "Още тече: използвайте „Спри“.",
      PAIR_ORDER: "Турникетът не може да се спусне, преди да е поставен.", TIMELINE: "Това противоречи на останалото във времевата линия.",
    },
    done: {
      stopped: (name, time) => `${name} спрян в ${time}`, resumed: (name, time) => `${name} продължава от ${time}`,
      fixed: (name, time) => `${name} поправен: ${time}`, moved: (name, time) => `${name} преместен в ${time}`,
      deleted: name => `${name} изтрит`, deletedWhole: name => `${name} изтрит изцяло`,
    },
    pair: { question: "Има и „Турникет отпуснат“. Изтриване и на двете?", both: "Изтрий и двете", onlyThis: "Само поставен" },
    wheel: { hours: "Часове", minutes: "Минути" },
    stillRunning: { question: (title, time) => `${title} от ${time} — още тече ли?`, running: "Тече", stopped: "Спряно…" },
    undo: "Отмени", undone: "Отменено", redo: "Повтори", redone: "Повторено", cancel: "Отказ", confirm: "Готово",
  },
  en: {
    labels: {
      stop: "Stop", change_dose: "Change dose", change_syringe: "Change syringe/concentration",
      switch_agent: "Switch agent", fix_start: "Fix start", fix_end: "Fix end", resume: "Resume",
      delete_here: "Delete", delete_whole: "Delete whole", plan_change: "Plan a change", plan_stop: "Plan a stop",
      remove_planned: "Remove planned", repeat_dose: "Repeat dose", edit: "Edit", move: "Move", delete: "Delete",
    },
    refusals: {
      NOT_FOUND: "That entry is gone.", NOT_MOVABLE: "This is not moved.", AFTER_CASE_END: "Not after the case end.",
      BEFORE_CASE_START: "Not before the case start.", DONE_INTO_FUTURE: "What happened is not moved into the future.",
      START_AFTER_NOW: "A running item's start cannot be after now.", NO_END: "Still running: use Stop.",
      PAIR_ORDER: "A tourniquet cannot come off before it went on.", TIMELINE: "That contradicts the rest of the timeline.",
    },
    done: {
      stopped: (name, time) => `${name} stopped at ${time}`, resumed: (name, time) => `${name} resumed at ${time}`,
      fixed: (name, time) => `${name} fixed: ${time}`, moved: (name, time) => `${name} moved to ${time}`,
      deleted: name => `${name} deleted`, deletedWhole: name => `${name} deleted entirely`,
    },
    pair: { question: "Tourniquet off is recorded too. Delete both?", both: "Delete both", onlyThis: "Only Tourniquet on" },
    wheel: { hours: "Hours", minutes: "Minutes" },
    stillRunning: { question: (title, time) => `${title} from ${time} — still running?`, running: "Running", stopped: "Stopped…" },
    undo: "Undo", undone: "Undone", redo: "Redo", redone: "Redone", cancel: "Cancel", confirm: "Done",
  },
}
