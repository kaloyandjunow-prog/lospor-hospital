import { ACCOUNT_COUNTRIES, PROFESSIONAL_TITLES } from "@lospor/core/account"
import type { AppLanguage } from "./locale"

type Country = (typeof ACCOUNT_COUNTRIES)[number]
type ProfessionalTitle = (typeof PROFESSIONAL_TITLES)[number]["value"]

export const ACCOUNT_COUNTRY_LABELS = {
  en: Object.fromEntries(ACCOUNT_COUNTRIES.map(country => [country, country])) as Record<Country, string>,
  bg: {
    Bulgaria: "България",
    Romania: "Румъния",
    Greece: "Гърция",
    Turkey: "Турция",
    Serbia: "Сърбия",
    "North Macedonia": "Северна Македония",
    Germany: "Германия",
    "United Kingdom": "Обединено кралство",
    France: "Франция",
    Italy: "Италия",
    Spain: "Испания",
    Portugal: "Португалия",
    Netherlands: "Нидерландия",
    Belgium: "Белгия",
    Austria: "Австрия",
    Switzerland: "Швейцария",
    Poland: "Полша",
    "Czech Republic": "Чехия",
    Hungary: "Унгария",
    Croatia: "Хърватия",
    Slovenia: "Словения",
    Slovakia: "Словакия",
    Other: "Друга",
  },
} satisfies Record<AppLanguage, Record<Country, string>>

export const PROFESSIONAL_TITLE_LABELS = {
  en: {
    "Dr.": "Dr.",
    "Assoc. Prof.": "Assoc. Prof.",
    "Prof.": "Prof.",
    Nurse: "Nurse",
    Other: "Other",
  },
  bg: {
    "Dr.": "д-р",
    "Assoc. Prof.": "доц.",
    "Prof.": "проф.",
    Nurse: "Медицинска сестра",
    Other: "Друго",
  },
} satisfies Record<AppLanguage, Record<ProfessionalTitle, string>>

