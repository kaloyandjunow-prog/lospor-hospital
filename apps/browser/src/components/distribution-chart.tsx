"use client"

import type { ResearchDistribution } from "@lospor/core/research"
import { displayDistributionBucket } from "@/lib/clinical-display"
import { useLocale } from "./locale-provider"
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

export function DistributionChart({ distribution }: { distribution: ResearchDistribution }) {
  const { locale, message } = useLocale()
  const data = distribution.buckets.slice(0, 12).map(bucket => {
    const fullName = displayDistributionBucket(distribution.id, bucket, locale)
    return {
      name: fullName.length > 24 ? `${fullName.slice(0, 22)}…` : fullName,
      fullName,
      count: bucket.count,
      suppressed: bucket.suppressed,
    }
  })
  if (!data.length) return <div className="empty">{message("noDistributionData")}</div>
  return (
    <div className="chart-box">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ left: 12, right: 16 }}>
          <CartesianGrid stroke="#e3e8e6" horizontal={false} />
          <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
          <YAxis
            type="category"
            dataKey="name"
            width={128}
            tick={{ fontSize: 10 }}
          />
          <Tooltip
            formatter={(value, _name, item) =>
              item.payload.suppressed
                ? [message("suppressedLabel"), message("casesLabel")]
                : [value, message("casesLabel")]}
          />
          <Bar dataKey="count" fill="#0f766e" radius={[0, 3, 3, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
