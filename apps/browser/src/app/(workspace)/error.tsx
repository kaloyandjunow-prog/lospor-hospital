"use client"

export default function WorkspaceError({
  error,
  reset,
}: {
  error: Error
  reset: () => void
}) {
  return (
    <div className="notice error">
      <strong>Unable to load research data.</strong>
      <p>{error.message}</p>
      <button type="button" className="button" onClick={reset}>Retry</button>
    </div>
  )
}
