import Link from "next/link"

export default function CaseNotFound() {
  return (
    <div className="empty">
      <div>
        <h2>Research case not found</h2>
        <p>The case is outside your scope or no longer available.</p>
        <Link className="button" href="/cases">Return to cases</Link>
      </div>
    </div>
  )
}
