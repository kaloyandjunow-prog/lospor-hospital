"use client"

import { useMemo, useState } from "react"
import { useLocale } from "next-intl"
import { Pencil } from "lucide-react"
import { resolveDrugSelectionSurface } from "@lospor/core/drug-selection"
import type { DoseProfile } from "@lospor/core/catalog"

// Drug names, units and route codes stay international; only the surrounding
// chrome is translated, matching the clinical display layer's bgSource policy.
const COPY = {
  en: {
    preview: "Preview",
    samplePatient: "Sample patient",
    sampleWeightAria: "Sample patient weight in kilograms",
    sliderAria: "Preview dose slider",
    unit: "Unit",
    autofill: "Autofill",
    quickDoses: "Quick doses",
    slider: "Slider",
    concentration: "Concentration",
    formulation: "Formulation",
    step: "step",
    none: "none",
    pills: (n: number) => `${n} pills`,
    noQuickDoses: "No quick-dose pills configured.",
    noConcentrations: "No concentrations configured.",
    edit: (what: string) => `Edit ${what}`,
    MISSING_TBW: "needs total body weight",
    MISSING_IBW: "needs ideal body weight",
    MISSING_BSA: "needs body surface area",
    NO_AUTOFILL: "no autofill configured",
  },
  bg: {
    preview: "Преглед",
    samplePatient: "Примерен пациент",
    sampleWeightAria: "Тегло на примерния пациент в килограми",
    sliderAria: "Плъзгач за преглед на дозата",
    unit: "Единица",
    autofill: "Автоматична доза",
    quickDoses: "Бързи дози",
    slider: "Плъзгач",
    concentration: "Концентрация",
    formulation: "Лекарствена форма",
    step: "стъпка",
    none: "няма",
    pills: (n: number) => `${n} бързи дози`,
    noQuickDoses: "Няма зададени бързи дози.",
    noConcentrations: "Няма зададени концентрации.",
    edit: (what: string) => `Редактирай ${what}`,
    MISSING_TBW: "изисква общо телесно тегло",
    MISSING_IBW: "изисква идеално телесно тегло",
    MISSING_BSA: "изисква телесна повърхност",
    NO_AUTOFILL: "няма зададено автоматично изчисление",
  },
} as const

/** Regions of the widget a clinician can click to jump straight into editing. */
export type PreviewSection =
  | "unit"
  | "autofill"
  | "quick"
  | "slider"
  | "concentration"
  | "formulation"

function Section({
  title,
  summary,
  section,
  active,
  onEdit,
  editLabel,
  children,
}: {
  title: string
  summary?: string
  section: PreviewSection
  active: boolean
  onEdit: (section: PreviewSection) => void
  editLabel: (what: string) => string
  children?: React.ReactNode
}) {
  return (
    <div
      className={`rounded-md border p-2 transition ${
        active
          ? "border-blue-400 bg-blue-50/60 dark:border-blue-500/50 dark:bg-blue-500/10"
          : "border-slate-200 dark:border-[#303030]"
      }`}
    >
      <button
        type="button"
        onClick={() => onEdit(section)}
        aria-label={editLabel(title)}
        className="flex w-full items-center justify-between gap-2 text-left"
      >
        <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          {title}
        </span>
        <span className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300">
          {summary}
          <Pencil className="h-3 w-3 shrink-0 text-slate-400" />
        </span>
      </button>
      {children ? <div className="mt-2">{children}</div> : null}
    </div>
  )
}

/**
 * Live preview of the dose widget a clinician will actually see.
 *
 * It is deliberately rendered from `resolveDrugSelectionSurface` — the same core
 * function the intraop screen uses — so the preview cannot drift from runtime
 * behaviour. Clicking a region asks the parent to open the matching form fields.
 */
export function ProfilePreview({
  profile,
  route,
  activeSection,
  onEdit,
  defaultWeightKg = 70,
}: {
  profile: DoseProfile
  route: string
  activeSection?: PreviewSection | null
  onEdit: (section: PreviewSection) => void
  /** Representative patient so the autofill number shown is real. */
  defaultWeightKg?: number
}) {
  const locale = useLocale()
  const copy = locale.startsWith("bg") ? COPY.bg : COPY.en
  const [weightKg, setWeightKg] = useState(defaultWeightKg)
  const [demoValue, setDemoValue] = useState<number | null>(null)

  const surface = useMemo(
    () => resolveDrugSelectionSurface({
      profile,
      route,
      patient: {
        totalBodyWeightKg: weightKg,
        idealBodyWeightKg: weightKg,
        bodySurfaceAreaM2: Math.sqrt((weightKg * 170) / 3600),
      },
      allowWeightBasisFallback: true,
    }),
    [profile, route, weightKg],
  )

  const autofill = surface.dose
    ? `${surface.dose} ${surface.unit}${surface.calculation?.basis && surface.calculation.basis !== "FLAT"
      ? ` (${surface.calculation.basis})`
      : ""}`
    : copy[surface.calculationUnavailableReason ?? "NO_AUTOFILL"] ?? "—"

  const sliderValue = demoValue ?? (surface.dose ? Number(surface.dose) : surface.min)

  return (
    <div className="space-y-2 rounded-lg border border-slate-300 bg-white p-3 dark:border-[#3a3a3a] dark:bg-[#1c1c1c]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-bold text-slate-700 dark:text-slate-200">
          {copy.preview} — {route}
        </p>
        <label className="flex items-center gap-1.5 text-xs text-slate-500">
          {copy.samplePatient}
          <input
            type="number"
            min={1}
            max={250}
            value={weightKg}
            onChange={event => {
              const next = Number(event.target.value)
              setWeightKg(Number.isFinite(next) && next > 0 ? next : 1)
              setDemoValue(null)
            }}
            aria-label={copy.sampleWeightAria}
            className="w-16 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs dark:border-[#3a3a3a] dark:bg-[#242424]"
          />
          kg
        </label>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <Section
          title={copy.unit}
          summary={surface.unit}
          section="unit"
          active={activeSection === "unit"}
          onEdit={onEdit}
          editLabel={copy.edit}
        />
        <Section
          title={copy.autofill}
          summary={autofill}
          section="autofill"
          active={activeSection === "autofill"}
          onEdit={onEdit}
          editLabel={copy.edit}
        />
      </div>

      <Section
        title={copy.quickDoses}
        summary={surface.quickValues.length ? copy.pills(surface.quickValues.length) : copy.none}
        section="quick"
        active={activeSection === "quick"}
        onEdit={onEdit}
        editLabel={copy.edit}
      >
        {surface.quickValues.length ? (
          <div className="flex flex-wrap gap-1.5">
            {surface.quickValues.map(value => (
              <button
                key={value}
                type="button"
                onClick={() => setDemoValue(value)}
                className={`rounded-full border px-2.5 py-1 text-xs font-semibold transition ${
                  demoValue === value
                    ? "border-blue-500 bg-blue-600 text-white"
                    : "border-slate-300 text-slate-700 dark:border-[#3a3a3a] dark:text-slate-200"
                }`}
              >
                {value} {surface.unit}
              </button>
            ))}
          </div>
        ) : (
          <p className="text-xs text-slate-400">{copy.noQuickDoses}</p>
        )}
      </Section>

      <Section
        title={copy.slider}
        summary={`${surface.min} – ${surface.max} ${surface.unit} · ${copy.step} ${surface.step}`}
        section="slider"
        active={activeSection === "slider"}
        onEdit={onEdit}
        editLabel={copy.edit}
      >
        <div className="flex items-center gap-2">
          <span className="w-10 shrink-0 text-right text-[11px] text-slate-400">{surface.min}</span>
          <input
            type="range"
            min={surface.min}
            max={surface.max}
            step={surface.step || 1}
            value={Math.min(Math.max(sliderValue, surface.min), surface.max)}
            onChange={event => setDemoValue(Number(event.target.value))}
            aria-label={copy.sliderAria}
            className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-slate-200 accent-blue-600 dark:bg-[#3a3a3a]"
          />
          <span className="w-10 shrink-0 text-[11px] text-slate-400">{surface.max}</span>
        </div>
        <p className="mt-1 text-center text-sm font-bold text-slate-800 dark:text-slate-100">
          {Math.min(Math.max(sliderValue, surface.min), surface.max)} {surface.unit}
        </p>
      </Section>

      {surface.concentrationOptions.length || activeSection === "concentration" ? (
        <Section
          title={copy.concentration}
          summary={surface.concentration || copy.none}
          section="concentration"
          active={activeSection === "concentration"}
          onEdit={onEdit}
          editLabel={copy.edit}
        >
          <div className="flex flex-wrap gap-1.5">
            {surface.concentrationOptions.map(option => (
              <span
                key={option}
                className={`rounded-full border px-2.5 py-1 text-xs ${
                  option === surface.concentration
                    ? "border-blue-500 bg-blue-50 font-semibold text-blue-700 dark:bg-blue-500/15 dark:text-blue-300"
                    : "border-slate-300 text-slate-600 dark:border-[#3a3a3a] dark:text-slate-300"
                }`}
              >
                {option}
              </span>
            ))}
            {!surface.concentrationOptions.length ? (
              <p className="text-xs text-slate-400">{copy.noConcentrations}</p>
            ) : null}
          </div>
        </Section>
      ) : null}

      {surface.formulationOptions.length ? (
        <Section
          title={copy.formulation}
          summary={surface.formulation ?? copy.none}
          section="formulation"
          active={activeSection === "formulation"}
          onEdit={onEdit}
          editLabel={copy.edit}
        >
          <div className="flex flex-wrap gap-1.5">
            {surface.formulationOptions.map(option => (
              <span
                key={option}
                className={`rounded-full border px-2.5 py-1 text-xs ${
                  option === surface.formulation
                    ? "border-blue-500 bg-blue-50 font-semibold text-blue-700 dark:bg-blue-500/15 dark:text-blue-300"
                    : "border-slate-300 text-slate-600 dark:border-[#3a3a3a] dark:text-slate-300"
                }`}
              >
                {option}
              </span>
            ))}
          </div>
        </Section>
      ) : null}
    </div>
  )
}
