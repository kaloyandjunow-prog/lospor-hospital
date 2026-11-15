import { Text, View } from "react-native"
import { colors } from "@/theme/colors"
import { usePreferences } from "@/lib/preferences-context"
import {
  anaesthesiaRunning,
  dashboardDayLabel,
  departmentClock,
  groupDashboardCases,
  type DashboardOrderCase,
} from "@/lib/dashboard-order"

export type DashboardListRow<T> =
  | { key: string; kind: "day" | "theatre"; label: string }
  | { key: string; kind: "case"; item: T }

/** The dashboard list flattened for a FlatList: day headings, theatre headings, cases (1.9.2). */
export function dashboardListRows<T extends DashboardOrderCase>(
  cases: T[],
  options: { byDay: boolean; theatres: { id: string; name: string }[] | null; preferredUserId?: string; language: "bg" | "en"; noTheatreLabel: string },
): DashboardListRow<T>[] {
  const rows: DashboardListRow<T>[] = []
  for (const day of groupDashboardCases(cases, options)) {
    if (options.byDay) rows.push({ key: `day:${day.dayKey}`, kind: "day", label: dashboardDayLabel(day.dayKey, options.language) })
    for (const group of day.theatres) {
      if (options.theatres) {
        rows.push({
          key: `theatre:${day.dayKey}:${group.theatreId ?? "none"}`,
          kind: "theatre",
          label: group.name ?? options.noTheatreLabel,
        })
      }
      for (const item of group.cases) rows.push({ key: item.id, kind: "case", item })
    }
  }
  return rows
}

export function DashboardHeading({ kind, label }: { kind: "day" | "theatre"; label: string }) {
  return (
    <Text
      accessibilityRole="header"
      style={kind === "day"
        ? { color: colors.textSecondary, fontSize: 12, fontWeight: "900", letterSpacing: 0.6, textTransform: "uppercase", marginTop: 6, marginBottom: 8 }
        : { color: colors.textMuted, fontSize: 11, fontWeight: "800", marginBottom: 6 }}
    >
      {label}
    </Text>
  )
}

/**
 * Every case but a cancelled one carries a light: green while anaesthesia runs,
 * red on an open case that is not under anaesthesia, grey once the case is
 * closed and locked. Every case that has started shows its anaesthesia time,
 * in the department's clock.
 */
export function AnaesthesiaLine({ item }: { item: DashboardOrderCase }) {
  const { t } = usePreferences()
  const locked = item.status === "COMPLETE"
  const open = !locked && item.status !== "CANCELLED"
  const running = anaesthesiaRunning(item)
  const start = departmentClock(item.intraop?.startedAt)
  const end = departmentClock(item.intraop?.endedAt)
  if (!open && !locked && !start) return null
  const label = t(locked ? "caseLockedLight" : running ? "anaesthesiaRunning" : "anaesthesiaNotRunning")
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 4 }}>
      {open || locked ? (
        <View
          testID={`anaesthesia-light-${item.id}`}
          accessible
          accessibilityRole="image"
          accessibilityLabel={label}
          style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: locked ? colors.textMuted : running ? colors.success : colors.danger }}
        />
      ) : null}
      {start ? (
        <Text testID={`anaesthesia-time-${item.id}`} style={{ color: colors.textSecondary, fontSize: 12, fontWeight: "700", fontVariant: ["tabular-nums"] }}>
          {t(running ? "anaesthesiaFrom" : end ? "anaesthesiaSpan" : "anaesthesiaAt").replace("{start}", start).replace("{end}", end ?? "")}
        </Text>
      ) : null}
    </View>
  )
}
