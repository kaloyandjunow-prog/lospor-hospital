"use client"

import { useEffect, useRef, useState } from "react"
import { isNurseAccountRole } from "@lospor/core/clinical-roles"
import { useRouter } from "next/navigation"
import { Users, X } from "lucide-react"
import { calendarDayKey } from "@lospor/core/dashboard-date-scope"
import { calendarDateKey, parseCalendarDateKey, type CalendarDate } from "@lospor/core/time-entry"
import { DateWheel } from "@/components/time/DateWheel"
import { refusalReason } from "@/lib/server-message"

/**
 * Anaesthesia nurses on the theatres for a day (10.8.0). A nurse puts herself
 * on a theatre for today and then sees its cases; a head of department or an
 * administrator places any nurse of the department on any day.
 */
type Theatre = { id: string; name: string }
type Person = { id: string; name: string; firstName?: string | null; lastName?: string | null; title?: string | null }
type Shift = { id: string; theatre: Theatre; user: Person }

const COPY = {
  bg: { open: "Сестри по операционни", title: "Анестезиологични сестри по операционни", me: "Тук съм днес", add: "Добави сестра", none: "Няма", failed: "Няма връзка със сървъра — опитайте пак", close: "Готово", date: "Дата", day: "Ден", month: "Месец", year: "Година", remove: "Махни" },
  en: { open: "Nurses by theatre", title: "Anaesthesia nurses by theatre", me: "I am here today", add: "Add a nurse", none: "None", failed: "Could not reach the server — try again", close: "Done", date: "Date", day: "Day", month: "Month", year: "Year", remove: "Remove" },
} as const

const nameOf = (person: Person) => [person.title, person.firstName, person.lastName].filter(Boolean).join(" ") || person.name

export function TheatreNurseShifts({ theatres, role, userId, locale }: { theatres: Theatre[]; role: string; userId: string; locale: string }) {
  const copy = COPY[locale === "bg" ? "bg" : "en"]
  const router = useRouter()
  const manager = role === "ADMIN" || role === "HEAD_OF_DEPT"
  const nurse = isNurseAccountRole(role)
  const [open, setOpen] = useState(false)
  const [date, setDate] = useState<CalendarDate>(() => parseCalendarDateKey(calendarDayKey(new Date()))!)
  const [shifts, setShifts] = useState<Shift[]>([])
  const [nurses, setNurses] = useState<Person[]>([])
  const dateKey = calendarDateKey(date)
  const today = dateKey === calendarDayKey(new Date())

  const [failed, setFailed] = useState(false)
  const [why, setWhy] = useState<string | null>(null)
  // Only the newest question's answer is shown: a slower, earlier one (another day) is dropped.
  const latest = useRef(0)
  const dayTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => { if (dayTimer.current) clearTimeout(dayTimer.current) }, [])
  // Loaded when the dialog opens and when its day changes (from the handlers, not an effect).
  const load = async (key: string) => {
    const mine = ++latest.current
    try {
      const response = await fetch(`/api/operating-theatres/shifts?date=${key}`)
      if (mine !== latest.current) return
      if (response.ok) { setShifts((await response.json()).shifts ?? []); setFailed(false) } else setFailed(true)
    } catch { if (mine === latest.current) setFailed(true) }
  }
  // The wheel turns many times a second: the day is shown at once, the list is asked for once it settles.
  const changeDate = (next: CalendarDate) => {
    setDate(next)
    if (dayTimer.current) clearTimeout(dayTimer.current)
    dayTimer.current = setTimeout(() => { void load(calendarDateKey(next)) }, 200)
  }

  if (!manager && !nurse) return null
  if (theatres.length === 0) return null

  const post = async (body: Record<string, unknown>) => {
    const mine = ++latest.current
    let response: Response
    try { response = await fetch("/api/operating-theatres/shifts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, date: dateKey }) }) } catch { setFailed(true); return }
    if (mine !== latest.current) return
    if (response.ok) { setShifts((await response.json()).shifts ?? []); setFailed(false); setWhy(null); router.refresh() } else { setFailed(true); setWhy(await refusalReason(response)) }
  }

  return (
    <>
      <button type="button" data-testid="theatre-nurse-shifts" onClick={() => {
        setOpen(true)
        // A nurse's day is always today: a page left open past midnight must not keep yesterday.
        const todayDate = parseCalendarDateKey(calendarDayKey(new Date()))!
        if (!manager) setDate(todayDate)
        void load(manager ? dateKey : calendarDateKey(todayDate))
        if (manager) void fetch("/api/users/nurses").then(response => response.ok ? response.json() : { nurses: [] }).then(body => setNurses(body.nurses ?? []))
      }}
        className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-slate-200 dark:border-[#3a3a3a] px-4 text-sm font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-[#2a2a2a]">
        <Users className="h-4 w-4" /> {copy.open}
      </button>
      {open ? (
        <div role="dialog" aria-modal="true" aria-label={copy.title} className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4" onPointerDown={event => { if (event.target === event.currentTarget) setOpen(false) }}>
          <div className="flex max-h-[90vh] w-full max-w-lg flex-col gap-3 overflow-y-auto rounded-xl bg-white dark:bg-[#1f1f1f] p-4 shadow-xl">
            <p className="text-base font-bold text-slate-900 dark:text-white">{copy.title}</p>
            {failed ? <p role="alert" className="text-sm font-semibold text-red-600">{copy.failed}{why ? ` ${why}` : ""}</p> : null}
            {manager ? <DateWheel value={date} onChange={changeDate} labels={{ day: copy.day, month: copy.month, year: copy.year }} /> : null}
            {theatres.map(theatre => {
              const here = shifts.filter(shift => shift.theatre.id === theatre.id)
              const placed = new Set(here.map(shift => shift.user.id))
              return (
                <div key={theatre.id} className="rounded-lg border border-slate-200 dark:border-[#3a3a3a] p-3" data-testid={`shift-theatre-${theatre.id}`}>
                  <p className="text-sm font-bold text-slate-800 dark:text-slate-100">{theatre.name}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {here.length === 0 ? <span className="text-sm text-slate-500">{copy.none}</span> : here.map(shift => (
                      <span key={shift.id} className="inline-flex min-h-11 items-center gap-1 rounded-full bg-slate-100 dark:bg-[#2a2a2a] pl-3 pr-1 text-sm font-semibold">
                        {nameOf(shift.user)}
                        {manager || shift.user.id === userId ? (
                          <button type="button" aria-label={copy.remove} onClick={() => void post({ theatreId: theatre.id, userId: shift.user.id, remove: true })}
                            className="flex size-9 items-center justify-center rounded-full hover:bg-slate-200 dark:hover:bg-[#3a3a3a]"><X className="h-4 w-4" /></button>
                        ) : null}
                      </span>
                    ))}
                  </div>
                  {nurse && today && !placed.has(userId) ? (
                    <button type="button" className="mt-2 min-h-11 w-full rounded-lg bg-blue-600 font-semibold text-white" onClick={() => void post({ theatreId: theatre.id })}>{copy.me}</button>
                  ) : null}
                  {manager ? (
                    <select aria-label={copy.add} value="" onChange={event => { if (event.target.value) void post({ theatreId: theatre.id, userId: event.target.value }) }}
                      className="mt-2 min-h-11 w-full rounded-lg border border-slate-200 dark:border-[#3a3a3a] bg-white dark:bg-[#2a2a2a] px-3 text-sm">
                      <option value="">{copy.add}</option>
                      {nurses.filter(person => !placed.has(person.id)).map(person => <option key={person.id} value={person.id}>{nameOf(person)}</option>)}
                    </select>
                  ) : null}
                </div>
              )
            })}
            <button type="button" className="min-h-11 rounded-lg border border-slate-300 dark:border-[#4a4a4a] font-semibold" onClick={() => setOpen(false)}>{copy.close}</button>
          </div>
        </div>
      ) : null}
    </>
  )
}
