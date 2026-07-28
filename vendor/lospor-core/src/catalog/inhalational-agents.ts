import type { DoseProfileInput } from "./dose-profile"

// INHALATIONAL_AGENT catalog — generated from scripts/_drug-library-answers.json
// via scripts/_generate_catalogs.ts.

export type AgentCatalogEntry = {
  value: string
  label: string
  bar: string
  text: string
  grip: string
  profile: DoseProfileInput
}

export const AGENT_CATALOG: AgentCatalogEntry[] = [
  {
    "value": "SEVOFLURANE",
    "label": "Sevoflurane",
    "bar": "bg-amber-500",
    "text": "text-amber-600 dark:text-amber-400",
    "grip": "bg-amber-300",
    "profile": {
      "min": 0,
      "max": 8,
      "step": 0.1,
      "quickValues": [
        1,
        2,
        2.5,
        3,
        8
      ],
      "unit": "%",
      "routes": []
    }
  },
  {
    "value": "DESFLURANE",
    "label": "Desflurane",
    "bar": "bg-sky-500",
    "text": "text-sky-600 dark:text-sky-400",
    "grip": "bg-sky-300",
    "profile": {
      "min": 0,
      "max": 18,
      "step": 0.1,
      "quickValues": [
        4,
        6,
        8,
        12,
        18
      ],
      "unit": "%",
      "routes": []
    }
  },
  {
    "value": "ISOFLURANE",
    "label": "Isoflurane",
    "bar": "bg-purple-500",
    "text": "text-purple-600 dark:text-purple-400",
    "grip": "bg-purple-300",
    "profile": {
      "min": 0,
      "max": 5,
      "step": 0.1,
      "quickValues": [
        0.5,
        1,
        1.5,
        3,
        5
      ],
      "unit": "%",
      "routes": []
    }
  }
]
