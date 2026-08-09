import { X509Certificate } from "node:crypto"
import { readFileSync } from "node:fs"
import { MANIFEST_VERSION } from "@lospor/exchange-contract"
import { prisma } from "@/lib/prisma"
import { centralDeliveryConfig } from "./config"
import {
  enrollCentralSite,
  fetchCentralCapabilities,
} from "./central-client"

export type HospitalEnrollmentInput = {
  token: string
  centralBaseUrl: string
  siteCode: string
  siteName: string
  institutionId: string
}

function certificateFingerprint(path: string): string {
  return new X509Certificate(readFileSync(path))
    .fingerprint256.replaceAll(":", "").toLowerCase()
}

export async function enrollHospital(input: HospitalEnrollmentInput) {
  // Enrolment presents the client certificate Central's operator signed from the
  // CSR that generate-hospital-identity.mjs produced, so the credentials must
  // already be in place by this point.
  const config = centralDeliveryConfig()
  const institution = await prisma.institution.findUnique({
    where: { id: input.institutionId },
    select: { id: true },
  })
  if (!institution) throw new Error("Institution not found")

  const baseUrl = input.centralBaseUrl.replace(/\/+$/, "")
  const announced = await fetchCentralCapabilities(baseUrl)
  if (!announced.supportedManifestVersions.includes(MANIFEST_VERSION) ||
      !announced.acceptedOmopVersions.includes("5.4")) {
    throw new Error("Central does not support this Hospital exchange version")
  }

  const enrolled = await enrollCentralSite(baseUrl, {
    token: input.token,
    siteCode: input.siteCode.trim().toUpperCase(),
    siteName: input.siteName.trim(),
    institutionSourceId: input.institutionId,
    mtlsFingerprintSha256: certificateFingerprint(config.HOSPITAL_MTLS_CERT_FILE),
    signingKeyId: config.HOSPITAL_SITE_SIGNING_KEY_ID,
    signingPublicKeyPem: readFileSync(
      config.HOSPITAL_SITE_SIGNING_PUBLIC_KEY_FILE,
      "utf8",
    ),
  })
  const capabilities = enrolled.capabilities
  if (!capabilities.supportedManifestVersions.includes(MANIFEST_VERSION)) {
    throw new Error("Central enrollment returned incompatible capabilities")
  }

  return prisma.hospitalInstallation.upsert({
    where: { id: "local" },
    create: {
      id: "local",
      siteId: enrolled.site.id,
      siteCode: enrolled.site.code,
      institutionId: input.institutionId,
      centralBaseUrl: baseUrl,
      centralEnabled: true,
      signingKeyId: config.HOSPITAL_SITE_SIGNING_KEY_ID,
      centralEncryptionKeyId: capabilities.centralEncryptionKeyId,
      centralEncryptionPublicKeyPem: capabilities.centralEncryptionPublicKeyPem,
      receiptSigningKeyId: capabilities.receiptSigningKeyId,
      receiptSigningPublicKeyPem: capabilities.receiptSigningPublicKeyPem,
      supportedManifestVersions: capabilities.supportedManifestVersions,
      maximumUploadBytes: capabilities.maximumUploadBytes,
      multipartChunkBytes: capabilities.multipartChunkBytes,
      nextSequence: enrolled.site.nextExpectedSequence,
      enrolledAt: new Date(),
      lastCapabilitiesAt: new Date(),
    },
    update: {
      siteId: enrolled.site.id,
      siteCode: enrolled.site.code,
      institutionId: input.institutionId,
      centralBaseUrl: baseUrl,
      centralEnabled: true,
      signingKeyId: config.HOSPITAL_SITE_SIGNING_KEY_ID,
      centralEncryptionKeyId: capabilities.centralEncryptionKeyId,
      centralEncryptionPublicKeyPem: capabilities.centralEncryptionPublicKeyPem,
      receiptSigningKeyId: capabilities.receiptSigningKeyId,
      receiptSigningPublicKeyPem: capabilities.receiptSigningPublicKeyPem,
      supportedManifestVersions: capabilities.supportedManifestVersions,
      maximumUploadBytes: capabilities.maximumUploadBytes,
      multipartChunkBytes: capabilities.multipartChunkBytes,
      nextSequence: enrolled.site.nextExpectedSequence,
      enrolledAt: new Date(),
      lastCapabilitiesAt: new Date(),
    },
  })
}

