import type { LabDraw } from "@/components/case-summary/investigations"

/**
 * The Investigations box on the printed record.
 *
 * Intraoperative results only, grouped by draw, capped at what the page can
 * hold and explicit about the rest. Which draws are shown and how many were
 * left behind is decided in ./investigations; this only draws the answer.
 */
export function InvestigationsBox({
  shownDraws, title, Field,
}: {
  shownDraws: LabDraw[]
  title: string
  Field: (props: { label: string; value: string | null }) => React.ReactElement | null
}) {
  const L = { investigations: title }
  const F = Field
  return (
        <div className="border border-slate-200 rounded-lg p-2 bg-white">
          <p className="text-[8.5px] font-bold tracking-[0.1em] text-blue-900 dark:text-blue-300 mb-1">{L.investigations.toUpperCase()}</p>
          {shownDraws.length > 0 ? (
            <div
              className={shownDraws.reduce((n, d) => n + d.results.length, 0) >= 12 ? "lab-compact" : ""}
              style={{ columns: shownDraws.reduce((n, d) => n + d.results.length, 0) >= 24 ? 2 : 1, columnGap: "0.5rem" }}
            >
              {shownDraws.map((draw, drawIdx) => (
                <div key={drawIdx} style={{ breakInside: "avoid" }}>
                  {/* The draw time is the heading. Two gases an hour apart
                    * are two readings of a changing patient, and without it
                    * they read as one contradictory set. */}
                  <p className="text-[8px] font-bold text-slate-500 tracking-wide mt-1 first:mt-0">{draw.label}</p>
                  {draw.results.map((l, idx) => (
                    <div key={idx} className="lab-entry">
                      <F label={l.test ?? ""} value={`${l.value}${l.unit ? " " + l.unit : ""}`} />
                    </div>
                  ))}
                </div>
              ))}
            </div>
          ) : <p className="text-[9px] text-slate-400">—</p>}
        </div>
  )
}
