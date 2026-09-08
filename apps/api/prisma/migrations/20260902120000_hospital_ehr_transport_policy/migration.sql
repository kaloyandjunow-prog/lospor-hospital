-- LOSPOR Hospital 1.2.4: per-site EHR import transport policy, plus a sealed
-- credential for the two transports that need one. FOLDER is a watched
-- filesystem path the hospital's own system writes into, read by a process
-- already trusted with the database -- it carries no secret. FHIR and HL7v2
-- reach outside that boundary, so those two carry the same sealed
-- AES-256-GCM tuple shape as HospitalExternalAiPolicy's Mistral credential;
-- the key that seals them is API-only and never enters PostgreSQL.

CREATE TABLE "HospitalEhrTransportPolicy" (
    "id" TEXT NOT NULL DEFAULT 'local',
    "transport" "EhrImportTransport",
    "credentialCiphertext" TEXT,
    "credentialNonce" TEXT,
    "credentialAuthTag" TEXT,
    "credentialKeyVersion" INTEGER,
    "credentialSealKeyFingerprint" TEXT,
    "credentialConfiguredAt" TIMESTAMP(3),
    "credentialChangedAt" TIMESTAMP(3),
    "credentialChangedById" TEXT,
    "transportChangedAt" TIMESTAMP(3),
    "transportChangedById" TEXT,
    "transportChangeReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HospitalEhrTransportPolicy_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "HospitalEhrTransportPolicy_singleton_check" CHECK ("id" = 'local'),
    -- Mirrors HospitalExternalAiPolicy's sealed-tuple check: every column the
    -- seal produced is present together, or none of them are. A credential is
    -- never valid to read half-written.
    CONSTRAINT "HospitalEhrTransportPolicy_sealed_tuple_check" CHECK (
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
    -- A credential only ever makes sense for the two transports that reach
    -- outside the appliance. FOLDER needs none, and neither does an unset
    -- transport; storing one for either would be dead ciphertext nothing
    -- ever re-checks against a live policy.
    CONSTRAINT "HospitalEhrTransportPolicy_credential_transport_check" CHECK (
      "transport" IN ('FHIR', 'HL7V2')
      OR num_nonnulls(
        "credentialCiphertext",
        "credentialNonce",
        "credentialAuthTag",
        "credentialKeyVersion",
        "credentialSealKeyFingerprint",
        "credentialConfiguredAt"
      ) = 0
    ),
    -- Mirrors HospitalPatientIdentifierPolicy's change-evidence check: a
    -- transport change is evidence of a deliberate act, not just a new
    -- value, so the actor and reason are recorded together with the
    -- timestamp, or none of the three are present at all.
    CONSTRAINT "HospitalEhrTransportPolicy_change_evidence_check" CHECK (
      (
        "transportChangedAt" IS NULL AND "transportChangedById" IS NULL
        AND "transportChangeReason" IS NULL
      )
      OR (
        "transportChangedAt" IS NOT NULL AND "transportChangedById" IS NOT NULL
        AND char_length(btrim("transportChangeReason")) BETWEEN 10 AND 1000
      )
    )
);

ALTER TABLE "HospitalEhrTransportPolicy"
  ADD CONSTRAINT "HospitalEhrTransportPolicy_credentialChangedById_fkey"
  FOREIGN KEY ("credentialChangedById") REFERENCES "User"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "HospitalEhrTransportPolicy"
  ADD CONSTRAINT "HospitalEhrTransportPolicy_transportChangedById_fkey"
  FOREIGN KEY ("transportChangedById") REFERENCES "User"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
