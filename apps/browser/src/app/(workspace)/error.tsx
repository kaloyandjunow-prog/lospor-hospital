"use client"

import { useLocale } from "@/components/locale-provider"

export default function WorkspaceError({
  error,
  reset,
}: {
  error: Error
  reset: () => void
}) {
  const { message } = useLocale()
  return (
    <div className="notice error">
      <strong>{message("unableLoadResearchData")}</strong>
      <p>{error.message}</p>
      <button type="button" className="button" onClick={reset}>{message("retry")}</button>
    </div>
  )
}
