import { layoutRecordChart, type ChartLayoutOptions, type SceneItem } from "@lospor/core/record-chart-layout"
import type { RecordTimetable } from "@lospor/core/record-timetable"

/**
 * The record's timetable as one SVG. Core lays the chart out (`layoutRecordChart`, shared with the phone);
 * this only draws the instructions. Light paper in every theme.
 */
function Item({ item }: { item: SceneItem }) {
  switch (item.t) {
    case "rect":
      return <rect x={item.x} y={item.y} width={item.w} height={item.h} rx={item.rx} fill={item.fill} opacity={item.opacity} />
    case "line":
      return <line x1={item.x1} y1={item.y1} x2={item.x2} y2={item.y2} stroke={item.stroke} strokeWidth={item.width} strokeDasharray={item.dash} opacity={item.opacity} />
    case "path":
      return <path d={item.d} fill={item.fill ?? "none"} stroke={item.stroke} strokeWidth={item.width} strokeDasharray={item.dash} opacity={item.opacity} />
    case "text":
      return <text x={item.x} y={item.y} textAnchor={item.anchor} fill={item.fill} fontSize={item.size} fontWeight={item.weight} opacity={item.opacity}>{item.text}</text>
  }
}

export function RecordChart({ model, ...options }: { model: RecordTimetable } & ChartLayoutOptions) {
  const scene = layoutRecordChart(model, options)
  return (
    <svg viewBox={`0 0 ${scene.width} ${scene.height}`} width="100%" role="img" aria-label="Vitals, drugs, infusions and fluids on the time axis"
      style={{ display: "block", font: `${options.fontSize ?? 9.5}px system-ui, sans-serif` }} data-testid="record-chart">
      {scene.items.map((item, index) => <Item key={index} item={item} />)}
    </svg>
  )
}
