import { NextResponse } from "next/server"
import { CLINICAL_CATALOG_VERSION } from "@lospor/core/catalog"
import { API_RELEASE_VERSION } from "@/lib/api-version"
import { pediatricCapabilities } from "@/lib/pediatric-mode"
import {
  accountAdministrationCapability,
  authenticationCapabilities,
  clinicalAiCapabilities,
  deploymentSupport,
} from "@/lib/deployment-capabilities"
import { assessSelectedHospitalClinicalBaseline } from "@/lib/hospital/clinical-baseline-readiness"
import { isHospitalDeployment } from "@/lib/hospital/deployment"

export async function GET() {
  const hospital = isHospitalDeployment()
  const pediatricBaseline = hospital
    ? await assessSelectedHospitalClinicalBaseline("PEDIATRIC")
    : null
  const pediatricMode = pediatricCapabilities()
  return NextResponse.json({
    apiVersion: "1",
    serviceVersion: API_RELEASE_VERSION,
    catalogVersion: CLINICAL_CATALOG_VERSION,
    minimumSupportedClients: {
      web: "6.0.0",
      mobile: "6.0.0",
      pwa: "6.0.0",
    },
    compatibilityPaths: {
      canonical: "/v1",
      legacyWebProxy: "/api",
    },
    support: deploymentSupport(),
    authentication: authenticationCapabilities(),
    features: {
      caseRevisions: true,
      idempotentEvents: true,
      offlineReplay: true,
      omopExport: true,
      externalClientCredentials: false,
      accountAdministration: accountAdministrationCapability(),
      clinicalAi: clinicalAiCapabilities(),
      pediatricMode: {
        ...pediatricMode,
        productionReady: pediatricBaseline?.baselineReady ?? pediatricMode.productionReady,
        baselineReady: pediatricBaseline?.baselineReady ?? pediatricMode.productionReady,
        baseline: pediatricBaseline,
      },
    },
  }, {
    headers: { "Cache-Control": "no-store" },
  })
}

// Hospital policy and credential readiness change at runtime through Status.
// A build-time/static capability document would keep a stale answer until the
// next software update and could expose an input after IT disabled egress.
export const dynamic = "force-dynamic"
