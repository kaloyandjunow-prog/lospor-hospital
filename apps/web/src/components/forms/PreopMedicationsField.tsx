"use client"

import { useTranslations } from "next-intl"
import { isTypedMedication } from "@lospor/core/preop-orders"
import { TagInput, type Tag } from "@/components/TagInput"

type DrugSearchItem = { name: string; inn?: string; strength?: string; atcCode?: string }

/**
 * The current medications, picked from the drug list. A medication that is
 * not in the list can be typed as written only where the hospital turned it on
 * in Status (10.6.0); otherwise the list only.
 */
export function PreopMedicationsField({ value, onChange, allowTyped }: {
  value: Tag[]
  onChange: (tags: Tag[]) => void
  allowTyped: boolean
}) {
  const t = useTranslations()
  return (
    <TagInput
      value={value}
      onChange={onChange}
      searchUrl="/api/search/drugs"
      renderSuggestion={(item: DrugSearchItem) => ({
        label: item.inn ? `${item.inn}${item.strength ? ` ${item.strength}` : ""}` : item.name,
        sub: item.name !== item.inn ? item.name : undefined,
        inn: item.inn ?? undefined,
        atcCode: item.atcCode ?? undefined,
      })}
      placeholder={t("preop.medicationsPlaceholder")}
      allowFreeText={false}
      freeTextRow={allowTyped ? {
        label: typed => t("preop.medicationAddTyped", { typed }),
        typedMark: t("preop.medicationTypedMark"),
        isTyped: isTypedMedication,
      } : undefined}
    />
  )
}
