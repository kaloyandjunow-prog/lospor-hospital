"use client"

import type { ReactNode } from "react"
import type { TranslationKey } from "@/lib/i18n"
import { useLocale } from "./locale-provider"

export function PageHeading({
  title,
  titleKey,
  description,
  descriptionKey,
  actions,
}: {
  title?: string
  titleKey?: TranslationKey
  description?: string
  descriptionKey?: TranslationKey
  actions?: ReactNode
}) {
  const { message } = useLocale()
  const resolvedTitle = titleKey ? message(titleKey) : title
  const resolvedDescription = descriptionKey ? message(descriptionKey) : description
  return (
    <div className="page-heading">
      <div>
        <h2>{resolvedTitle}</h2>
        {resolvedDescription ? <p>{resolvedDescription}</p> : null}
      </div>
      {actions ? <div className="toolbar">{actions}</div> : null}
    </div>
  )
}
