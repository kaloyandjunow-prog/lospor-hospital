import Link from "next/link"
import { messages } from "@/lib/i18n"
import { currentLocale } from "@/lib/server-locale"

export default async function CaseNotFound() {
  const locale = await currentLocale()
  const message = messages[locale]
  return (
    <div className="empty">
      <div>
        <h2>{message.researchCaseNotFound}</h2>
        <p>{message.researchCaseUnavailable}</p>
        <Link className="button" href="/cases">{message.returnToCases}</Link>
      </div>
    </div>
  )
}
