import { NextResponse } from "next/server"
import { CLINICAL_CATALOG_VERSION } from "@lospor/core/catalog"
import { API_RELEASE_VERSION } from "@/lib/api-version"
import { pediatricCapabilities } from "@/lib/pediatric-mode"
import {
  accountAdministrationCapability,
  authenticationCapabilities,
} from "@/lib/deployment-capabilities"
import { clinicalAiCapabilities } from "@/lib/hospital/ai-boundary"
import { hospitalSupportConfiguration } from "@/lib/hospital/support-config"
import { assessSelectedHospitalClinicalBaseline } from "@/lib/hospital/clinical-baseline-readiness"
import { isHospitalDeployment } from "@/lib/hospital/deployment"
import { ehrTransportCapabilityState } from "@/lib/hospital/ehr-transport-policy"
import { patientIdentifierCapabilityState } from "@/lib/hospital/patient-identifier-policy"

export async function GET() {
  const hospital = isHospitalDeployment()
  const [clinicalAi, pediatricBaseline, ehrTransport, patientIdentifier] = await Promise.all([
    clinicalAiCapabilities(),
    hospital
      ? assessSelectedHospitalClinicalBaseline("PEDIATRIC")
      : Promise.resolve(null),
    // Both read a table, and neither is worth failing this route over. Every
    // client polls capabilities on a timer, so a 500 here would take capability
    // discovery down across the appliance because one optional adapter setting
    // could not be read. Falling back to "off" is also the safe direction: it
    // hides an import control rather than offering one that cannot work.
    ehrTransportCapabilityState().catch(() => ({
      enabled: false as const,
      reason: "PROVIDER_NOT_CONFIGURED" as const,
      transport: null,
    })),
    hospital
      ? patientIdentifierCapabilityState().catch(() => ({ egnPermitted: false }))
      : Promise.resolve({ egnPermitted: false }),
  ])
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
    support: hospitalSupportConfiguration(),
    authentication: authenticationCapabilities(),
    features: {
      caseRevisions: true,
      idempotentEvents: true,
      offlineReplay: true,
      omopExport: true,
      externalClientCredentials: false,
      accountAdministration: accountAdministrationCapability(),
      clinicalAi,
      /**
       * Whether this deployment can ask a hospital system about a patient.
       *
       * The clients had no way to find this out, so the review screens were
       * built, tested and rendered by nothing: there was no answer to "should
       * this button exist here". Cloud reports it disabled by deployment, which
       * is true — there is no hospital system on the other side.
       *
       * `egnPermitted` travels with it because the two decide the same control
       * together: which identifier a clinician may look a patient up by. The
       * server enforces the policy regardless; this only stops the client
       * offering an option that would be refused.
       */
      ehrImport: {
        enabled: ehrTransport.enabled,
        reason: ehrTransport.enabled ? "ENABLED" : ehrTransport.reason ?? "PROVIDER_NOT_CONFIGURED",
        transport: ehrTransport.transport,
        egnPermitted: patientIdentifier.egnPermitted,
      },
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
