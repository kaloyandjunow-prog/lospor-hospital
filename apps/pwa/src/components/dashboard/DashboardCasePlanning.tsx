import { useEffect, useState } from "react"
import { ActivityIndicator, ScrollView, Text, TouchableOpacity, View } from "react-native"
import { calendarDayKey } from "@lospor/core/dashboard-date-scope"
import { calendarDateKey, parseCalendarDateKey, type CalendarDate } from "@lospor/core/time-entry"
import { apiFetch } from "@/lib/api"
import { refusalReason } from "@/lib/server-message"
import { DateWheel } from "@/components/DateWheel"
import { colors } from "@/theme/colors"
import type { ClinicalStringKey } from "@/lib/preferences-context"

/**
 * Two steps of the dashboard's long-press menu (10.8.0): the planned date of
 * the operation, on the same date wheel as the web; and an anaesthesia nurse
 * passing her place in the case to another nurse.
 */
/** The line shown when the server refused: what it could not do, and why. */
async function notSaved(response: Response, tc: (key: ClinicalStringKey) => string): Promise<string> {
  const why = await refusalReason(response)
  return why ? `${tc("dmNotSaved")} ${why}` : tc("dmNotSaved")
}

const row = { paddingVertical: 16, borderTopWidth: 1, borderTopColor: colors.border } as const

export function PlannedDateStep({ caseId, value, tc, onDone, onBack }: {
  caseId: string
  value: string | null
  tc: (key: ClinicalStringKey) => string
  onDone: () => void
  onBack: () => void
}) {
  const [date, setDate] = useState<CalendarDate>(() => parseCalendarDateKey(value) ?? parseCalendarDateKey(calendarDayKey(new Date()))!)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState<string | null>(null)
  const save = async (plannedSurgeryDate: string | null) => {
    setBusy(true)
    setFailed(null)
    try {
      const response = await apiFetch(`/api/cases/${caseId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ plannedSurgeryDate }) })
      if (response.ok) onDone(); else setFailed(await notSaved(response, tc))
    } catch { setFailed(tc("dmFailed")) } finally { setBusy(false) }
  }
  return (
    <View>
      <Text style={{ color: colors.textPrimary, fontSize: 15, fontWeight: "800", marginBottom: 12 }}>{tc("dmPlannedDate")}</Text>
      <DateWheel value={date} onChange={setDate} labels={{ day: tc("dmDay"), month: tc("dmMonth"), year: tc("dmYear") }} />
      {failed ? <Text accessibilityRole="alert" style={{ color: colors.danger, fontSize: 14, marginTop: 8 }}>{failed}</Text> : null}
      <TouchableOpacity testID="planned-date-save" style={{ marginTop: 16, minHeight: 48, borderRadius: 12, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" }} onPress={() => { void save(calendarDateKey(date)) }} disabled={busy}>
        {busy ? <ActivityIndicator color={colors.textPrimary} /> : <Text style={{ color: colors.background, fontSize: 16, fontWeight: "800" }}>{tc("dmSave")}</Text>}
      </TouchableOpacity>
      {value ? <TouchableOpacity style={{ ...row, alignItems: "center" }} onPress={() => { void save(null) }} disabled={busy}><Text style={{ color: colors.textSecondary, fontSize: 16, fontWeight: "700" }}>{tc("dmClearDate")}</Text></TouchableOpacity> : null}
      <TouchableOpacity style={{ ...row, alignItems: "center" }} onPress={onBack}><Text style={{ color: colors.textSecondary, fontSize: 16 }}>{tc("back")}</Text></TouchableOpacity>
    </View>
  )
}

type Nurse = { id: string; name: string; firstName?: string | null; lastName?: string | null; title?: string | null }
const nameOf = (nurse: Nurse) => [nurse.title, nurse.firstName, nurse.lastName].filter(Boolean).join(" ") || nurse.name

export function NurseHandoverStep({ caseId, tc, onDone, onBack }: {
  caseId: string
  tc: (key: ClinicalStringKey) => string
  onDone: () => void
  onBack: () => void
}) {
  const [nurses, setNurses] = useState<Nurse[] | null>(null)
  const [done, setDone] = useState(false)
  const [failed, setFailed] = useState<string | null>(null)
  useEffect(() => {
    void apiFetch("/api/users/nurses").then(response => response.ok ? response.json() : { nurses: [] }).then(body => setNurses(body.nurses ?? []), () => setNurses([]))
  }, [])
  const handOver = async (id: string) => {
    setFailed(null)
    let response: Response
    try { response = await apiFetch(`/api/cases/${caseId}/nurses`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ handoverTo: id }) }) } catch { setFailed(tc("dmFailed")); return }
    if (response.ok) { setDone(true); setTimeout(onDone, 700) } else setFailed(await notSaved(response, tc))
  }
  return (
    <View>
      <Text style={{ color: colors.textPrimary, fontSize: 15, fontWeight: "800", marginBottom: 12 }}>{tc("dmHandToNurse")}</Text>
      {failed ? <Text accessibilityRole="alert" style={{ color: colors.danger, fontSize: 14, marginBottom: 8 }}>{failed}</Text> : null}
      {done ? <Text style={{ color: colors.success, fontSize: 15, fontWeight: "800" }}>{tc("dmHandedOver")}</Text>
        : nurses === null ? <ActivityIndicator color={colors.primary} />
          : nurses.length === 0 ? <Text style={{ color: colors.textMuted, fontSize: 14 }}>{tc("dmNoNurses")}</Text>
            : nurses.map(nurse => (
              <TouchableOpacity key={nurse.id} style={row} onPress={() => { void handOver(nurse.id) }}>
                <Text style={{ color: colors.textPrimary, fontSize: 16, fontWeight: "700" }}>{nameOf(nurse)}</Text>
              </TouchableOpacity>
            ))}
      <TouchableOpacity style={{ ...row, alignItems: "center" }} onPress={onBack}><Text style={{ color: colors.textSecondary, fontSize: 16 }}>{tc("back")}</Text></TouchableOpacity>
    </View>
  )
}

/** The case's anaesthesia nurses (10.8.0), as the web row menu sets them. */
export function CaseNursesStep({ caseId, tc, onDone, onBack }: {
  caseId: string
  tc: (key: ClinicalStringKey) => string
  onDone: () => void
  onBack: () => void
}) {
  const [nurses, setNurses] = useState<Nurse[] | null>(null)
  const [assigned, setAssigned] = useState<Set<string>>(new Set())
  const [failed, setFailed] = useState<string | null>(null)
  useEffect(() => {
    void Promise.all([
      apiFetch("/api/users/nurses").then(response => response.ok ? response.json() : { nurses: [] }),
      apiFetch(`/api/cases/${caseId}/nurses`).then(response => response.ok ? response.json() : { nurses: [] }),
    ]).then(([list, current]) => {
      setNurses(list.nurses ?? [])
      setAssigned(new Set((current.nurses ?? []).map((row: { userId: string }) => row.userId)))
    }, () => setNurses([]))
  }, [caseId])
  const toggle = async (id: string) => {
    let response: Response
    try { response = await apiFetch(`/api/cases/${caseId}/nurses`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(assigned.has(id) ? { remove: id } : { assign: id }) }) } catch { setFailed(tc("dmFailed")); return }
    if (!response.ok) { setFailed(await notSaved(response, tc)); return }
    setFailed(null)
    const next = await response.json()
    setAssigned(new Set((next.nurses ?? []).map((row: { userId: string }) => row.userId)))
  }
  return (
    <View>
      <Text style={{ color: colors.textPrimary, fontSize: 15, fontWeight: "800", marginBottom: 12 }}>{tc("dmCaseNurses")}</Text>
      {failed ? <Text accessibilityRole="alert" style={{ color: colors.danger, fontSize: 14, marginBottom: 8 }}>{failed}</Text> : null}
      {nurses === null ? <ActivityIndicator color={colors.primary} />
        : nurses.length === 0 ? <Text style={{ color: colors.textMuted, fontSize: 14 }}>{tc("dmNoNurses")}</Text>
          : nurses.map(nurse => (
            <TouchableOpacity key={nurse.id} testID={`case-nurse-${nurse.id}`} accessibilityRole="checkbox" accessibilityState={{ checked: assigned.has(nurse.id) }}
              style={{ ...row, flexDirection: "row", alignItems: "center", gap: 12 }} onPress={() => { void toggle(nurse.id) }}>
              <Text style={{ color: assigned.has(nurse.id) ? colors.primary : colors.textMuted, fontSize: 20, fontWeight: "800" }}>{assigned.has(nurse.id) ? "☑" : "☐"}</Text>
              <Text style={{ color: colors.textPrimary, fontSize: 16, fontWeight: "700" }}>{nameOf(nurse)}</Text>
            </TouchableOpacity>
          ))}
      <TouchableOpacity style={{ ...row, alignItems: "center" }} onPress={onDone}><Text style={{ color: colors.primary, fontSize: 16, fontWeight: "800" }}>{tc("dmSave")}</Text></TouchableOpacity>
      <TouchableOpacity style={{ ...row, alignItems: "center" }} onPress={onBack}><Text style={{ color: colors.textSecondary, fontSize: 16 }}>{tc("back")}</Text></TouchableOpacity>
    </View>
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

/** The anaesthesia team of the case over time (2026-11-23): who joined and left, and when. Read-only; never changed. */
export function CaseTeamStep({ caseId, tc, onBack }: { caseId: string; tc: (key: ClinicalStringKey) => string; onBack: () => void }) {
  const [rows, setRows] = useState<StaffRow[] | null>(null)
  const [failed, setFailed] = useState<string | null>(null)
  useEffect(() => {
    void (async () => {
      let response: Response
      try { response = await apiFetch(`/api/cases/${caseId}/staff`) } catch { setFailed(tc("dmFailed")); setRows([]); return }
      if (!response.ok) { setFailed(await notSaved(response, tc)); setRows([]); return }
      setRows((await response.json()).staff ?? [])
    })()
  }, [caseId, tc])
  const reason = (code: string) => {
    const key = `dmTeam${code}` as ClinicalStringKey
    const text = tc(key)
    return text === key ? code : text
  }
  const when = (value: string) => new Intl.DateTimeFormat(undefined, { dateStyle: "short", timeStyle: "short" }).format(new Date(value))
  return (
    <View>
      <Text style={{ color: colors.textPrimary, fontSize: 15, fontWeight: "800", marginBottom: 12 }}>{tc("dmTeam")}</Text>
      {failed ? <Text accessibilityRole="alert" style={{ color: colors.danger, fontSize: 14, marginBottom: 8 }}>{failed}</Text> : null}
      {rows === null ? <ActivityIndicator color={colors.primary} />
        : rows.length === 0 ? <Text style={{ color: colors.textMuted, fontSize: 14 }}>{tc("dmTeamNone")}</Text>
          : <ScrollView style={{ maxHeight: 360 }} testID="case-team-history">
            {rows.map(entry => (
              <View key={entry.id} style={{ ...row }}>
                <Text style={{ color: colors.textPrimary, fontSize: 16, fontWeight: "700" }}>{nameOf(entry.user)} <Text style={{ color: colors.textMuted, fontWeight: "400" }}>· {entry.kind === "DOCTOR" ? tc("dmTeamDoctor") : tc("dmTeamNurse")}</Text></Text>
                <Text style={{ color: colors.textSecondary, fontSize: 14, marginTop: 2 }}>
                  {entry.action === "JOINED" ? tc("dmTeamJoined") : tc("dmTeamLeft")} · {when(entry.at)} · {reason(entry.reason)}{entry.by && entry.by.id !== entry.user.id ? ` · ${tc("dmTeamBy")} ${nameOf(entry.by)}` : ""}
                </Text>
              </View>
            ))}
          </ScrollView>}
      <TouchableOpacity style={{ ...row, alignItems: "center" }} onPress={onBack}><Text style={{ color: colors.textSecondary, fontSize: 16 }}>{tc("back")}</Text></TouchableOpacity>
    </View>
  )
}
