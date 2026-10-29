"use client"

import { useMemo, useState } from "react"
import { useLocale, useTranslations } from "next-intl"
import { AlertTriangle, Plus, X } from "lucide-react"
import { specialtyLabel } from "@lospor/core/nhis-specialties"
import {
  MEDICATION_HOLD_HOURS,
  holdHoursText,
  isInstructionMedicationCurrent,
  preopOrderOptionsFor,
  wardOrderIdentity,
  type PreopOrderOption,
  type PreopSectionConfig,
} from "@lospor/core/preop-orders"
import { LAB_CATEGORIES } from "@/lib/labs"
import { randomId } from "@/lib/random-id"
import { Button } from "@/components/ui/button"
import type { PreopData } from "@/components/forms/preopSchema"

type WardOrder = PreopData["preopWardOrders"][number]
type Instruction = PreopData["preopMedicationInstructions"][number]
type Medication = { label: string; inn?: string; atcCode?: string }

const SELECT = "h-9 rounded-md border border-slate-300 bg-white px-2 text-sm text-slate-800 dark:border-[#3a3a3a] dark:bg-[#181818] dark:text-slate-100"

function useLanguage(): "en" | "bg" {
  return useLocale() === "bg" ? "bg" : "en"
}

/** A row's name in the form's language: the hospital's row, or the case's own copy when the row is gone. */
function rowLabel(option: Pick<PreopOrderOption, "labelEn" | "labelBg"> | undefined, held: Record<string, unknown> | undefined, language: "en" | "bg"): string {
  const source = option ?? held
  const label = language === "bg" ? source?.labelBg : source?.labelEn
  return typeof label === "string" ? label : ""
}

/**
 * Preoperative ward orders: a tick per row, a specialty for each consultation
 * and a test for each investigation. "No additional orders" stands alone:
 * ticking it clears the rest, and ticking anything else clears it.
 */
export function PreopWardOrdersSection({ config, value, onChange }: {
  config: PreopSectionConfig
  value: WardOrder[]
  onChange: (next: WardOrder[]) => void
}) {
  const t = useTranslations("preop.orders")
  const language = useLanguage()
  const options = preopOrderOptionsFor(config, "WARD_ORDER")
  const byKey = new Map(config.orderOptions.map(option => [option.key, option]))
  const noneKeys = new Set(config.orderOptions.filter(option => option.kind === "NONE").map(option => option.key))
  // A row the hospital switched off after this case ordered it stays listed.
  const heldOff = value.filter(order => !options.some(option => option.key === order.optionKey))
  const ordered = (key: string) => value.filter(order => order.optionKey === key)

  function toggle(option: PreopOrderOption, checked: boolean) {
    if (!checked) return onChange(value.filter(order => order.optionKey !== option.key))
    if (option.kind === "NONE") return onChange([{ optionKey: option.key }])
    // A consultation or a picked test is added with its choice, not by the tick alone.
    if (option.kind === "CONSULT" || (option.kind === "LAB" && !option.labTest)) return
    onChange([...value.filter(order => !noneKeys.has(order.optionKey)), { optionKey: option.key }])
  }

  function add(order: WardOrder) {
    if (value.some(item => wardOrderIdentity(item) === wardOrderIdentity(order))) return
    onChange([...value.filter(item => !noneKeys.has(item.optionKey)), order])
  }

  function remove(order: WardOrder) {
    onChange(value.filter(item => wardOrderIdentity(item) !== wardOrderIdentity(order)))
  }

  return (
    <div className="space-y-2" data-testid="preop-ward-orders">
      {/* Two columns on a wide screen: nine rows in one were a screen of ticks (10.0.0). */}
      <div className="grid gap-x-8 gap-y-1 md:grid-cols-2">
      {options.map(option => {
        const label = rowLabel(option, undefined, language)
        if (option.kind === "CONSULT" || (option.kind === "LAB" && !option.labTest)) {
          return (
            <ChoiceRow
              key={option.key}
              option={option}
              label={label}
              orders={ordered(option.key)}
              onAdd={add}
              onRemove={remove}
              specialtyKeys={config.consultSpecialtyKeys}
            />
          )
        }
        return (
          <label key={option.key} className="flex min-h-9 items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="h-4 w-4"
              checked={ordered(option.key).length > 0}
              onChange={event => toggle(option, event.target.checked)}
            />
            <span>{label}</span>
          </label>
        )
      })}
      </div>
      {heldOff.length > 0 && (
        <div className="space-y-1 border-t border-slate-100 pt-2 dark:border-[#2a2a2a]">
          <p className="text-xs text-slate-500">{t("switchedOff")}</p>
          {heldOff.map(order => (
            <div key={wardOrderIdentity(order)} className="flex items-center justify-between gap-2 text-sm">
              <span>{heldOrderText(order, byKey.get(order.optionKey), language)}</span>
              <Button type="button" size="icon-sm" variant="ghost" aria-label={t("remove")} onClick={() => remove(order)}><X className="h-3.5 w-3.5" /></Button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function heldOrderText(order: WardOrder, option: PreopOrderOption | undefined, language: "en" | "bg"): string {
  const label = rowLabel(option, order, language)
  const choice = order.specialtyKey ? specialtyLabel(order.specialtyKey, language) : order.labTest
  return choice ? `${label} ${choice}` : label
}

/** A consultation or an investigation: each specialty or test chosen is an order of its own. */
function ChoiceRow({ option, label, orders, onAdd, onRemove, specialtyKeys }: {
  option: PreopOrderOption
  label: string
  orders: WardOrder[]
  onAdd: (order: WardOrder) => void
  onRemove: (order: WardOrder) => void
  specialtyKeys: string[]
}) {
  const t = useTranslations("preop.orders")
  const language = useLanguage()
  const consult = option.kind === "CONSULT"
  const [open, setOpen] = useState(false)
  const specialties = useMemo(() => specialtyKeys
    .map(key => ({ key, label: specialtyLabel(key, language) ?? key }))
    .sort((a, b) => a.label.localeCompare(b.label, language)), [specialtyKeys, language])
  const chosen = (order: WardOrder) => consult
    ? (order.specialtyKey ? specialtyLabel(order.specialtyKey, language) ?? order.specialtyKey : "")
    : order.labTest ?? ""

  function pick(raw: string) {
    if (!raw) return
    onAdd(consult ? { optionKey: option.key, specialtyKey: raw } : { optionKey: option.key, labTest: raw })
    setOpen(false)
  }

  return (
    <div className="space-y-1.5" data-testid={`preop-order-${option.key}`}>
      <label className="flex min-h-9 items-center gap-2 text-sm">
        <input
          type="checkbox"
          className="h-4 w-4"
          checked={orders.length > 0 || open}
          onChange={event => {
            if (event.target.checked) setOpen(true)
            else { setOpen(false); orders.forEach(onRemove) }
          }}
        />
        <span>{label}{orders.length > 0 ? "…" : ""}</span>
      </label>
      {(orders.length > 0 || open) && (
        <div className="ml-6 space-y-1.5">
          {orders.map(order => (
            <div key={wardOrderIdentity(order)} className="flex items-center justify-between gap-2 rounded-md bg-slate-50 px-2 py-1 text-sm dark:bg-[#1c1c1c]">
              <span>{chosen(order)}</span>
              <Button type="button" size="icon-sm" variant="ghost" aria-label={`${t("remove")} ${chosen(order)}`} onClick={() => onRemove(order)}><X className="h-3.5 w-3.5" /></Button>
            </div>
          ))}
          {open ? (
            <select
              className={`${SELECT} w-full`}
              aria-label={consult ? t("pickSpecialty") : t("pickTest")}
              defaultValue=""
              onChange={event => pick(event.target.value)}
            >
              <option value="" disabled>{consult ? t("pickSpecialty") : t("pickTest")}</option>
              {consult
                ? specialties.filter(item => !orders.some(order => order.specialtyKey === item.key)).map(item => <option key={item.key} value={item.key}>{item.label}</option>)
                : LAB_CATEGORIES.map(category => (
                    <optgroup key={category.id} label={category.label}>
                      {category.tests.filter(test => !orders.some(order => order.labTest === test.name)).map(test => <option key={test.name} value={test.name}>{test.name}</option>)}
                    </optgroup>
                  ))}
            </select>
          ) : (
            <Button type="button" size="sm" variant="outline" className="gap-1" onClick={() => setOpen(true)}>
              <Plus className="h-3.5 w-3.5" /> {consult ? t("addSpecialty") : t("addTest")}
            </Button>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * Medication instructions, grouped by row: "stop taking" with a drug from the
 * current medications and the hours before surgery, "don't stop taking" with
 * a drug, and any rows the hospital adds. A drug since taken off the
 * medication list is flagged, not dropped.
 */
export function PreopMedicationInstructionsSection({ config, value, onChange, medications }: {
  config: PreopSectionConfig
  value: Instruction[]
  onChange: (next: Instruction[]) => void
  medications: Medication[]
}) {
  const t = useTranslations("preop.orders")
  const language = useLanguage()
  const options = preopOrderOptionsFor(config, "MEDICATION_INSTRUCTION")
  const byKey = new Map(config.orderOptions.map(option => [option.key, option]))
  const groups = [
    ...options,
    // A row the hospital switched off after this case used it stays listed.
    ...[...new Set(value.map(row => row.optionKey))].filter(key => !options.some(option => option.key === key)).map(key => byKey.get(key)).filter((option): option is PreopOrderOption => !!option),
  ]
  const orphans = value.filter(row => !byKey.has(row.optionKey))

  const update = (id: string, patch: Partial<Instruction>) => onChange(value.map(row => row.id === id ? { ...row, ...patch } : row))
  const remove = (id: string) => onChange(value.filter(row => row.id !== id))
  const add = (option: PreopOrderOption) => onChange([...value, {
    id: randomId(),
    optionKey: option.key,
    medicationLabel: "",
    medicationInn: null,
    medicationAtc: null,
    hoursBefore: option.hoursMode === "REQUIRED" ? 24 : null,
  }])

  function pickMedication(id: string, label: string) {
    const medication = medications.find(item => item.label === label)
    update(id, { medicationLabel: label, medicationInn: medication?.inn ?? null, medicationAtc: medication?.atcCode ?? null })
  }

  if (medications.length === 0 && value.length === 0) {
    return <p className="text-sm text-slate-500" data-testid="preop-medication-instructions">{t("noMedications")}</p>
  }

  return (
    <div className="space-y-4" data-testid="preop-medication-instructions">
      {groups.map(option => {
        const rows = value.filter(row => row.optionKey === option.key)
        const label = rowLabel(option, undefined, language)
        return (
          <div key={option.key} className="space-y-1.5" data-testid={`preop-instruction-${option.key}`}>
            <p className="text-sm font-medium">{label}</p>
            {rows.map(row => {
              const listed = medications.some(item => item.label === row.medicationLabel)
              const removed = row.medicationLabel !== "" && !isInstructionMedicationCurrent(row as { medicationLabel: string; medicationInn: string | null }, medications)
              return (
                <div key={row.id} className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      className={`${SELECT} min-w-40 flex-1`}
                      aria-label={`${label}: ${t("pickMedication")}`}
                      value={row.medicationLabel}
                      onChange={event => pickMedication(row.id, event.target.value)}
                    >
                      <option value="" disabled>{t("pickMedication")}</option>
                      {!listed && row.medicationLabel ? <option value={row.medicationLabel}>{row.medicationLabel}</option> : null}
                      {medications.map(item => <option key={item.label} value={item.label}>{item.label}</option>)}
                    </select>
                    {option.hoursMode !== "NONE" && (
                      <>
                        <select
                          className={SELECT}
                          aria-label={`${label}: ${t("hours")}`}
                          value={row.hoursBefore ?? ""}
                          onChange={event => update(row.id, { hoursBefore: event.target.value === "" ? null : Number(event.target.value) })}
                        >
                          {option.hoursMode === "OPTIONAL" && <option value="">—</option>}
                          {MEDICATION_HOLD_HOURS.map(hours => <option key={hours} value={hours}>{holdHoursText(hours, language)}</option>)}
                        </select>
                        <span className="text-xs text-slate-500">{t("beforeSurgery")}</span>
                      </>
                    )}
                    <Button type="button" size="icon-sm" variant="ghost" aria-label={t("remove")} onClick={() => remove(row.id)}><X className="h-3.5 w-3.5" /></Button>
                  </div>
                  {removed && (
                    <p className="flex items-center gap-1 text-xs font-medium text-amber-700 dark:text-amber-400" role="alert" data-testid="instruction-medication-removed">
                      <AlertTriangle className="h-3.5 w-3.5" /> {t("medicationRemoved", { medication: row.medicationLabel })}
                    </p>
                  )}
                </div>
              )
            })}
            {options.includes(option) && (
              <Button type="button" size="sm" variant="outline" className="gap-1" onClick={() => add(option)} aria-label={`${t("add")}: ${label}`}>
                <Plus className="h-3.5 w-3.5" /> {t("add")}
              </Button>
            )}
          </div>
        )
      })}
      {orphans.map(row => (
        <p key={row.id} className="text-sm">{rowLabel(undefined, row, language)} {row.medicationLabel}</p>
      ))}
    </div>
  )
}
