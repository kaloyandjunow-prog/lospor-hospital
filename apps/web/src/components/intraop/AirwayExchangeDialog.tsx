"use client"

import { useMemo, useState } from "react"
import { useTranslations } from "next-intl"
import { X } from "lucide-react"
import { AIRWAY_DEVICE_REQUIRED_FIELDS } from "@lospor/core/intraop"
import {
  airwayDevicesInUse,
  replaceAirwayDevice,
  type AirwayDeviceEntry,
  type AirwayExchangeReason,
} from "@lospor/core/airway-device-entries"
import { clinicalRecordId } from "@lospor/core/clinical-record-id"

/**
 * The airway picker, embedded (10.2.0): opened by Reintubation, Airway
 * exchange, unplanned extubation's "Reintubate?" and the rescues. The new
 * device goes on the airway list as its own entry; the one it replaces stays,
 * marked replaced after a planned exchange and failed otherwise (Core's
 * replaceAirwayDevice), so a reintubation counts two tubes.
 */

const REASONS: readonly Exclude<AirwayExchangeReason, "reintubation">[] = ["planned", "failed_device", "unplanned_extubation"]

type Details = Record<string, string | number | boolean>

export function AirwayExchangeDialog({ entries, deviceOptions, deviceLabel, reason: fixedReason, at, onSave, onCancel }: {
  entries: readonly AirwayDeviceEntry[]
  deviceOptions: readonly { value: string; label: string }[]
  /** A device's name in the screen's language. */
  deviceLabel: (code: string) => string
  /** Set when the entry that opened the picker already says why (Reintubation). */
  reason?: AirwayExchangeReason | null
  /** When the new device went in: the event's time, or now. */
  at: string
  onSave: (next: AirwayDeviceEntry[]) => void
  onCancel: () => void
}) {
  const t = useTranslations("intraop.airwayExchange")
  const ta = useTranslations("intraop.airway")
  const inUse = useMemo(() => airwayDevicesInUse(entries), [entries])
  const [reason, setReason] = useState<AirwayExchangeReason | null>(fixedReason ?? null)
  const [outId, setOutId] = useState<string | null>(inUse.length > 0 ? inUse[inUse.length - 1]!.id : null)
  const [device, setDevice] = useState<string | null>(inUse.length > 0 ? inUse[inUse.length - 1]!.device : null)
  const [details, setDetails] = useState<Details>(() => ({ ...(inUse[inUse.length - 1]?.details as Details | undefined) }))
  const fields = device ? (AIRWAY_DEVICE_REQUIRED_FIELDS as Record<string, readonly string[]>)[device] ?? [] : []

  function save() {
    if (!device || !reason) return
    const id = clinicalRecordId("airway", at)
    const kept = Object.fromEntries(fields.filter(field => details[field] !== undefined && details[field] !== "").map(field => [field, details[field]]))
    onSave(replaceAirwayDevice(entries, outId, { id, device, details: kept, insertedAt: at }, reason))
  }

  const pill = (active: boolean) => `text-xs px-2.5 py-1 rounded-full border ${active
    ? "border-sky-500 bg-sky-50 text-sky-700 dark:bg-sky-900/30 dark:text-sky-200"
    : "border-slate-300 dark:border-slate-600"}`

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/30 p-4" onClick={onCancel}>
      <div role="dialog" aria-label={t("title")} data-testid="airway-exchange"
        className="w-full max-w-md rounded-xl bg-white dark:bg-[#161616] border border-slate-200 dark:border-[#333] shadow-2xl p-4 space-y-3"
        onClick={event => event.stopPropagation()}>
        <div className="flex items-center">
          <p className="flex-1 text-sm font-semibold">{t("title")}</p>
          <button type="button" onClick={onCancel} aria-label={t("cancel")} className="p-1"><X className="w-4 h-4" /></button>
        </div>
        {!fixedReason && (
          <div>
            <p className="text-xs text-slate-500 mb-1">{t("why")}</p>
            <div className="flex flex-wrap gap-1.5">
              {REASONS.map(option => (
                <button key={option} type="button" data-testid={`airway-reason-${option}`} className={pill(reason === option)} onClick={() => setReason(option)}>
                  {t(`reason.${option}`)}
                </button>
              ))}
            </div>
          </div>
        )}
        {inUse.length > 1 && (
          <div>
            <p className="text-xs text-slate-500 mb-1">{t("which")}</p>
            <div className="flex flex-wrap gap-1.5">
              {inUse.map(entry => (
                <button key={entry.id} type="button" className={pill(outId === entry.id)} onClick={() => setOutId(entry.id)}>
                  {deviceLabel(entry.device)}
                </button>
              ))}
            </div>
          </div>
        )}
        <div>
          <p className="text-xs text-slate-500 mb-1">{t("newDevice")}</p>
          <div className="flex flex-wrap gap-1.5">
            {deviceOptions.map(option => (
              <button key={option.value} type="button" data-testid={`airway-device-${option.value}`} className={pill(device === option.value)}
                onClick={() => { setDevice(option.value); if (option.value !== device) setDetails({}) }}>
                {option.label}
              </button>
            ))}
          </div>
        </div>
        {fields.length > 0 && (
          <div className="flex flex-wrap gap-3">
            {fields.map(field => field.endsWith("Cuffed") ? (
              <label key={field} className="flex items-center gap-1.5 text-xs">
                <input type="checkbox" checked={details[field] === true} onChange={event => setDetails(prev => ({ ...prev, [field]: event.target.checked }))} />
                {ta("cuffed")}
              </label>
            ) : (
              <label key={field} className="text-xs flex flex-col gap-0.5">
                <span className="text-slate-500">{field === "dltType" ? ta("dltType") : field === "dltSide" ? ta("dltSide") : field === "lmaSize" ? ta("lmaSize") : field === "dltSize" ? ta("dltSizeFr") : ta("tubeSizeMmId")}</span>
                <input data-testid={`airway-field-${field}`} value={String(details[field] ?? "")}
                  inputMode={field === "dltType" || field === "dltSide" ? "text" : "decimal"}
                  onChange={event => {
                    const raw = event.target.value
                    const number = Number(raw.replace(",", "."))
                    setDetails(prev => ({ ...prev, [field]: field === "dltType" || field === "dltSide" || raw === "" || !Number.isFinite(number) ? raw : number }))
                  }}
                  className="w-24 px-2 py-1 rounded border border-slate-300 dark:border-slate-600 bg-transparent" />
              </label>
            ))}
          </div>
        )}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="text-xs px-3 py-1.5 rounded-full border border-slate-300 dark:border-slate-600">{t("cancel")}</button>
          <button type="button" data-testid="airway-exchange-save" disabled={!device || !reason} onClick={save}
            className="text-xs px-3 py-1.5 rounded-full border border-emerald-400 text-emerald-600 disabled:opacity-50">{t("save")}</button>
        </div>
      </div>
    </div>
  )
}
