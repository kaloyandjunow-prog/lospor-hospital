import type { AccountKind, PreferredLocale } from "./account"
import type {
  LegalAcceptanceRecordDto,
  LegalAcceptanceReference,
  LegalDocumentDescriptor,
} from "./legal"

export const LOSPOR_API_VERSION = "v1" as const
export const LOSPOR_API_PREFIX = `/${LOSPOR_API_VERSION}` as const

export type LosporApiClient = "web" | "mobile" | "pwa" | "integration"

export type ApiErrorBody = {
  error: string
  code?: string
  requestId?: string
  details?: unknown
}

export type ApiHealth = {
  status: "ok" | "degraded"
  service: "lospor-api"
  version: string
}

export type ApiCapabilities = {
  apiVersion: "1"
  serviceVersion: string
  catalogVersion: string
  minimumSupportedClients: Readonly<Record<"web" | "mobile" | "pwa", string>>
  compatibilityPaths: {
    canonical: typeof LOSPOR_API_PREFIX
    legacyWebProxy: "/api"
  }
  features: Readonly<Record<string, boolean>>
}

export type ApiSessionUser = {
  id: string
  email: string
  name: string
  role: string
  accountKind: AccountKind
  preferredLocale: PreferredLocale
  institutionId: string | null
  institutionName: string | null
  firstName: string | null
  lastName: string | null
  title: string | null
  jti: string | null
  acceptedTermsAt: string | null
  legalAcceptances: LegalAcceptanceRecordDto[]
  lastLoginAt: string | null
}

export type ApiSession = {
  user: ApiSessionUser
}

export type ApiLocaleResponse = {
  locale: PreferredLocale
}

export type ApiLegalDocumentsResponse = {
  locale: PreferredLocale
  documents: LegalDocumentDescriptor[]
}

export type ApiLegalAcceptancesRequest = {
  acceptances: LegalAcceptanceReference[]
}

export type ApiLegalAcceptancesResponse = {
  acceptances: LegalAcceptanceRecordDto[]
}

export type ApiLegalAcceptancesMutationResponse = {
  ok: true
  acceptances: LegalAcceptanceReference[]
}
