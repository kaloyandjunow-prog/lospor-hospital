import { apiJson } from "./api"

export type AccountProfile = {
  id: string
  email: string
  name: string
  firstName: string
  lastName: string
  title: string
  institution?: { id: string; name: string; city: string } | null
}

export type ProfileCorrection = Pick<AccountProfile, "firstName" | "lastName" | "title">

export type ProfileCorrectionResult = ProfileCorrection & {
  name: string
  institution?: AccountProfile["institution"]
}

export type ProfileCorrectionValidation =
  | { ok: true; value: ProfileCorrection }
  | { ok: false; reason: "NAME_REQUIRED" | "TOO_LONG" }

function normalizePart(value: string): string {
  return value.replace(/\s+/g, " ").trim()
}

export function validateProfileCorrection(input: ProfileCorrection): ProfileCorrectionValidation {
  const value = {
    firstName: normalizePart(input.firstName),
    lastName: normalizePart(input.lastName),
    title: normalizePart(input.title),
  }
  if (!value.firstName || !value.lastName) return { ok: false, reason: "NAME_REQUIRED" }
  if (Object.values(value).some(part => part.length > 100)) {
    return { ok: false, reason: "TOO_LONG" }
  }
  return { ok: true, value }
}

export async function loadAccountProfile(): Promise<AccountProfile> {
  return apiJson<AccountProfile>("/api/user")
}

export async function saveProfileCorrection(input: ProfileCorrection): Promise<ProfileCorrectionResult> {
  const validated = validateProfileCorrection(input)
  if (!validated.ok) throw new Error(validated.reason)
  const response = await apiJson<Partial<AccountProfile>>("/api/user", {
    method: "PATCH",
    body: JSON.stringify(validated.value),
  })
  return {
    name: response.name ?? [response.title, response.firstName, response.lastName].filter(Boolean).join(" "),
    firstName: response.firstName ?? validated.value.firstName,
    lastName: response.lastName ?? validated.value.lastName,
    title: response.title ?? validated.value.title,
    institution: response.institution,
  }
}
