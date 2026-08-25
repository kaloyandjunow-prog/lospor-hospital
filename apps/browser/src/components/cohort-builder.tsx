"use client"

import { useEffect, useId, useMemo, useState } from "react"
import { BookmarkPlus, Play, RotateCcw, Save } from "lucide-react"
import { clinicalDisplayLabel } from "@lospor/core/display"
import {
  pediatricAgeToApproximateDays,
  type PediatricAgeUnit,
} from "@lospor/core/pediatric"
import {
  RESEARCH_CASE_STATUSES,
  type ResearchCaseQueryResponse,
  type ResearchCohortDefinition,
  type ResearchMetadata,
  type ResearchQueryResponse,
  type SavedResearchCohort,
} from "@lospor/core/research"
import { ApiError, apiJson } from "@/lib/client-api"
import { formatResearchCount } from "@/lib/research-disclosure"
import {
  complicationChoices,
  optionChoices,
} from "@/lib/clinical-display"
import { CasesTable } from "./cases-table"
import { ClinicalMultiSelect } from "./clinical-multi-select"
import { ClinicalSearchSelect } from "./clinical-search-select"
import { DistributionChart } from "./distribution-chart"
import { MetricCard } from "./metric-card"
import { useLocale } from "./locale-provider"

export type FormState = {
  status: string
  from: string
  to: string
  ageMin: string
  ageMax: string
  ageUnit: PediatricAgeUnit
  clinicalMode: string
  bmiMin: string
  bmiMax: string
  durationMin: string
  durationMax: string
  aldreteMin: string
  aldreteMax: string
  painMin: string
  painMax: string
  sex: string
  asa: string
  emergency: string
  highRisk: string
  ponv: string
  diagnosisCode: string
  diagnosisText: string
  comorbidityCode: string
  comorbidityText: string
  procedureCode: string
  procedureText: string
  procedureGroup: string
  technique: string
  position: string
  airway: string
  monitoring: string
  medication: string
  atcCode: string
  complication: string
  disposition: string
  mappingStatus: string
  completeness: string
}

const EMPTY: FormState = {
  status: "COMPLETE",
  from: "",
  to: "",
  ageMin: "",
  ageMax: "",
  ageUnit: "YEARS",
  clinicalMode: "",
  bmiMin: "",
  bmiMax: "",
  durationMin: "",
  durationMax: "",
  aldreteMin: "",
  aldreteMax: "",
  painMin: "",
  painMax: "",
  sex: "",
  asa: "",
  emergency: "",
  highRisk: "",
  ponv: "",
  diagnosisCode: "",
  diagnosisText: "",
  comorbidityCode: "",
  comorbidityText: "",
  procedureCode: "",
  procedureText: "",
  procedureGroup: "",
  technique: "",
  position: "",
  airway: "",
  monitoring: "",
  medication: "",
  atcCode: "",
  complication: "",
  disposition: "",
  mappingStatus: "",
  completeness: "",
}

const EDITABLE_FILTER_KEYS: ReadonlyArray<keyof ResearchCohortDefinition["filters"]> = [
  "statuses", "clinicalModes", "finalized", "ageDays", "ageYears", "bmi",
  "durationMinutes", "aldreteTotal", "painScore", "sex", "asa", "emergency",
  "highRisk", "ponv", "diagnosisCodes", "diagnosisText", "comorbidityCodes",
  "comorbidityText", "procedureCodes", "procedureText", "procedureGroups",
  "techniques", "positions", "airwayDevices", "monitoring", "medications",
  "atcCodes", "complications", "dispositions", "mappingStatuses",
  "minimumCompleteness",
]

function list(value: string) {
  const values = value.split(",").map(item => item.trim()).filter(Boolean)
  return values.length ? values : undefined
}

function number(value: string) {
  if (!value.trim()) return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

export function researchMonthStart(value: string): string | undefined {
  if (/^\d{4}-(0[1-9]|1[0-2])-([012]\d|3[01])$/.test(value)) return value
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(value)
  return match ? `${match[1]}-${match[2]}-01` : undefined
}

export function researchMonthEnd(value: string): string | undefined {
  if (/^\d{4}-(0[1-9]|1[0-2])-([012]\d|3[01])$/.test(value)) return value
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(value)
  if (!match) return undefined
  const year = Number(match[1])
  const month = Number(match[2])
  const finalDay = new Date(Date.UTC(year, month, 0)).getUTCDate()
  return `${match[1]}-${match[2]}-${String(finalDay).padStart(2, "0")}`
}

function ageRange(
  min: number | undefined,
  max: number | undefined,
  unit: PediatricAgeUnit,
): { ageYears?: { min?: number; max?: number }; ageDays?: { min?: number; max?: number } } {
  if (min === undefined && max === undefined) return {}
  const range = {
    ...(min !== undefined ? { min } : {}),
    ...(max !== undefined ? { max } : {}),
  }
  if (unit === "YEARS") return { ageYears: range }
  return { ageDays: {
    ...(min !== undefined ? { min: pediatricAgeToApproximateDays(min, unit) } : {}),
    ...(max !== undefined ? { max: pediatricAgeToApproximateDays(max, unit) } : {}),
  } }
}

function formNumber(value: number | undefined) {
  return value === undefined ? "" : String(value)
}

function formList(value: string[] | undefined) {
  return value?.join(", ") ?? ""
}

function formBoolean(value: boolean | undefined) {
  return value === undefined ? "" : String(value)
}

function researchMonth(value: string | undefined) {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : ""
}

export function formFromCohort(definition: ResearchCohortDefinition): FormState {
  const filters = definition.filters
  const age = filters.ageDays ?? filters.ageYears
  return {
    ...EMPTY,
    status: formList(filters.statuses),
    from: researchMonth(filters.finalized?.from),
    to: researchMonth(filters.finalized?.to),
    ageMin: formNumber(age?.min),
    ageMax: formNumber(age?.max),
    ageUnit: filters.ageDays ? "DAYS" : "YEARS",
    clinicalMode: formList(filters.clinicalModes),
    bmiMin: formNumber(filters.bmi?.min),
    bmiMax: formNumber(filters.bmi?.max),
    durationMin: formNumber(filters.durationMinutes?.min),
    durationMax: formNumber(filters.durationMinutes?.max),
    aldreteMin: formNumber(filters.aldreteTotal?.min),
    aldreteMax: formNumber(filters.aldreteTotal?.max),
    painMin: formNumber(filters.painScore?.min),
    painMax: formNumber(filters.painScore?.max),
    sex: formList(filters.sex),
    asa: formList(filters.asa),
    emergency: formBoolean(filters.emergency),
    highRisk: formBoolean(filters.highRisk),
    ponv: formBoolean(filters.ponv),
    diagnosisCode: formList(filters.diagnosisCodes),
    diagnosisText: filters.diagnosisText ?? "",
    comorbidityCode: formList(filters.comorbidityCodes),
    comorbidityText: filters.comorbidityText ?? "",
    procedureCode: formList(filters.procedureCodes),
    procedureText: filters.procedureText ?? "",
    procedureGroup: formList(filters.procedureGroups),
    technique: formList(filters.techniques),
    position: formList(filters.positions),
    airway: formList(filters.airwayDevices),
    monitoring: formList(filters.monitoring),
    medication: formList(filters.medications),
    atcCode: formList(filters.atcCodes),
    complication: formList(filters.complications),
    disposition: formList(filters.dispositions),
    mappingStatus: formList(filters.mappingStatuses),
    completeness: formNumber(filters.minimumCompleteness),
  }
}

export function preservedCohortFilters(
  definition: ResearchCohortDefinition,
): ResearchCohortDefinition["filters"] {
  const preserved = { ...definition.filters }
  for (const key of EDITABLE_FILTER_KEYS) delete preserved[key]
  return preserved
}

export function buildCohort(
  input: Partial<FormState>,
  preservedFilters: ResearchCohortDefinition["filters"] = {},
): ResearchCohortDefinition {
  const form = { ...EMPTY, ...input }
  const ageMin = number(form.ageMin)
  const ageMax = number(form.ageMax)
  const bmiMin = number(form.bmiMin)
  const bmiMax = number(form.bmiMax)
  const durationMin = number(form.durationMin)
  const durationMax = number(form.durationMax)
  const aldreteMin = number(form.aldreteMin)
  const aldreteMax = number(form.aldreteMax)
  const painMin = number(form.painMin)
  const painMax = number(form.painMax)
  const finalizedFrom = researchMonthStart(form.from)
  const finalizedTo = researchMonthEnd(form.to)
  return {
    version: 1,
    filters: {
      ...preservedFilters,
      statuses: (list(form.status) ?? ["COMPLETE"]) as ResearchCohortDefinition["filters"]["statuses"],
      ...(finalizedFrom || finalizedTo ? { finalized: {
        ...(finalizedFrom ? { from: finalizedFrom } : {}),
        ...(finalizedTo ? { to: finalizedTo } : {}),
      } } : {}),
      ...ageRange(ageMin, ageMax, form.ageUnit),
      ...(form.clinicalMode ? { clinicalModes: list(form.clinicalMode) as ResearchCohortDefinition["filters"]["clinicalModes"] } : {}),
      ...(bmiMin !== undefined || bmiMax !== undefined ? { bmi: {
        ...(bmiMin !== undefined ? { min: bmiMin } : {}),
        ...(bmiMax !== undefined ? { max: bmiMax } : {}),
      } } : {}),
      ...(durationMin !== undefined || durationMax !== undefined ? { durationMinutes: {
        ...(durationMin !== undefined ? { min: durationMin } : {}),
        ...(durationMax !== undefined ? { max: durationMax } : {}),
      } } : {}),
      ...(aldreteMin !== undefined || aldreteMax !== undefined ? { aldreteTotal: {
        ...(aldreteMin !== undefined ? { min: aldreteMin } : {}),
        ...(aldreteMax !== undefined ? { max: aldreteMax } : {}),
      } } : {}),
      ...(painMin !== undefined || painMax !== undefined ? { painScore: {
        ...(painMin !== undefined ? { min: painMin } : {}),
        ...(painMax !== undefined ? { max: painMax } : {}),
      } } : {}),
      ...(form.sex ? { sex: list(form.sex) } : {}),
      ...(form.asa ? { asa: list(form.asa) } : {}),
      ...(form.emergency ? { emergency: form.emergency === "true" } : {}),
      ...(form.highRisk ? { highRisk: form.highRisk === "true" } : {}),
      ...(form.ponv ? { ponv: form.ponv === "true" } : {}),
      ...(form.diagnosisCode ? { diagnosisCodes: list(form.diagnosisCode) } : {}),
      ...(form.diagnosisText ? { diagnosisText: form.diagnosisText } : {}),
      ...(form.comorbidityCode ? { comorbidityCodes: list(form.comorbidityCode) } : {}),
      ...(form.comorbidityText ? { comorbidityText: form.comorbidityText } : {}),
      ...(form.procedureCode ? { procedureCodes: list(form.procedureCode) } : {}),
      ...(form.procedureText ? { procedureText: form.procedureText } : {}),
      ...(form.procedureGroup ? { procedureGroups: list(form.procedureGroup) } : {}),
      ...(form.technique ? { techniques: list(form.technique) } : {}),
      ...(form.position ? { positions: list(form.position) } : {}),
      ...(form.airway ? { airwayDevices: list(form.airway) } : {}),
      ...(form.monitoring ? { monitoring: list(form.monitoring) } : {}),
      ...(form.medication ? { medications: list(form.medication) } : {}),
      ...(form.atcCode ? { atcCodes: list(form.atcCode) } : {}),
      ...(form.complication ? { complications: list(form.complication) } : {}),
      ...(form.disposition ? { dispositions: list(form.disposition) } : {}),
      ...(form.mappingStatus ? { mappingStatuses: list(form.mappingStatus) } : {}),
      ...(form.completeness ? { minimumCompleteness: number(form.completeness) } : {}),
    },
  }
}

export function CohortBuilder({
  metadata,
  editingCohort,
  onEditComplete,
  onCancelEdit,
}: {
  metadata: ResearchMetadata
  editingCohort: SavedResearchCohort | null
  onEditComplete: (cohort: SavedResearchCohort) => void
  onCancelEdit: () => void
}) {
  const { locale, message } = useLocale()
  const [form, setForm] = useState<FormState>(() => editingCohort
    ? formFromCohort(editingCohort.definition)
    : EMPTY)
  const [result, setResult] = useState<ResearchQueryResponse | null>(null)
  const [caseResult, setCaseResult] = useState<ResearchCaseQueryResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [saveOpen, setSaveOpen] = useState(false)
  const [saveName, setSaveName] = useState("")
  const [visibility, setVisibility] = useState<"PRIVATE" | "INSTITUTION">("PRIVATE")
  const [saved, setSaved] = useState<SavedResearchCohort | null>(null)
  const [preservedFilters, setPreservedFilters] = useState<ResearchCohortDefinition["filters"]>(() => editingCohort
    ? preservedCohortFilters(editingCohort.definition)
    : {})
  const cohort = useMemo(() => buildCohort(form, preservedFilters), [form, preservedFilters])
  const techniqueOptions = useMemo(() => optionChoices("TECHNIQUE", locale), [locale])
  const positionOptions = useMemo(() => optionChoices("POSITION", locale), [locale])
  const airwayOptions = useMemo(() => optionChoices("AIRWAY_MANAGEMENT", locale).filter(option => option.group === "Device"), [locale])
  const complicationOptions = useMemo(() => complicationChoices(locale), [locale])
  const dispositionOptions = useMemo(() => optionChoices("DISPOSITION", locale), [locale])
  const statusOptions = useMemo(() => RESEARCH_CASE_STATUSES.map(code => ({
    code,
    label: clinicalDisplayLabel("caseStatus", code, locale),
  })), [locale])
  const clinicalModeOptions = useMemo(() => (["ADULT", "PEDIATRIC"] as const).map(code => ({
    code,
    label: clinicalDisplayLabel("clinicalMode", code, locale),
  })), [locale])
  const sexOptions = useMemo(() => (["MALE", "FEMALE", "OTHER"] as const).map(code => ({
    code,
    label: clinicalDisplayLabel("option:SEX", code, locale),
  })), [locale])

  useEffect(() => {
    if (!editingCohort) return
    document.getElementById("cohort-builder-panel")?.scrollIntoView({ block: "start" })
  }, [editingCohort])

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm(current => ({ ...current, [key]: value }))
  }

  async function run(skip = 0) {
    setLoading(true)
    setError("")
    try {
      const request = {
        method: "POST",
        body: JSON.stringify({
          cohort,
          pagination: { skip, take: 25 },
          metrics: [
            "caseCount",
            "pediatricRate",
            "meanAgeYears",
            "meanAgeDays",
            "meanBmi",
            "meanDurationMinutes",
            "emergencyRate",
            "complicationRate",
            "ponvRate",
            "meanAldrete",
            "mappingCoverage",
            "fieldCompleteness",
          ],
          distributions: ["clinicalMode", "asa", "procedure", "diagnosis", "technique", "disposition"],
        }),
      }
      const [aggregate, inspected] = await Promise.all([
        apiJson<ResearchQueryResponse>("/research/query", request),
        metadata.permissions.inspectCases
          ? apiJson<ResearchCaseQueryResponse>("/research/cases/query", request)
          : Promise.resolve(null),
      ])
      setResult(aggregate)
      setCaseResult(inspected)
    } catch {
      setError(message("queryFailed"))
    } finally {
      setLoading(false)
    }
  }

  async function save() {
    if (!saveName.trim()) return
    setLoading(true)
    setError("")
    try {
      const record = await apiJson<SavedResearchCohort>("/research/cohorts", {
        method: "POST",
        body: JSON.stringify({
          name: saveName,
          visibility,
          definition: cohort,
        }),
      })
      setSaved(record)
      setSaveOpen(false)
      setSaveName("")
    } catch {
      setError(message("saveFailed"))
    } finally {
      setLoading(false)
    }
  }

  function cancelEdit() {
    setForm(EMPTY)
    setPreservedFilters({})
    setResult(null)
    setCaseResult(null)
    setSaved(null)
    setError("")
    onCancelEdit()
  }

  async function updateDefinition() {
    if (!editingCohort) return
    setLoading(true)
    setError("")
    try {
      const record = await apiJson<SavedResearchCohort>(`/research/cohorts/${editingCohort.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          definition: cohort,
          expectedUpdatedAt: editingCohort.updatedAt,
        }),
      })
      setSaved(record)
      setForm(EMPTY)
      setPreservedFilters({})
      onEditComplete(record)
    } catch (caught) {
      setError(caught instanceof ApiError && caught.status === 409
        ? message("cohortChangedConflict")
        : message("updateCohortFailed"))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="grid">
      <section className="panel" id="cohort-builder-panel">
        <div className="panel-header">
          <h3>{editingCohort
            ? `${message("editingCohortFilters")}: ${editingCohort.name}`
            : message("structuredFilters")}</h3>
          <div className="toolbar">
            <button
              className="button"
              type="button"
              onClick={() => {
                setForm(EMPTY)
                setPreservedFilters(editingCohort
                  ? preservedCohortFilters(editingCohort.definition)
                  : {})
                setResult(null)
                setCaseResult(null)
                setError("")
              }}
            >
              <RotateCcw size={15} /> {message("reset")}
            </button>
            {editingCohort ? (
              <>
                <button className="button" type="button" onClick={cancelEdit}>{message("cancel")}</button>
                <button className="button primary" type="button" onClick={updateDefinition} disabled={loading}>
                  <Save size={15} /> {message("saveChanges")}
                </button>
              </>
            ) : (
              <button className="button" type="button" onClick={() => setSaveOpen(value => !value)}>
                <BookmarkPlus size={15} /> {message("save")}
              </button>
            )}
            <button className="button primary" type="button" onClick={() => run()} disabled={loading}>
              <Play size={15} /> {loading ? message("running") : message("runQuery")}
            </button>
          </div>
        </div>
        <div className="panel-body">
          <div className="filter-grid">
            <Field label={message("caseStatuses")}>
              <ClinicalMultiSelect
                value={form.status}
                options={statusOptions}
                onChange={value => set("status", value)}
                emptyLabel={message("any")}
                searchLabel={message("searchOptions")}
              />
            </Field>
            <Field label={message("finalizedFrom")}><input className="input" type="date" value={form.from} onChange={e => set("from", e.target.value)} /></Field>
            <Field label={message("finalizedTo")}><input className="input" type="date" value={form.to} onChange={e => set("to", e.target.value)} /></Field>
            <Field label={clinicalDisplayLabel("researchField", "clinicalMode", locale)}>
              <ClinicalMultiSelect
                value={form.clinicalMode}
                options={clinicalModeOptions}
                onChange={value => set("clinicalMode", value)}
                emptyLabel={message("any")}
                searchLabel={message("searchOptions")}
              />
            </Field>
            <Field label={clinicalDisplayLabel("researchField", "ageUnit", locale)}>
              <select className="select" value={form.ageUnit} onChange={e => set("ageUnit", e.target.value as PediatricAgeUnit)}>
                <option value="YEARS">{clinicalDisplayLabel("ageUnit", "YEARS", locale)}</option>
                <option value="MONTHS">{clinicalDisplayLabel("ageUnit", "MONTHS", locale)}</option>
                <option value="DAYS">{clinicalDisplayLabel("ageUnit", "DAYS", locale)}</option>
              </select>
            </Field>
            <Field label={message("ageFrom")}> <input className="input" inputMode="numeric" value={form.ageMin} onChange={e => set("ageMin", e.target.value)} /></Field>
            <Field label={message("ageTo")}> <input className="input" inputMode="numeric" value={form.ageMax} onChange={e => set("ageMax", e.target.value)} /></Field>
            <Field label={message("bmiFrom")}> <input className="input" inputMode="decimal" value={form.bmiMin} onChange={e => set("bmiMin", e.target.value)} /></Field>
            <Field label={message("bmiTo")}> <input className="input" inputMode="decimal" value={form.bmiMax} onChange={e => set("bmiMax", e.target.value)} /></Field>
            <Field label={message("durationFrom")}> <input className="input" inputMode="decimal" value={form.durationMin} onChange={e => set("durationMin", e.target.value)} /></Field>
            <Field label={message("durationTo")}> <input className="input" inputMode="decimal" value={form.durationMax} onChange={e => set("durationMax", e.target.value)} /></Field>
            <Field label={message("aldreteFrom")}> <input className="input" inputMode="decimal" value={form.aldreteMin} onChange={e => set("aldreteMin", e.target.value)} /></Field>
            <Field label={message("aldreteTo")}> <input className="input" inputMode="decimal" value={form.aldreteMax} onChange={e => set("aldreteMax", e.target.value)} /></Field>
            <Field label={message("painScoreFrom")}> <input className="input" inputMode="decimal" value={form.painMin} onChange={e => set("painMin", e.target.value)} /></Field>
            <Field label={message("painScoreTo")}> <input className="input" inputMode="decimal" value={form.painMax} onChange={e => set("painMax", e.target.value)} /></Field>
            <Field label={message("sex")}> 
              <ClinicalMultiSelect
                value={form.sex}
                options={sexOptions}
                onChange={value => set("sex", value)}
                emptyLabel={message("any")}
                searchLabel={message("searchOptions")}
              />
            </Field>
            <Field label={message("asaComma")}> <input className="input" placeholder="II, III" value={form.asa} onChange={e => set("asa", e.target.value)} /></Field>
            <Field label={message("emergency")}> 
              <select className="select" value={form.emergency} onChange={e => set("emergency", e.target.value)}>
                <option value="">{message("any")}</option><option value="true">{message("emergency")}</option><option value="false">{message("elective")}</option>
              </select>
            </Field>
            <Field label={message("highRiskFilter")}>
              <select className="select" value={form.highRisk} onChange={e => set("highRisk", e.target.value)}>
                <option value="">{message("any")}</option><option value="true">{message("yes")}</option><option value="false">{message("no")}</option>
              </select>
            </Field>
            <Field label={message("ponv")}>
              <select className="select" value={form.ponv} onChange={e => set("ponv", e.target.value)}>
                <option value="">{message("any")}</option><option value="true">{message("yes")}</option><option value="false">{message("no")}</option>
              </select>
            </Field>
            <Field label={message("diagnosisIcd")}>
              <ClinicalSearchSelect
                kind="icd10"
                endpoint="/search/icd10"
                locale={locale}
                value={form.diagnosisCode}
                onChange={value => set("diagnosisCode", value)}
                searchLabel={message("searchOptions")}
                loadingLabel={message("loading")}
                noResultsLabel={message("searchNoResults")}
                minimumLabel={message("searchMinimum")}
              />
            </Field>
            <Field label={message("diagnosisContains")}> <input className="input" value={form.diagnosisText} onChange={e => set("diagnosisText", e.target.value)} /></Field>
            <Field label={message("comorbidityIcd")}>
              <ClinicalSearchSelect
                kind="icd10"
                endpoint="/search/icd10"
                locale={locale}
                value={form.comorbidityCode}
                onChange={value => set("comorbidityCode", value)}
                searchLabel={message("searchOptions")}
                loadingLabel={message("loading")}
                noResultsLabel={message("searchNoResults")}
                minimumLabel={message("searchMinimum")}
              />
            </Field>
            <Field label={message("comorbidityContains")}> <input className="input" value={form.comorbidityText} onChange={e => set("comorbidityText", e.target.value)} /></Field>
            <Field label={message("procedureCode")}>
              <ClinicalSearchSelect
                kind="procedure"
                endpoint="/search/procedures"
                locale={locale}
                value={form.procedureCode}
                onChange={value => set("procedureCode", value)}
                searchLabel={message("searchOptions")}
                loadingLabel={message("loading")}
                noResultsLabel={message("searchNoResults")}
                minimumLabel={message("searchMinimum")}
              />
            </Field>
            <Field label={message("procedureContains")}> <input className="input" value={form.procedureText} onChange={e => set("procedureText", e.target.value)} /></Field>
            <Field label={message("procedureGroups")}> <input className="input" value={form.procedureGroup} onChange={e => set("procedureGroup", e.target.value)} /></Field>
            <Field label={message("techniqueIds")}>
              <ClinicalMultiSelect
                value={form.technique}
                options={techniqueOptions}
                onChange={value => set("technique", value)}
                emptyLabel={message("any")}
                searchLabel={message("searchOptions")}
              />
            </Field>
            <Field label={message("positionIds")}>
              <ClinicalMultiSelect
                value={form.position}
                options={positionOptions}
                onChange={value => set("position", value)}
                emptyLabel={message("any")}
                searchLabel={message("searchOptions")}
              />
            </Field>
            <Field label={message("airwayDevices")}>
              <ClinicalMultiSelect
                value={form.airway}
                options={airwayOptions}
                onChange={value => set("airway", value)}
                emptyLabel={message("any")}
                searchLabel={message("searchOptions")}
              />
            </Field>
            <Field label={message("monitoringIds")}> <input className="input" value={form.monitoring} onChange={e => set("monitoring", e.target.value)} /></Field>
            <Field label={message("medicationInn")}>
              <ClinicalSearchSelect
                kind="medication"
                endpoint="/search/drugs"
                locale={locale}
                value={form.medication}
                onChange={value => set("medication", value)}
                searchLabel={message("searchOptions")}
                loadingLabel={message("loading")}
                noResultsLabel={message("searchNoResults")}
                minimumLabel={message("searchMinimum")}
              />
            </Field>
            <Field label={message("atcCodes")}> <input className="input" value={form.atcCode} onChange={e => set("atcCode", e.target.value)} /></Field>
            <Field label={message("complicationContains")}>
              <ClinicalMultiSelect
                value={form.complication}
                options={complicationOptions}
                onChange={value => set("complication", value)}
                emptyLabel={message("any")}
                searchLabel={message("searchOptions")}
              />
            </Field>
            <Field label={message("disposition")}>
              <ClinicalMultiSelect
                value={form.disposition}
                options={dispositionOptions}
                onChange={value => set("disposition", value)}
                emptyLabel={message("any")}
                searchLabel={message("searchOptions")}
              />
            </Field>
            <Field label={message("mappingStatuses")}> <input className="input" value={form.mappingStatus} onChange={e => set("mappingStatus", e.target.value)} /></Field>
            <Field label={message("minimumCompleteness")}> <input className="input" type="number" min="0" max="100" value={form.completeness} onChange={e => set("completeness", e.target.value)} /></Field>
          </div>
          {saveOpen && !editingCohort && (
            <div className="toolbar" style={{ marginTop: 14 }}>
              <input className="input" style={{ maxWidth: 280 }} aria-label={message("cohortName")} placeholder={message("cohortName")} value={saveName} onChange={e => setSaveName(e.target.value)} />
              <select className="select" style={{ width: 160 }} value={visibility} onChange={e => setVisibility(e.target.value as typeof visibility)}>
                <option value="PRIVATE">{message("private")}</option>
                {metadata.permissions.shareInstitutionCohorts && <option value="INSTITUTION">{message("institution")}</option>}
              </select>
              <button className="button primary" type="button" onClick={save} disabled={loading || !saveName.trim()}>
                <Save size={15} /> {message("saveCohort")}
              </button>
            </div>
          )}
          {saved && <div className="notice" style={{ marginTop: 12 }}>{message("saved")}: “{saved.name}”.</div>}
          {error && <div className="notice error" style={{ marginTop: 12 }}>{error}</div>}
        </div>
        {loading && <div className="loading-line" />}
      </section>

      {result && (
        <>
          <section className="grid metrics-grid">
            {result.metrics.map(item => <MetricCard key={item.id} metric={item} />)}
          </section>
          <section className="grid equal-columns">
            {result.distributions.map(item => (
              <div className="panel" key={item.id}>
                <div className="panel-header"><h3>{clinicalDisplayLabel("researchDistribution", item.id, locale)}</h3></div>
                <div className="panel-body"><DistributionChart distribution={item} /></div>
              </div>
            ))}
          </section>
          <section className="panel">
            <div className="panel-header">
              <h3>{message("matchingCases")}</h3>
              <span className="pill info">{formatResearchCount(result.matchingCaseCount)} {message("casesLabel")}</span>
            </div>
            {!metadata.permissions.inspectCases && (
              <div className="notice">{message("aggregateOnly")}</div>
            )}
          </section>
          {caseResult && (
            <section className="panel">
              <div className="panel-header">
                <h3>{message("authorizedRecords")}</h3>
                <span className="pill info">{caseResult.matchingCases} {message("casesLabel")}</span>
              </div>
              <CasesTable cases={caseResult.cases} />
            <div className="toolbar end" style={{ padding: 12 }}>
              <button
                className="button"
                type="button"
                disabled={caseResult.pagination.skip === 0 || loading}
                onClick={() => run(Math.max(0, caseResult.pagination.skip - caseResult.pagination.take))}
              >
                {message("previous")}
              </button>
              <span className="scope-label">
                {caseResult.pagination.skip + 1}–{Math.min(caseResult.pagination.total, caseResult.pagination.skip + caseResult.pagination.take)} of {caseResult.pagination.total}
              </span>
              <button
                className="button"
                type="button"
                disabled={!caseResult.pagination.hasMore || loading}
                onClick={() => run(caseResult.pagination.skip + caseResult.pagination.take)}
              >
                {message("next")}
              </button>
            </div>
          </section>
          )}
        </>
      )}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  const labelId = useId()
  return <div className="field" role="group" aria-labelledby={labelId}><span className="field-label" id={labelId}>{label}</span>{children}</div>
}
