import { useRef, useState } from "react"
import { ActivityIndicator, Modal, ScrollView, Text, TouchableOpacity, View } from "react-native"
import { calendarDayKey } from "@lospor/core/dashboard-date-scope"
import { calendarDateKey, parseCalendarDateKey, type CalendarDate } from "@lospor/core/time-entry"
import { apiFetch } from "@/lib/api"
import { useAuth } from "@/lib/auth-context"
import { refusalReason } from "@/lib/server-message"
import { DateWheel } from "@/components/DateWheel"
import { colors } from "@/theme/colors"
import type { ClinicalStringKey } from "@/lib/preferences-context"

/**
 * Anaesthesia nurses on the theatres for a day (10.8.0), as on the web
 * dashboard: a nurse puts herself on a theatre for today and then sees its
 * cases; a head of department or an administrator places any nurse on any
 * day. The server decides who may do what; refused changes do nothing.
 */
type Theatre = { id: string; name: string }
type Person = { id: string; name: string; firstName?: string | null; lastName?: string | null; title?: string | null }
type Shift = { id: string; theatre: Theatre; user: Person }

const nameOf = (person: Person) => [person.title, person.firstName, person.lastName].filter(Boolean).join(" ") || person.name
const row = { paddingVertical: 12, borderTopWidth: 1, borderTopColor: colors.border } as const

export function TheatreNurseShiftsButton({ theatres, isNurse, tc }: { theatres: Theatre[]; isNurse: boolean; tc: (key: ClinicalStringKey) => string }) {
  const [open, setOpen] = useState(false)
  const [date, setDate] = useState<CalendarDate>(() => parseCalendarDateKey(calendarDayKey(new Date()))!)
  const [shifts, setShifts] = useState<Shift[] | null>(null)
  const [nurses, setNurses] = useState<Person[]>([])
  const [failed, setFailed] = useState<string | null>(null)
  const { accountId: me } = useAuth()
  // Only the newest question's answer is shown: a slower, earlier one (another day) is dropped.
  const latest = useRef(0)
  if (theatres.length === 0) return null
  const today = calendarDateKey(date) === calendarDayKey(new Date())

  const load = async (key: string) => {
    const mine = ++latest.current
    try {
      const response = await apiFetch(`/api/operating-theatres/shifts?date=${key}`)
      const body = response.ok ? await response.json() : null
      if (mine === latest.current) setShifts(body?.shifts ?? [])
    } catch { if (mine === latest.current) setShifts([]) }
  }
  const post = async (body: Record<string, unknown>) => {
    const mine = ++latest.current
    let response: Response
    try { response = await apiFetch("/api/operating-theatres/shifts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, date: calendarDateKey(date) }) }) } catch { setFailed(tc("dmFailed")); void load(calendarDateKey(date)); return }
    if (response.ok) { const answer = await response.json(); if (mine === latest.current) { setShifts(answer.shifts ?? []); setFailed(null) } return }
    // Refused: say why (a nurse with no hospital, a date that is no day, a theatre that is gone), and show the day as it is.
    const why = await refusalReason(response)
    setFailed(why ? `${tc("dmNotSaved")} ${why}` : tc("dmNotSaved"))
    void load(calendarDateKey(date))
  }
  const openSheet = () => {
    setOpen(true)
    setFailed(null)
    setShifts(null)
    // A nurse's day is today, whenever the screen was first opened (past midnight it must not be yesterday).
    const todayDate = parseCalendarDateKey(calendarDayKey(new Date()))!
    if (isNurse) setDate(todayDate)
    void load(calendarDateKey(isNurse ? todayDate : date))
    void apiFetch("/api/users/nurses").then(response => response.ok ? response.json() : { nurses: [] }).then(body => setNurses(body.nurses ?? []), () => setNurses([]))
  }

  return (
    <>
      <TouchableOpacity testID="theatre-nurse-shifts" onPress={openSheet}
        style={{ minHeight: 44, justifyContent: "center", paddingHorizontal: 14, borderRadius: 12, borderWidth: 1, borderColor: colors.border, alignSelf: "flex-start" }}>
        <Text style={{ color: colors.textPrimary, fontSize: 14, fontWeight: "700" }}>{tc("dmTheatreNurses")}</Text>
      </TouchableOpacity>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "flex-end" }}>
          <View style={{ maxHeight: "90%", backgroundColor: colors.surfaceRaised, borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 20 }}>
            <Text style={{ color: colors.textPrimary, fontSize: 16, fontWeight: "800", marginBottom: 8 }}>{tc("dmTheatreNurses")}</Text>
            {failed ? <Text accessibilityRole="alert" style={{ color: colors.danger, fontSize: 14, marginBottom: 8 }}>{failed}</Text> : null}
            <ScrollView>
              {!isNurse ? <DateWheel value={date} onChange={next => { setDate(next); void load(calendarDateKey(next)) }} labels={{ day: tc("dmDay"), month: tc("dmMonth"), year: tc("dmYear") }} /> : null}
              {shifts === null ? <ActivityIndicator color={colors.primary} /> : theatres.map(theatre => {
                const here = shifts.filter(shift => shift.theatre.id === theatre.id)
                const placed = new Set(here.map(shift => shift.user.id))
                return (
                  <View key={theatre.id} style={row} testID={`shift-theatre-${theatre.id}`}>
                    <Text style={{ color: colors.textPrimary, fontSize: 15, fontWeight: "800", marginBottom: 6 }}>{theatre.name}</Text>
                    {here.map(shift => (
                      <View key={shift.id} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 44 }}>
                        <Text style={{ color: colors.textPrimary, fontSize: 15 }}>{nameOf(shift.user)}</Text>
                        <TouchableOpacity accessibilityLabel={tc("dmRemove")} onPress={() => { void post({ theatreId: theatre.id, userId: shift.user.id, remove: true }) }}
                          style={{ minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center" }}>
                          <Text style={{ color: colors.textMuted, fontSize: 18, fontWeight: "800" }}>×</Text>
                        </TouchableOpacity>
                      </View>
                    ))}
                    {isNurse && today && !(me && placed.has(me)) ? (
                      <TouchableOpacity onPress={() => { void post({ theatreId: theatre.id }) }}
                        style={{ minHeight: 44, marginTop: 4, borderRadius: 10, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" }}>
                        <Text style={{ color: colors.background, fontSize: 15, fontWeight: "800" }}>{tc("dmIAmHere")}</Text>
                      </TouchableOpacity>
                    ) : null}
                    {!isNurse ? nurses.filter(person => !placed.has(person.id)).map(person => (
                      <TouchableOpacity key={person.id} onPress={() => { void post({ theatreId: theatre.id, userId: person.id }) }}
                        style={{ minHeight: 44, justifyContent: "center" }}>
                        <Text style={{ color: colors.primary, fontSize: 15, fontWeight: "700" }}>+ {nameOf(person)}</Text>
                      </TouchableOpacity>
                    )) : null}
                  </View>
                )
              })}
            </ScrollView>
            <TouchableOpacity onPress={() => setOpen(false)} style={{ ...row, alignItems: "center", minHeight: 48, justifyContent: "center" }}>
              <Text style={{ color: colors.textSecondary, fontSize: 16, fontWeight: "700" }}>{tc("dmSave")}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </>
  )
}
