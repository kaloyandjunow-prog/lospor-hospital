"use client"

import { useLocale } from "@/components/locale-provider"

export default function WorkspaceLoading() {
  const { message } = useLocale()
  return <div className="loading-line" aria-label={message("loadingLabel")} />
}
