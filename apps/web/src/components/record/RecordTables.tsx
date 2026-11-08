import type { RecordLogRow } from "@lospor/core/record-log"
import type { RecordLabelSet } from "@lospor/core/record-labels"
import type { RecordTimetable } from "@lospor/core/record-timetable"

/** The two tables of the record: the event log (deleted entries struck through) and the vitals every five minutes. */

export function EventLogTable({ rows, labels }: { rows: RecordLogRow[]; labels: RecordLabelSet }) {
  // The kind column is as wide as the longest kind used, so a long Bulgarian word does not wrap.
  const kindWidth = Math.min(160, Math.max(64, Math.max(...rows.map(r => labels.kinds[r.kind].length)) * 5.6 + 8))
  return (
    <table className="rec-log w-full text-[10px]" data-testid="record-event-log">
      <thead>
        <tr className="text-left text-[9px] text-slate-500 border-b border-slate-300">
          <th className="w-[44px] py-0.5 font-semibold">{labels.time}</th>
          <th className="font-semibold" style={{ width: kindWidth }}>{labels.kind}</th>
          <th className="font-semibold">{labels.entry}</th>
          <th className="w-[190px] text-right font-semibold">{labels.note}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(row => {
          const deleted = row.deletedTime != null || row.id.startsWith("deleted:")
          const tone = deleted ? "text-slate-400" : row.complication ? "text-red-700 font-semibold" : "text-slate-800"
          return (
            <tr key={row.id} data-deleted={deleted ? "true" : undefined} className={`border-b border-slate-100 ${tone}`}>
              <td className={`py-px tabular-nums ${deleted ? "line-through" : ""}`}>{row.time}</td>
              <td className={deleted ? "line-through" : ""}>{labels.kinds[row.kind]}</td>
              <td className={deleted ? "line-through" : ""}>{row.text}</td>
              <td className="text-right text-slate-500">
                {deleted
                  ? <span className="text-amber-700 font-semibold">{labels.deletedAt}{row.deletedTime ? ` ${row.deletedTime}` : ""}</span>
                  : row.card ? `★ ${row.card}` : ""}
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

export function VitalsTable({ model, labels, columns, bp, hr }: { model: RecordTimetable; labels: RecordLabelSet; columns: number; bp: string; hr: string }) {
  const rows = model.vitals
  const size = Math.max(1, Math.ceil(rows.length / columns))
  const groups = Array.from({ length: columns }, (_, k) => rows.slice(k * size, (k + 1) * size)).filter(g => g.length > 0)
  return (
    <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${Math.max(1, groups.length)}, minmax(0, 1fr))` }} data-testid="record-vitals">
      {groups.map((group, gi) => (
        <table key={gi} className="w-full text-[10px]">
          <thead>
            <tr className="text-left text-[9px] text-slate-500 border-b border-slate-300">
              <th className="py-0.5 pr-2 font-semibold">{labels.time}</th><th className="pr-2 font-semibold">{bp}</th><th className="pr-2 font-semibold">{hr}</th>
              <th className="pr-2 font-semibold">SpO₂</th><th className="pr-2 font-semibold">EtCO₂</th><th className="font-semibold">T °C</th>
            </tr>
          </thead>
          <tbody>
            {group.map(v => (
              <tr key={v.col} className={`border-b border-slate-100 tabular-nums ${typeof v.systolic === "number" && v.systolic < 90 ? "text-red-700 font-semibold" : "text-slate-800"}`}>
                <td className="py-px pr-2">{model.time(v.col)}</td>
                <td className="pr-2">{v.systolic != null && v.diastolic != null ? `${v.systolic}/${v.diastolic}` : "—"}</td>
                <td className="pr-2">{v.heartRate ?? "—"}</td><td className="pr-2">{v.spO2 ?? "—"}</td><td className="pr-2">{v.etco2 ?? "—"}</td><td>{v.temp != null ? Math.round(v.temp * 10) / 10 : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ))}
    </div>
  )
}
