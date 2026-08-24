import { z } from "zod"
import { NO_INSTITUTION_ID } from "@lospor/core/account"
import { passwordSchema } from "@/lib/password-policy"
import type { AppLocale } from "@/i18n/locales"
import type { LegalAcceptanceReference } from "@/lib/legal-documents"

export type PublicInstitution = { id: string; name: string; city: string }

export const publicRegistrationSchema = z.object({
  title: z.string().optional(),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.string().email(),
  password: passwordSchema,
  confirmPassword: z.string(),
  country: z.string().min(1),
  institutionId: z.string().min(1).refine(value => value !== NO_INSTITUTION_ID),
  acceptedTerms: z.boolean().refine(value => value === true),
}).refine(value => value.password === value.confirmPassword, {
  message: "mismatch",
  path: ["confirmPassword"],
})

export type PublicRegistrationForm = z.infer<typeof publicRegistrationSchema>

const GENERIC_INSTITUTION_NAMES = new Set([
  "Без институция",
  "No institution",
  "Друго",
  "Other / Private",
])

export function publicRegistrationInstitutions(
  institutions: PublicInstitution[],
): PublicInstitution[] {
  return institutions.filter(institution =>
    institution.id !== NO_INSTITUTION_ID
    && !GENERIC_INSTITUTION_NAMES.has(institution.name),
  )
}

export function publicRegistrationPayload(
  data: PublicRegistrationForm,
  locale: AppLocale,
  legalAcceptances: LegalAcceptanceReference[],
) {
  return {
    title: data.title,
    firstName: data.firstName,
    lastName: data.lastName,
    email: data.email,
    password: data.password,
    institutionId: data.institutionId,
    locale,
    legalAcceptances,
  }
}
