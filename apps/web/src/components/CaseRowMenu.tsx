"use client"

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react"
import { useRouter } from "next/navigation"
import { MoreHorizontal } from "lucide-react"
import { calendarDateKey, parseCalendarDateKey, type CalendarDate } from "@lospor/core/time-entry"
import { calendarDayKey } from "@lospor/core/dashboard-date-scope"
import { DateWheel } from "@/components/time/DateWheel"
import { refusalReason } from "@/lib/server-message"

/**
 * A dashboard row's menu (10.8.0). The actions that can do harm -- delete a
 * draft, mark the procedure cancelled -- are no longer buttons beside the row
 * where a finger lands on them by mistake: they are in here, with the planned
 * date of the operation and the case's anaesthesia nurses.
 */
type Nurse = { id: string; name: string; firstName?: string; lastName?: string; title?: string }

const COPY = {
  bg: { team: "Анестезиологичен екип", teamNone: "Още няма записи.", teamDoctor: "лекар", teamNurse: "сестра", teamJoined: "влиза", teamLeft: "излиза", teamBy: "от", teamReasons: { CREATED: "създава случая", TRANSFER: "предаване на случая", ASSIGNED: "назначена", THEATRE: "през операционната", HANDOVER: "предаване от сестра", SELF: "назначава се сама", REMOVED: "махната", BACKFILL: "от по-ранни записи" } as Record<string, string>, close: "Затвори", failed: "Не се запази.", take: "Назначи ме на случая", takeFailed: "Не успяхте да се назначите: случаят вече има сестра или е затворен.", menu: "Действия със случая", planned: "Планирана дата на операцията", clear: "Изчисти датата", nurses: "Анестезиологични сестри", none: "Няма анестезиологични сестри в отделението.", save: "Запази", cancel: "Отказ", handover: "Предай на друга сестра", handedOver: "Предадено", day: "Ден", month: "Месец", year: "Година" },
  en: { team: "Anaesthesia team", teamNone: "No entries yet.", teamDoctor: "doctor", teamNurse: "nurse", teamJoined: "joins", teamLeft: "leaves", teamBy: "by", teamReasons: { CREATED: "created the case", TRANSFER: "case handed over", ASSIGNED: "assigned", THEATRE: "through the theatre", HANDOVER: "handed over by a nurse", SELF: "put herself on", REMOVED: "removed", BACKFILL: "from earlier records" } as Record<string, string>, close: "Close", failed: "Could not be saved.", take: "Put me on this case", takeFailed: "Could not put you on the case: it already has a nurse or is closed.", menu: "Case actions", planned: "Planned operation date", clear: "Clear the date", nurses: "Anaesthesia nurses", none: "No anaesthesia nurses in the department.", save: "Save", cancel: "Cancel", handover: "Hand over to another nurse", handedOver: "Handed over", day: "Day", month: "Month", year: "Year" },
} as const
type Copy = (typeof COPY)[keyof typeof COPY]

export function CaseRowMenu({ caseId, locale, plannedSurgeryDate, canPlan, canAssignNurses, canHandOverToNurse = false, canTakeCase = false, children }: {
  caseId: string
  locale: string
  plannedSurgeryDate: string | null
  canPlan: boolean
  canAssignNurses: boolean
  /** An anaesthesia nurse passing her place in the case to another nurse. */
  canHandOverToNurse?: boolean
  /** A nurse putting herself on a case that has no nurse. */
  canTakeCase?: boolean
  /** The row's own harmful actions (delete, cancel), shown inside the menu. */
  children?: ReactNode
}) {
  const copy = COPY[locale === "bg" ? "bg" : "en"]
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [dialog, setDialog] = useState<"date" | "nurses" | "handover" | "team" | null>(null)
  const takeCase = async () => {
    let ok = false
    let why: string | null = null
    try {
      const response = await fetch(`/api/cases/${caseId}/nurses`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ take: true }) })
      ok = response.ok
      if (!ok) why = await refusalReason(response)
    } catch { ok = false }
    // The row is refreshed after a refusal too, so it stops offering an action somebody else just used.
    router.refresh()
    if (!ok) window.alert(why ? `${copy.takeFailed} ${why}` : copy.takeFailed)
  }
  const ref = useRef<HTMLDivElement | null>(null)
  const panel = useRef<HTMLDivElement | null>(null)
  const trigger = useRef<HTMLButtonElement | null>(null)
  // Fixed to the screen, not the row: the dashboard card clips anything that overflows it (10.8.0).
  const [place, setPlace] = useState<CSSProperties>({ visibility: "hidden" })

  useLayoutEffect(() => {
    if (!open || !panel.current || !trigger.current) return
    const button = trigger.current.getBoundingClientRect()
    const height = panel.current.offsetHeight
    const viewport = window.visualViewport?.height ?? window.innerHeight
    const right = Math.max(8, window.innerWidth - button.right)
    const below = button.bottom + 4 + height <= viewport - 8
    setPlace(below ? { right, top: button.bottom + 4 } : { right, top: Math.max(8, button.top - 4 - height) })
  }, [open])
  useEffect(() => {
    if (!open) return
    // A dialog of the menu (the cancel dialog is portaled to the body) is not "outside": pressing in it must not
    // close the menu, which would take the dialog with it before it is filled in.
    const close = (event: PointerEvent) => {
      if (event.target instanceof Element && event.target.closest('[role="dialog"]')) return
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false)
    }
    // A fixed menu would drift from its row on scroll: scrolling closes it.
    // Not while a dialog of the menu's own is open (cancel, nurses, date): it lives inside the menu, and a scroll
    // within it, or of the page behind it, must not take the dialog away while it is being filled in.
    const closeOnScroll = (event: Event) => {
      if (event.target instanceof Node && ref.current?.contains(event.target)) return
      if (document.querySelector('[role="dialog"][aria-modal="true"]')) return
      setOpen(false)
    }
    window.addEventListener("pointerdown", close, true)
    window.addEventListener("scroll", closeOnScroll, true)
    return () => { window.removeEventListener("pointerdown", close, true); window.removeEventListener("scroll", closeOnScroll, true) }
  }, [open])

  const item = "flex w-full min-h-11 items-center rounded-lg px-3 text-left text-sm font-semibold hover:bg-slate-100 dark:hover:bg-[#2a2a2a]"
  return (
    <div ref={ref} className="relative" onClick={event => event.stopPropagation()}>
      <button ref={trigger} type="button" aria-label={copy.menu} aria-haspopup="menu" aria-expanded={open} data-testid="case-row-menu"
        onClick={() => { setPlace({ visibility: "hidden" }); setOpen(value => !value) }}
        className="flex size-11 items-center justify-center rounded-lg border border-slate-200 dark:border-[#3a3a3a] text-slate-600 dark:text-[#bbb] hover:bg-slate-100 dark:hover:bg-[#2a2a2a]">
        <MoreHorizontal className="h-5 w-5" />
      </button>
      {open ? (
        <div ref={panel} role="menu" style={place} className="fixed z-[60] w-72 rounded-xl border border-slate-200 dark:border-[#3a3a3a] bg-white dark:bg-[#1f1f1f] p-1.5 shadow-xl">
          {canPlan ? <button type="button" role="menuitem" className={item} data-testid="case-row-planned-date" onClick={() => { setOpen(false); setDialog("date") }}>{copy.planned}{plannedSurgeryDate ? ` · ${plannedSurgeryDate.split("-").reverse().join(".")}` : ""}</button> : null}
          {canAssignNurses ? <button type="button" role="menuitem" className={item} data-testid="case-row-nurses" onClick={() => { setOpen(false); setDialog("nurses") }}>{copy.nurses}</button> : null}
          {canTakeCase ? <button type="button" role="menuitem" className={item} data-testid="case-row-take-case" onClick={() => { setOpen(false); void takeCase() }}>{copy.take}</button> : null}
          {canHandOverToNurse ? <button type="button" role="menuitem" className={item} data-testid="case-row-handover-nurse" onClick={() => { setOpen(false); setDialog("handover") }}>{copy.handover}</button> : null}
          <button type="button" role="menuitem" className={item} data-testid="case-row-team" onClick={() => { setOpen(false); setDialog("team") }}>{copy.team}</button>
          {children ? <div className="mt-1 border-t border-slate-100 dark:border-[#2a2a2a] pt-1 flex flex-col gap-1 [&>*]:min-h-11 [&>*]:w-full">{children}</div> : null}
        </div>
      ) : null}
      {dialog === "date" ? (
        <PlannedDateDialog caseId={caseId} value={plannedSurgeryDate} copy={copy} onClose={() => setDialog(null)} onSaved={() => { setDialog(null); router.refresh() }} />
      ) : null}
      {dialog === "handover" ? <HandoverToNurseDialog caseId={caseId} copy={copy} onClose={() => { setDialog(null); router.refresh() }} /> : null}
      {dialog === "team" ? <TeamDialog caseId={caseId} copy={copy} locale={locale} onClose={() => setDialog(null)} /> : null}
      {dialog === "nurses" ? <NursesDialog caseId={caseId} copy={copy} onClose={() => { setDialog(null); router.refresh() }} /> : null}
    </div>
  )
}

type StaffRow = {
  id: string
  kind: "DOCTOR" | "NURSE"
  action: "JOINED" | "LEFT"
  reason: string
  at: string
  user: { id: string; name: string; firstName?: string | null; lastName?: string | null; title?: string | null }
  by: { id: string; name: string; firstName?: string | null; lastName?: string | null; title?: string | null } | null
}

/** The anaesthesia team of the case over time (2026-11-23): who joined and left, and when. Read-only; the history is never changed. */
function TeamDialog({ caseId, copy, locale, onClose }: { caseId: string; copy: Copy; locale: string; onClose: () => void }) {
  const [rows, setRows] = useState<StaffRow[] | null>(null)
  const [why, setWhy] = useState<string | null>(null)
  useEffect(() => {
    void (async () => {
      let response: Response
      try { response = await fetch(`/api/cases/${caseId}/staff`) } catch { setWhy(copy.failed); setRows([]); return }
      if (!response.ok) { setWhy(`${copy.failed} ${await refusalReason(response) ?? ""}`.trim()); setRows([]); return }
      setRows((await response.json()).staff ?? [])
    })()
  }, [caseId, copy.failed])
  const name = (person: { name: string; firstName?: string | null; lastName?: string | null; title?: string | null }) =>
    [person.title, person.firstName, person.lastName].filter(Boolean).join(" ") || person.name
  const when = (value: string) => new Intl.DateTimeFormat(locale === "bg" ? "bg-BG" : "en-GB", { dateStyle: "short", timeStyle: "short" }).format(new Date(value))
  return (
    <Dialog title={copy.team} onClose={onClose}>
      {why ? <p role="alert" className="mb-2 text-sm font-semibold text-red-600">{why}</p> : null}
      {rows === null ? null : rows.length === 0 ? <p className="text-sm text-slate-500">{copy.teamNone}</p> : (
        <ol className="flex max-h-96 flex-col gap-2 overflow-y-auto" data-testid="case-team-history">
          {rows.map(row => (
            <li key={row.id} className="rounded-lg border border-slate-200 dark:border-[#3a3a3a] px-3 py-2 text-sm">
              <p className="font-semibold">{name(row.user)} <span className="font-normal text-slate-500">· {row.kind === "DOCTOR" ? copy.teamDoctor : copy.teamNurse}</span></p>
              <p className="text-slate-600 dark:text-[#bbb]">
                {row.action === "JOINED" ? copy.teamJoined : copy.teamLeft} · {when(row.at)} · {copy.teamReasons[row.reason] ?? row.reason}
                {row.by && row.by.id !== row.user.id ? ` · ${copy.teamBy} ${name(row.by)}` : ""}
              </p>
            </li>
          ))}
        </ol>
      )}
      <button type="button" className="mt-4 min-h-11 w-full rounded-lg border border-slate-300 dark:border-[#4a4a4a] font-semibold" onClick={onClose}>{copy.close}</button>
    </Dialog>
  )
}

function Dialog({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  return (
    <div role="dialog" aria-modal="true" aria-label={title} className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4" onPointerDown={event => { if (event.target === event.currentTarget) onClose() }}>
      <div className="w-full max-w-sm rounded-xl bg-white dark:bg-[#1f1f1f] p-4 shadow-xl">
        <p className="mb-3 text-base font-bold text-slate-900 dark:text-white">{title}</p>
        {children}
      </div>
    </div>
  )
}

function PlannedDateDialog({ caseId, value, copy, onClose, onSaved }: {
  caseId: string
  value: string | null
  copy: Copy
  onClose: () => void
  onSaved: () => void
}) {
  const [date, setDate] = useState<CalendarDate>(() => parseCalendarDateKey(value) ?? parseCalendarDateKey(calendarDayKey(new Date()))!)
  const [busy, setBusy] = useState(false)
  const [why, setWhy] = useState<string | null>(null)
  const save = async (plannedSurgeryDate: string | null) => {
    setBusy(true)
    setWhy(null)
    let response: Response | null = null
    try { response = await fetch(`/api/cases/${caseId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ plannedSurgeryDate }) }) } catch { response = null }
    setBusy(false)
    if (response?.ok) onSaved()
    else setWhy(`${copy.failed}${response ? await refusalReason(response).then(r => r ? ` ${r}` : "") : ""}`)
  }
  return (
    <Dialog title={copy.planned} onClose={onClose}>
      <DateWheel value={date} onChange={setDate} labels={{ day: copy.day, month: copy.month, year: copy.year }} />
      <div className="mt-4 grid grid-cols-2 gap-2">
        <button type="button" className="min-h-11 rounded-lg border border-slate-300 dark:border-[#4a4a4a] font-semibold" onClick={onClose}>{copy.cancel}</button>
        <button type="button" disabled={busy} data-testid="planned-date-save" className="min-h-11 rounded-lg bg-blue-600 text-white font-semibold disabled:opacity-50" onClick={() => void save(calendarDateKey(date))}>{copy.save}</button>
      </div>
      {why ? <p role="alert" className="mt-2 text-sm font-semibold text-red-600">{why}</p> : null}
      {value ? <button type="button" className="mt-2 min-h-11 w-full rounded-lg font-semibold text-slate-500" onClick={() => void save(null)}>{copy.clear}</button> : null}
    </Dialog>
  )
}

function NursesDialog({ caseId, copy, onClose }: { caseId: string; copy: Copy; onClose: () => void }) {
  const [all, setAll] = useState<Nurse[] | null>(null)
  const [assigned, setAssigned] = useState<Set<string>>(new Set())
  useEffect(() => {
    void (async () => {
      const [list, current] = await Promise.all([
        fetch("/api/users/nurses").then(response => response.ok ? response.json() : { nurses: [] }),
        fetch(`/api/cases/${caseId}/nurses`).then(response => response.ok ? response.json() : { nurses: [] }),
      ])
      setAll(list.nurses ?? [])
      setAssigned(new Set((current.nurses ?? []).map((row: { userId: string }) => row.userId)))
    })()
  }, [caseId])
  const [why, setWhy] = useState<string | null>(null)
  const toggle = async (id: string) => {
    const on = assigned.has(id)
    setWhy(null)
    let response: Response
    try { response = await fetch(`/api/cases/${caseId}/nurses`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(on ? { remove: id } : { assign: id }) }) } catch { setWhy(copy.failed); return }
    if (!response.ok) { setWhy(`${copy.failed} ${await refusalReason(response) ?? ""}`.trim()); return }
    const next = await response.json()
    setAssigned(new Set((next.nurses ?? []).map((row: { userId: string }) => row.userId)))
  }
  const name = (nurse: Nurse) => [nurse.title, nurse.firstName, nurse.lastName].filter(Boolean).join(" ") || nurse.name
  return (
    <Dialog title={copy.nurses} onClose={onClose}>
      {all === null ? null : all.length === 0 ? <p className="text-sm text-slate-500">{copy.none}</p> : (
        <div className="flex max-h-80 flex-col gap-1 overflow-y-auto">
          {all.map(nurse => (
            <label key={nurse.id} className="flex min-h-11 items-center gap-3 rounded-lg px-2 hover:bg-slate-100 dark:hover:bg-[#2a2a2a]">
              <input type="checkbox" className="size-5" checked={assigned.has(nurse.id)} onChange={() => void toggle(nurse.id)} data-testid={`case-nurse-${nurse.id}`} />
              <span className="text-sm font-semibold">{name(nurse)}</span>
            </label>
          ))}
        </div>
      )}
      {why ? <p role="alert" className="mt-2 text-sm font-semibold text-red-600">{why}</p> : null}
      <button type="button" className="mt-4 min-h-11 w-full rounded-lg border border-slate-300 dark:border-[#4a4a4a] font-semibold" onClick={onClose}>{copy.save}</button>
    </Dialog>
  )
}

function HandoverToNurseDialog({ caseId, copy, onClose }: { caseId: string; copy: Copy; onClose: () => void }) {
  const [all, setAll] = useState<Nurse[] | null>(null)
  const [done, setDone] = useState(false)
  const [why, setWhy] = useState<string | null>(null)
  useEffect(() => {
    void fetch("/api/users/nurses").then(response => response.ok ? response.json() : { nurses: [] }).then(body => setAll(body.nurses ?? []))
  }, [])
  const handOver = async (id: string) => {
    setWhy(null)
    let response: Response
    try { response = await fetch(`/api/cases/${caseId}/nurses`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ handoverTo: id }) }) } catch { setWhy(copy.failed); return }
    if (response.ok) setDone(true)
    else setWhy(`${copy.failed} ${await refusalReason(response) ?? ""}`.trim())
  }
  const name = (nurse: Nurse) => [nurse.title, nurse.firstName, nurse.lastName].filter(Boolean).join(" ") || nurse.name
  return (
    <Dialog title={copy.handover} onClose={onClose}>
      {done ? <p className="text-sm font-semibold text-emerald-600">{copy.handedOver}</p> : all === null ? null : all.length === 0 ? <p className="text-sm text-slate-500">{copy.none}</p> : (
        <div className="flex max-h-80 flex-col gap-1 overflow-y-auto">
          {all.map(nurse => (
            <button key={nurse.id} type="button" className="flex min-h-11 items-center rounded-lg px-3 text-left text-sm font-semibold hover:bg-slate-100 dark:hover:bg-[#2a2a2a]" onClick={() => void handOver(nurse.id)}>{name(nurse)}</button>
          ))}
        </div>
      )}
      {why ? <p role="alert" className="mt-2 text-sm font-semibold text-red-600">{why}</p> : null}
      <button type="button" className="mt-4 min-h-11 w-full rounded-lg border border-slate-300 dark:border-[#4a4a4a] font-semibold" onClick={onClose}>{copy.cancel}</button>
    </Dialog>
  )
}