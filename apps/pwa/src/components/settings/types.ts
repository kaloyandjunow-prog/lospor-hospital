import type { Institution } from "@/components/SettingsPickers"

export type ProfileData = {
  firstName?: string | null
  lastName?: string | null
  title?: string | null
  role?: string | null
  institution?: Institution | null
}
