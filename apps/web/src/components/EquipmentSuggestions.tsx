"use client"

import {
  calcEquipment,
} from "@lospor/core/equipment"
import type { ClinicalMode } from "@lospor/core/pediatric"

interface Props {
  clinicalMode: ClinicalMode
  ageValue?: number | null
  ageUnit?: "DAYS" | "MONTHS" | "YEARS" | null
  ageYears?: number | null
  weightKg?: number | null
  heightCm?: number | null
  sex?: string | null
  bmi?: number | null
  mallampati?: string | null
  neckMobility?: string | null
  mouthOpeningCm?: number | null
  cormackLehane?: string | null
}

const CATEGORY_STYLE: Record<string, string> = {
  Airway: "text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800/40",
  Ventilation: "text-teal-700 dark:text-teal-300 bg-teal-50 dark:bg-teal-900/20 border-teal-200 dark:border-teal-800/40",
  Fluids: "text-sky-700 dark:text-sky-300 bg-sky-50 dark:bg-sky-900/20 border-sky-200 dark:border-sky-800/40",
  Catheters: "text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800/40",
  Monitoring: "text-green-700 dark:text-green-300 bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800/40",
  "Difficult Airway": "text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800/40",
}

export function EquipmentSuggestions(props: Props) {
  const input = {
    clinicalMode: props.clinicalMode,
    age: props.ageValue != null && props.ageUnit
      ? { value: props.ageValue, unit: props.ageUnit }
      : null,
    ageYears: props.ageYears,
    weightKg: props.weightKg,
    heightCm: props.heightCm,
    sex: props.sex,
    bmi: props.bmi,
    airway: {
      mallampati: props.mallampati,
      neckMobility: props.neckMobility,
      mouthOpeningCm: props.mouthOpeningCm,
      cormackLehane: props.cormackLehane,
    },
  } as Parameters<typeof calcEquipment>[0] & {
    clinicalMode: ClinicalMode
    age?: { value: number; unit: "DAYS" | "MONTHS" | "YEARS" } | null
  }
  const categories = calcEquipment(input)

  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-[#2e2e2e] dark:bg-[#141414]">
      <div className="border-b border-slate-100 bg-slate-50 px-4 py-3 dark:border-[#2a2a2a] dark:bg-[#1a1a1a]">
        <p className="text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">
          Suggested equipment &amp; sizes
        </p>
        {props.weightKg ? (
          <p className="mt-0.5 text-[11px] text-slate-400 dark:text-slate-500">
            Based on {props.weightKg} kg
            {props.heightCm ? `, ${props.heightCm} cm` : ""}
            {props.ageYears != null ? `, ${props.ageYears}y` : ""}
            {props.sex && props.sex !== "OTHER"
              ? `, ${props.sex === "MALE" ? "M" : "F"}`
              : ""}
          </p>
        ) : null}
      </div>
      <div className="grid grid-cols-1 divide-y divide-slate-100 dark:divide-[#2a2a2a] sm:grid-cols-2 sm:divide-x sm:divide-y-0 lg:grid-cols-3">
        {categories.map(category => (
          <div key={category.cat} className="space-y-1.5 p-3">
            <p className={`inline-block rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase ${CATEGORY_STYLE[category.cat] ?? "border-slate-300 text-slate-600"}`}>
              {category.cat}
            </p>
            <div className="space-y-1">
              {category.items.map(item => (
                <div key={item.label} className="flex items-baseline justify-between gap-2">
                  <span className="shrink-0 text-xs text-slate-500 dark:text-slate-400">
                    {item.label}
                  </span>
                  <div className="text-right">
                    <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                      {item.value}
                    </span>
                    {item.note ? (
                      <span className="block text-[10px] text-slate-400 dark:text-slate-500">
                        {item.note}
                      </span>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
