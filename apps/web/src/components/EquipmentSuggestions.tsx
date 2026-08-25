"use client"

import { useLocale, useTranslations } from "next-intl"
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

const EQUIPMENT_TEXT_KEYS: Record<string, string> = {
  cuffed: "cuffed",
  "Have available": "haveAvailable",
  "from today's airway exam": "fromAirwayExam",
  "Confirm location": "confirmLocation",
  "Weight required": "weightRequired",
  "Age required": "ageRequired",
  "Manual selection": "manualSelection",
  "IBW unavailable": "ibwUnavailable",
  "Measure manually": "measureManually",
  "Select manually": "selectManually",
  "Select and measure manually": "selectAndMeasureManually",
  "Calculate manually from actual ETT ID": "calculateFromEtt",
  "4-2-1 rule": "fourTwoOne",
  "Starting suggestion; adjust clinically": "startingSuggestion",
  "Use the selected manufacturer's weight bands and verify the current product IFU": "manufacturerBands",
  "Manufacturer weight-band starting point; verify the actual product and current IFU": "manufacturerStart",
  "Starting estimate; prepare planned ID ±0.5 mm and confirm patient/product factors": "startingEtt",
  "Under 2 years: prepare the clinically planned ID ±0.5 mm": "underTwoEtt",
  "Enter age; under 2 years remains manual and requires the planned ID ±0.5 mm": "enterAgeEtt",
  "Oral starting estimate (age/2 + 12); confirm clinically": "oralDepth",
  "Under 2 years: select and confirm depth clinically": "underTwoDepth",
  "Enter age; confirm depth clinically": "enterAgeDepth",
  "Enter pediatric age, sex and height for McLaren IBW": "enterIbw",
  "Verify AED mode and pad placement": "verifyAed",
  "Enter weight to distinguish pediatric and standard AED mode; energy is shown only in the resuscitation calculator": "enterAedWeight",
  "Pediatric AED mode if available; adult pads anteroposterior": "pediatricAed",
  "Pediatric pads may be anterolateral only if they do not touch; verify device IFU; no energy shown here": "pediatricAedNote",
  "Standard adult AED mode; anterolateral or anteroposterior pads": "adultAed",
  "Avoid pad contact and breast tissue; verify device IFU; no energy shown here": "adultAedNote",
  "Age required; choose exact blade manually": "ageBlade",
  "Prepare a straight blade; choose exact size manually": "straightBlade",
  "Prepare a curved blade; choose exact size manually": "curvedBlade",
  "Anatomy, operator and available direct/video system override": "bladeOverride",
  "Measure from the centre of the incisors to the angle of the mandible; verify product markings": "guedelMeasure",
  "Catheter occlusion should remain below the applicable fraction of the ETT lumen": "catheterFraction",
  "Base selection on anatomy, indication and local product range": "urinarySelection",
  "Confirm size and insertion depth clinically": "ngtConfirm",
  "Measure mid-upper-arm circumference": "measureArm",
  "Select the smallest compatible cuff whose printed range includes the measurement": "cuffRange",
  "Adult pads": "adultPads",
  "Large adult / Thigh cuff": "largeThigh",
  "Large adult (15–20 cm)": "largeAdult",
  "Adult (12–15 cm)": "adultCuff",
  "Prepare 0.5 mm smaller than the clinically planned ETT": "prepareSmaller",
}

export function EquipmentSuggestions(props: Props) {
  const locale = useLocale()
  const t = useTranslations()
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

  function localizeText(value: string): string {
    const key = EQUIPMENT_TEXT_KEYS[value]
    if (key) return t(`intraop.equipment.text.${key}`)
    const size = /^Size (.+)$/.exec(value)
    if (size) return t("intraop.equipment.text.sizeValue", { value: size[1] })
    const depth = /^~(.+) cm insertion depth$/.exec(value)
    if (depth) return t("intraop.equipment.text.insertionDepth", { value: depth[1] })
    const pair = /^(.+) cuffed \/ (.+) uncuffed$/.exec(value)
    if (pair) return t("intraop.equipment.text.cuffedPair", { cuffed: pair[1], uncuffed: pair[2] })
    const smaller = /^(.+) cuffed \(0\.5 mm smaller\)$/.exec(value)
    if (smaller) return t("intraop.equipment.text.smallerCuffed", { value: smaller[1] })
    return value
  }

  const details = [
    props.weightKg ? `${props.weightKg} kg` : null,
    props.heightCm ? `${props.heightCm} cm` : null,
    props.ageYears != null ? `${props.ageYears}${locale === "bg" ? " г." : "y"}` : null,
    props.sex && props.sex !== "OTHER" ? (props.sex === "MALE" ? (locale === "bg" ? "М" : "M") : (locale === "bg" ? "Ж" : "F")) : null,
  ].filter((value): value is string => Boolean(value)).join(", ")

  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-[#2e2e2e] dark:bg-[#141414]">
      <div className="border-b border-slate-100 bg-slate-50 px-4 py-3 dark:border-[#2a2a2a] dark:bg-[#1a1a1a]">
        <p className="text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">
          {t("intraop.equipment.title")}
        </p>
        {props.weightKg ? (
          <p className="mt-0.5 text-[11px] text-slate-400 dark:text-slate-500">
            {t("intraop.equipment.basedOn", { details })}
          </p>
        ) : null}
      </div>
      <div className="grid grid-cols-1 divide-y divide-slate-100 dark:divide-[#2a2a2a] sm:grid-cols-2 sm:divide-x sm:divide-y-0 lg:grid-cols-3">
        {categories.map(category => (
          <div key={category.cat} className="space-y-1.5 p-3">
            <p className={`inline-block rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase ${CATEGORY_STYLE[category.cat] ?? "border-slate-300 text-slate-600"}`}>
              {t(`intraop.equipment.categories.${category.cat}`)}
            </p>
            <div className="space-y-1">
              {category.items.map(item => (
                <div key={item.label} className="flex items-baseline justify-between gap-2">
                  <span className="shrink-0 text-xs text-slate-500 dark:text-slate-400">
                    {t(`intraop.equipment.labels.${item.label}`)}
                  </span>
                  <div className="text-right">
                    <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                      {localizeText(item.value)}
                    </span>
                    {item.note ? (
                      <span className="block text-[10px] text-slate-400 dark:text-slate-500">
                        {localizeText(item.note)}
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
