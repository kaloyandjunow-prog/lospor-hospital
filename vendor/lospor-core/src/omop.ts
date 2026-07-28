export type ConceptMappingStatus = "MAPPED" | "UNMAPPED" | "LOCAL_ONLY"

export type ExportQualityWarning = {
  code: string
  message: string
  severity: "info" | "warning" | "error"
  row?: string
  count?: number
}

export function deriveQualityStatus(
  warnings: readonly Pick<ExportQualityWarning, "severity">[],
): "PASS" | "WARNING" | "FAIL" {
  if (warnings.some(warning => warning.severity === "error")) return "FAIL"
  if (warnings.some(warning => warning.severity === "warning")) return "WARNING"
  return "PASS"
}

export function sourceValue(
  prefix: string,
  sourceVocabulary?: string | null,
  sourceCode?: string | null,
  label?: string | null,
): string {
  const code = [sourceVocabulary, sourceCode].filter(Boolean).join(":")
  if (code) return `${prefix}:${code}`
  return label ? `${prefix}:${label}` : prefix
}

export function trackConceptMapping(
  warnings: ExportQualityWarning[],
  status: ConceptMappingStatus,
  code: string,
  message: string,
  row?: string,
): void {
  if (status === "MAPPED") return
  warnings.push({ code, message, severity: status === "UNMAPPED" ? "warning" : "error", row })
}
