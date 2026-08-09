import { clearClinicalRulesCache, useClinicalRules } from "@/hooks/useClinicalRules"

export function clearPediatricClinicalRulesCache() {
  return clearClinicalRulesCache()
}

export function usePediatricClinicalRules(enabled: boolean) {
  return useClinicalRules("PEDIATRIC", enabled)
}
