import {
  isGeneralAnesthesiaCase,
  isGeneralAnesthesiaTechnique,
  isNeuraxialTechnique,
  isTivaTechnique,
  requiredMonitoringFieldsForTechniques,
} from "@lospor/core/intraop"

export {
  isGeneralAnesthesiaCase,
  isGeneralAnesthesiaTechnique,
  isNeuraxialTechnique,
  isTivaTechnique,
  requiredMonitoringFieldsForTechniques,
}

type MonitoringOption = { label: string; field: string; section?: string }

export function activeTechniquesForCase(
  localTechniques: string[],
  caseTechniques?: string[],
): string[] {
  return localTechniques.length > 0 ? localTechniques : (caseTechniques ?? [])
}

export function monitoringDefaultFieldsForTechniques(techniques: string[]): string[] {
  return [...requiredMonitoringFieldsForTechniques(techniques)]
}

export function addMonitoringDefaultsForTechniques(
  techniques: string[],
  currentMonitoring: string[],
): string[] | null {
  const next = [...currentMonitoring]
  for (const field of monitoringDefaultFieldsForTechniques(techniques)) {
    if (!next.includes(field)) next.push(field)
  }
  return next.length > currentMonitoring.length ? next : null
}

export function buildMonitoringSelectionPatch(
  options: MonitoringOption[],
  selectedFields: string[],
): Record<string, boolean> {
  return Object.fromEntries(
    options.map(option => [option.field, selectedFields.includes(option.field)]),
  )
}

export function selectedMonitoringFieldsFromRecord(
  options: MonitoringOption[],
  record: Record<string, unknown> | null | undefined,
): string[] {
  if (!record) return []
  return options
    .filter(option => Boolean(record[option.field]))
    .map(option => option.field)
}

export function hasAdvancedMonitoringSelected(
  options: MonitoringOption[],
  record: Record<string, unknown> | null | undefined,
): boolean {
  if (!record) return false
  return options.some(option =>
    option.section !== "standard" && Boolean(record[option.field]),
  )
}

export function buildTechniqueMonitoringUpdate(
  options: MonitoringOption[],
  currentMonitoring: string[],
  nextTechniques: string[],
): { patch: Record<string, unknown>; monitoring: string[] | null } {
  const patch: Record<string, unknown> = { techniques: nextTechniques }
  const requiredFields = requiredMonitoringFieldsForTechniques(nextTechniques)
  if (!requiredFields.length) return { patch, monitoring: null }

  const monitoring = [...currentMonitoring]
  for (const field of requiredFields) {
    patch[field] = true
    if (!monitoring.includes(field)) monitoring.push(field)
  }
  return {
    patch,
    monitoring: monitoring.length > currentMonitoring.length ? monitoring : null,
  }
}
