import { apiServerFetch, getLiveSession } from "@/lib/live-session"
import { LiveCaseUpdater } from "@/components/LiveCaseUpdater"
import { notFound, redirect } from "next/navigation"
import { CaseSummary } from "@/components/CaseSummary"
import { CaseMeta } from "@/components/CaseMeta"
import { HandoverHistory } from "@/components/HandoverHistory"
import { getLocale, getTranslations } from "next-intl/server"
import { ArrowLeft } from "lucide-react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { loginUrlForCallback } from "@/lib/safe-navigation"
import { readHospitalPatientReference } from "@/lib/hospital-patient-reference"
import { CentralCaseExportControl } from "@/components/CentralCaseExportControl"
import { parseCentralCaseExportControl } from "@/lib/central-case-export-control"

/**
 * The bounded Central delivery state, when this session may govern it.
 *
 * The API is asked rather than answered here. Delivery authority belongs to the
 * clinician who finalized the case, and to the HOD and Admin above them; the
 * case record does not say who finalized it, and a second copy of the rule in
 * the page would only be a second thing to get wrong. A refusal is not an
 * error -- most readers of a case hold no delivery authority over it -- so it
 * returns null and the panel is simply not rendered.
 */
async function readCentralDeliveryControl(id: string) {
  const response = await apiServerFetch(
    `/v1/hospital/cases/${encodeURIComponent(id)}/export-control`,
  ).catch(() => null)
  if (!response?.ok) return null
  return parseCentralCaseExportControl(await response.json().catch(() => null))
}

export default async function CasePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const [locale, t] = await Promise.all([getLocale(), getTranslations()])

  // Handle legacy browser URLs where the new-case page used path-encoded IDs
  // instead of query params. Redirect to the actual case summary.
  if (id.startsWith("new-continue=")) {
    const realId = id.slice("new-continue=".length).split("&")[0]
    redirect(`/cases/${realId}`)
  }

  // Printing moved to /cases/[id]/print (which also handles the mobile
  // print-token flow) — this page is the live summary and needs a session.
  const session = await getLiveSession()
  if (!session?.user?.id) redirect(loginUrlForCallback(`/cases/${encodeURIComponent(id)}`))
  const [response, centralControl] = await Promise.all([
    apiServerFetch(`/v1/cases/${encodeURIComponent(id)}`),
    readCentralDeliveryControl(id),
  ])
  if (response.status === 404 || response.status === 403) notFound()
  if (!response.ok) throw new Error(`Unable to load case (${response.status})`)
  const record = await response.json() as {
    createdAt: string
    caseCode: string | null
    notes: string | null
    preop: {
      plannedProcedure: string | null
      diagnosis: string | null
      ageYears: number | null
      sex: string | null
    } | null
    intraop: { monthYear: string | null } | null
    user: { institution: { name: string } | null }
    capabilities?: { canWrite?: boolean } | null
    patientReference?: unknown
  }

  const p = record.preop
  const i = record.intraop
  // The creator of a handed-on case still reads this page and still prints
  // from it; what they no longer have is write. Anything short of an explicit
  // `canWrite: true` is read-only, so an API that stops sending the object
  // cannot quietly hand the notes editor back.
  const canWrite = record.capabilities?.canWrite === true
  const patientReference = readHospitalPatientReference(record)

  return (
    <>
      {/* Header — constrained width */}
      <div className="max-w-4xl mx-auto mb-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <Link href="/dashboard">
              <Button variant="ghost" size="sm" className="gap-1 mb-2 -ml-2 text-slate-500">
                <ArrowLeft className="h-4 w-4" /> {t("nav.dashboard")}
              </Button>
            </Link>
            <h1 className="text-xl font-bold text-slate-800">{p?.plannedProcedure ?? t("case.anaesthesiaCase")}</h1>
            <p className="text-slate-500 text-sm mt-1">
              {p?.diagnosis} · {p?.ageYears}{locale === "bg" ? " г." : "y"} {p?.sex === "MALE" ? (locale === "bg" ? "М" : "M") : p?.sex === "FEMALE" ? (locale === "bg" ? "Ж" : "F") : ""} ·{" "}
              {i?.monthYear
                ? (() => { const [y, m] = i.monthYear!.split("-"); return new Intl.DateTimeFormat(locale, { month: "short", year: "numeric" }).format(new Date(Number(y), Number(m) - 1, 1)) })()
                : new Intl.DateTimeFormat(locale, { day: "2-digit", month: "short", year: "numeric" }).format(new Date(record.createdAt))}{" "}
              {record.user.institution ? `· ${record.user.institution.name}` : ""}
            </p>
            {patientReference ? (
              <p className="mt-2 text-xs font-medium text-slate-500">
                {t("case.hospitalPatientNumber")} <code data-testid="masked-patient-identifier" className="text-slate-700">{patientReference.maskedIdentifier}</code>
              </p>
            ) : null}
          </div>
          <div className="flex flex-col items-end gap-2">
            {record.caseCode && (
              <CaseMeta caseId={id} caseCode={record.caseCode} initialNotes={record.notes} canWrite={canWrite} />
            )}
          </div>
        </div>
      </div>

      {/* Live sync polls the lightweight version endpoint and refreshes on change */}
      <LiveCaseUpdater caseId={id} />

      {/* Live case summary (printing lives on /cases/[id]/print) */}
      <CaseSummary caseId={id} mode="summary" />

      {/* Only rendered when the case has actually changed hands. */}
      <HandoverHistory caseId={id} />

      {/* The clinician who finalized the case keeps this one narrow delivery
          control over it, as do the HOD and Admin above them. The API decides
          who that is; nothing here widens it. */}
      {centralControl
        ? <CentralCaseExportControl caseId={id} initialControl={centralControl} />
        : null}
    </>
  )
}
