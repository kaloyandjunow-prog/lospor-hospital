-- LOSPOR Hospital 1.2.0: deployment-owned external AI policy and a sealed
-- Mistral credential. The key which seals these columns is API-only and never
-- enters PostgreSQL; all consumer code must authenticate the complete tuple.

CREATE TYPE "ExternalAiProvider" AS ENUM ('MISTRAL');

CREATE TABLE "HospitalExternalAiPolicy" (
    "id" TEXT NOT NULL DEFAULT 'local',
    "externalAiEnabled" BOOLEAN NOT NULL DEFAULT true,
    "provider" "ExternalAiProvider" NOT NULL DEFAULT 'MISTRAL',
    "credentialCiphertext" TEXT,
    "credentialNonce" TEXT,
    "credentialAuthTag" TEXT,
    "credentialKeyVersion" INTEGER,
    "credentialSealKeyFingerprint" TEXT,
    "credentialConfiguredAt" TIMESTAMP(3),
    "credentialChangedAt" TIMESTAMP(3),
    "credentialChangedById" TEXT,
    "policyChangedAt" TIMESTAMP(3),
    "policyChangedById" TEXT,
    "policyChangeReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HospitalExternalAiPolicy_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "HospitalExternalAiPolicy_singleton_check" CHECK ("id" = 'local'),
    CONSTRAINT "HospitalExternalAiPolicy_sealed_tuple_check" CHECK (
      (
        num_nonnulls(
          "credentialCiphertext",
          "credentialNonce",
          "credentialAuthTag",
          "credentialKeyVersion",
          "credentialSealKeyFingerprint",
          "credentialConfiguredAt"
        ) = 0
      ) OR (
        num_nonnulls(
          "credentialCiphertext",
          "credentialNonce",
          "credentialAuthTag",
          "credentialKeyVersion",
          "credentialSealKeyFingerprint",
          "credentialConfiguredAt"
        ) = 6
        AND "credentialKeyVersion" = 1
        AND "credentialSealKeyFingerprint" ~ '^sha256:[a-f0-9]{64}$'
        AND "credentialChangedAt" IS NOT NULL
        AND "credentialChangedById" IS NOT NULL
      )
    ),
    CONSTRAINT "HospitalExternalAiPolicy_reason_check" CHECK (
      "policyChangeReason" IS NULL
      OR char_length(btrim("policyChangeReason")) BETWEEN 10 AND 1000
    )
);

ALTER TABLE "HospitalExternalAiPolicy"
  ADD CONSTRAINT "HospitalExternalAiPolicy_credentialChangedById_fkey"
  FOREIGN KEY ("credentialChangedById") REFERENCES "User"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "HospitalExternalAiPolicy"
  ADD CONSTRAINT "HospitalExternalAiPolicy_policyChangedById_fkey"
  FOREIGN KEY ("policyChangedById") REFERENCES "User"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
