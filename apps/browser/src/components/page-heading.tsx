"use client"

import type { ReactNode } from "react"
import { useLocale } from "./locale-provider"

export function PageHeading({
  title,
  titleBg,
  description,
  descriptionBg,
  actions,
}: {
  title: string
  titleBg?: string
  description?: string
  descriptionBg?: string
  actions?: ReactNode
}) {
  const { locale } = useLocale()
  return (
    <div className="page-heading">
      <div>
        <h2>{locale === "bg" && titleBg ? titleBg : title}</h2>
        {description && <p>{locale === "bg" && descriptionBg ? descriptionBg : description}</p>}
      </div>
      {actions && <div className="toolbar">{actions}</div>}
    </div>
  )
}