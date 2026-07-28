"use client"

import { useState, useMemo } from "react"
import { Button } from "@/components/ui/button"
import { AlertCircle } from "lucide-react"

// ── Field label map — shows human-friendly names for known preop/postop fields ──
const FIELD_LABELS: Record<string, string> = {
  ageYears:              "Age (years)",
  sex:                   "Sex",
  heightCm:              "Height (cm)",
  weightKg:              "Weight (kg)",
  bloodType:             "Blood type",
  rhFactor:              "Rh factor",
  diagnosis:             "Diagnosis",
  plannedProcedure:      "Planned procedure",
  teamNotes:             "Team notes",
  highRiskSurgery:       "High-risk surgery",
  emergencySurgery:      "Emergency surgery",
  allergies:             "Allergies",
  allergyDetails:        "Allergy details",
  latexAllergy:          "Latex allergy",
  currentMedications:    "Current medications",
  familyAnesthesiaProblems: "Family anaesthesia history",
  familyAnesthesiaDetails:  "Family details",
  dentalProsthetics:     "Dental prosthetics",
  looseTeeth:            "Loose teeth",
  smoking:               "Smoking",
  substanceAbuse:        "Substance abuse",
  bpSystolic:            "BP systolic (mmHg)",
  bpDiastolic:           "BP diastolic (mmHg)",
  heartRate:             "Heart rate (bpm)",
  heartArrhythmia:       "Arrhythmia",
  spO2:                  "SpO₂ (%)",
  temperature:           "Temperature (°C)",
  respiratoryRate:       "Respiratory rate (/min)",
  mallampati:            "Mallampati",
  mouthOpeningCm:        "Mouth opening (cm)",
  thyromental:           "Thyromental distance (cm)",
  neckMobility:          "Neck mobility",
  upperLipBiteTest:      "Upper lip bite test",
  retrognathia:          "Retrognathia",
  prominentIncisors:     "Prominent incisors",
  facialHair:            "Facial hair",
  difficultAirwayHistory: "Difficult airway history",
  difficultAirwayNotes:  "Difficult airway notes",
  cormackLehane:         "Cormack-Lehane grade",
  asaScore:              "ASA class",
  physicalExamReport:    "Physical exam report",
  notes:                 "Notes",
  // postop
  aldreteActivity:       "Aldrete: Activity",
  aldreteRespiration:    "Aldrete: Respiration",
  aldreteCirculation:    "Aldrete: Circulation",
  aldreteConsciousness:  "Aldrete: Consciousness",
  aldreteSpO2:           "Aldrete: SpO₂",
  painScoreNRS:          "Pain score (NRS)",
  ponv:                  "PONV",
  temperatureCelsius:    "Temperature (°C)",
  disposition:           "Disposition",
  dispositionNotes:      "Disposition notes",
}

function displayValue(v: unknown): string {
  if (v === null || v === undefined) return "—"
  if (typeof v === "boolean") return v ? "Yes" : "No"
  if (Array.isArray(v)) {
    if (v.length === 0) return "—"
    return v.map(item => (typeof item === "object" && item !== null ? (item as { label?: unknown }).label ?? JSON.stringify(item) : String(item))).join(", ")
  }
  if (typeof v === "object") return JSON.stringify(v)
  return String(v)
}

// Skip fields that are metadata / always differ due to timestamps
const SKIP_FIELDS = new Set(["id", "caseId", "updatedAt", "createdAt", "bmi", "rcriScore", "apfelScore", "stopBangScore"])

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (a == null && b == null) return true
  if (a == null || b == null) return false
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false
    return a.every((item, i) => deepEqual(item, b[i]))
  }
  if (typeof a === "object" && typeof b === "object") {
    const keysA = Object.keys(a as object)
    const keysB = Object.keys(b as object)
    if (keysA.length !== keysB.length) return false
    return keysA.every(k => deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]))
  }
  return false
}

type Choice = "local" | "server"

interface ConflictField {
  key: string
  label: string
  localValue: unknown
  serverValue: unknown
}

export interface ConflictModalProps {
  open: boolean
  onClose: () => void
  localValues: Record<string, unknown>
  serverValues: Record<string, unknown>
  onResolve: (resolved: Record<string, unknown>) => void
}

export function ConflictModal({ open, onClose, localValues, serverValues, onResolve }: ConflictModalProps) {
  const fields = useMemo<ConflictField[]>(() => {
    const allKeys = new Set([...Object.keys(localValues), ...Object.keys(serverValues)])
    const result: ConflictField[] = []
    for (const key of allKeys) {
      if (SKIP_FIELDS.has(key)) continue
      const local  = localValues[key]
      const server = serverValues[key]
      if (!deepEqual(local, server)) {
        result.push({
          key,
          label: FIELD_LABELS[key] ?? key.replace(/([A-Z])/g, " $1").replace(/^./, s => s.toUpperCase()),
          localValue:  local,
          serverValue: server,
        })
      }
    }
    return result
  }, [localValues, serverValues])

  const [choices, setChoices] = useState<Record<string, Choice>>({})

  if (!open) return null

  const allResolved = fields.every(f => (choices[f.key] ?? "local") !== undefined)

  function handleResolve() {
    // Start with serverValues as base, then apply chosen sides
    const merged: Record<string, unknown> = { ...serverValues }
    for (const field of fields) {
      const choice = choices[field.key] ?? "local"
      merged[field.key] = choice === "local" ? field.localValue : field.serverValue
    }
    // Also carry over any local fields not in serverValues (new data)
    for (const key of Object.keys(localValues)) {
      if (!(key in serverValues)) merged[key] = localValues[key]
    }
    onResolve(merged)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-[#1e1e1e] rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start gap-3 px-5 py-4 border-b border-slate-200 dark:border-[#2a2a2a]">
          <div className="flex items-center justify-center w-8 h-8 rounded-full bg-amber-100 dark:bg-amber-900/30 shrink-0 mt-0.5">
            <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-semibold text-slate-800 dark:text-slate-100">Edit conflict</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
              This case was modified by another session while you were editing. Review each conflicting field and choose which version to keep.
            </p>
          </div>
        </div>

        {/* Fields */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          {fields.length === 0 ? (
            <p className="text-sm text-slate-500 text-center py-6">No conflicting fields detected.</p>
          ) : (
            <>
              {/* Column headers */}
              <div className="grid grid-cols-[1fr_1fr_1fr] gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500 pb-1 border-b border-slate-100 dark:border-[#2a2a2a]">
                <span>Field</span>
                <span>Your edit</span>
                <span>Server version</span>
              </div>

              {fields.map(field => {
                const choice = choices[field.key] ?? "local"
                return (
                  <div key={field.key} className="grid grid-cols-[1fr_1fr_1fr] gap-2 items-start py-2 border-b border-slate-50 dark:border-[#252525] last:border-0">
                    {/* Field name */}
                    <div className="text-sm text-slate-600 dark:text-slate-400 font-medium pr-2">
                      {field.label}
                    </div>

                    {/* Local value + button */}
                    <button
                      type="button"
                      onClick={() => setChoices(prev => ({ ...prev, [field.key]: "local" }))}
                      className={`text-left rounded-lg border-2 px-3 py-2 text-sm transition-all ${
                        choice === "local"
                          ? "border-blue-500 bg-blue-50 dark:bg-blue-950/30 dark:border-blue-400"
                          : "border-slate-200 dark:border-[#333] hover:border-slate-300 dark:hover:border-[#444]"
                      }`}
                    >
                      <span className="block text-[10px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500 mb-0.5">Keep mine</span>
                      <span className={`block break-words ${choice === "local" ? "text-blue-700 dark:text-blue-300 font-medium" : "text-slate-700 dark:text-slate-300"}`}>
                        {displayValue(field.localValue)}
                      </span>
                    </button>

                    {/* Server value + button */}
                    <button
                      type="button"
                      onClick={() => setChoices(prev => ({ ...prev, [field.key]: "server" }))}
                      className={`text-left rounded-lg border-2 px-3 py-2 text-sm transition-all ${
                        choice === "server"
                          ? "border-amber-500 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-400"
                          : "border-slate-200 dark:border-[#333] hover:border-slate-300 dark:hover:border-[#444]"
                      }`}
                    >
                      <span className="block text-[10px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500 mb-0.5">Use theirs</span>
                      <span className={`block break-words ${choice === "server" ? "text-amber-700 dark:text-amber-300 font-medium" : "text-slate-700 dark:text-slate-300"}`}>
                        {displayValue(field.serverValue)}
                      </span>
                    </button>
                  </div>
                )
              })}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-t border-slate-200 dark:border-[#2a2a2a] bg-slate-50 dark:bg-[#181818]">
          <p className="text-xs text-slate-400 dark:text-slate-500">
            {fields.length} conflicting field{fields.length !== 1 ? "s" : ""} · choices apply on save
          </p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button
              size="sm"
              className="bg-blue-600 hover:bg-blue-700 text-white"
              disabled={!allResolved}
              onClick={handleResolve}
            >
              Save resolved version
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
