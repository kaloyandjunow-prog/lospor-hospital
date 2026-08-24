import { passwordPolicyIssues, type PasswordPolicyIssue } from "@lospor/core/account"
import { z } from "zod"
import type { TranslationKey } from "@/lib/preferences-context"

type Translate = (key: TranslationKey) => string

export function createRegistrationSchema(t: Translate) {
  const passwordMessages: Record<PasswordPolicyIssue, string> = {
    too_short: t("passwordTooShort"),
    missing_uppercase: t("passwordUppercase"),
    missing_number: t("passwordNumber"),
    missing_special: t("passwordSpecial"),
  }
  const passwordSchema = z.string().superRefine((password, context) => {
    for (const issue of passwordPolicyIssues(password)) {
      context.addIssue({ code: "custom", message: passwordMessages[issue] })
    }
  })

  return z.object({
    firstName: z.string().min(1, t("fieldRequired")),
    lastName: z.string().min(1, t("fieldRequired")),
    title: z.string().optional(),
    email: z.string().email(t("invalidEmail")),
    country: z.string().min(1, t("selectACountry")),
    institutionId: z.string().min(1, t("institutionRequired")),
    password: passwordSchema,
    confirmPassword: z.string().min(1, t("confirmYourPassword")),
    acceptedTerms: z.boolean().refine(value => value === true, t("acceptTermsRequired")),
  }).refine(data => data.password === data.confirmPassword, {
    message: t("passwordsDoNotMatch"),
    path: ["confirmPassword"],
  })
}

export type RegistrationFormValues = z.infer<ReturnType<typeof createRegistrationSchema>>

