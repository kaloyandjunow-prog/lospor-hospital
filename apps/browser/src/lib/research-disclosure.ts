import type { ResearchCountDisclosure } from "@lospor/core/research"

export function formatResearchCount(disclosure: ResearchCountDisclosure): string {
  if (disclosure.exact && disclosure.value !== null) return String(disclosure.value)
  if (disclosure.upperBound === null) return `${disclosure.lowerBound}+`
  return `${disclosure.lowerBound}-${disclosure.upperBound}`
}

export function formatOptionalResearchCount(
  value: number | null,
  disclosure: ResearchCountDisclosure,
): string {
  return value === null ? formatResearchCount(disclosure) : String(value)
}
