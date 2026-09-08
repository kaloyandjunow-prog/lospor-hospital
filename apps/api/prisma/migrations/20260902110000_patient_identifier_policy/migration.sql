-- LOSPOR Hospital 1.2.4: per-site policy for whether an ЕГН (national
-- identifier) link may be recorded. ЕГН is what joins a patient's separate
-- admissions into one person, since ИЗ № is issued per admission and restarts
-- every January -- but recording it is a heavier privacy commitment than a
-- record number, and the hospital, not this software's vendor, is the data
-- controller for it. Enabled by default; a site turns it off deliberately.

CREATE TABLE "HospitalPatientIdentifierPolicy" (
    "id" TEXT NOT NULL DEFAULT 'local',
    "egnPermitted" BOOLEAN NOT NULL DEFAULT true,
    "changedAt" TIMESTAMP(3),
    "changedById" TEXT,
    "changeReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HospitalPatientIdentifierPolicy_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "HospitalPatientIdentifierPolicy_singleton_check" CHECK ("id" = 'local'),
    -- A change is evidence of a deliberate act, not just a new value: the actor
    -- and the reason are recorded together with the timestamp, or none of the
    -- three are present at all (the row's initial, never-changed default).
    CONSTRAINT "HospitalPatientIdentifierPolicy_change_evidence_check" CHECK (
      ("changedAt" IS NULL AND "changedById" IS NULL AND "changeReason" IS NULL)
      OR (
        "changedAt" IS NOT NULL AND "changedById" IS NOT NULL
        AND char_length(btrim("changeReason")) BETWEEN 10 AND 1000
      )
    )
);

ALTER TABLE "HospitalPatientIdentifierPolicy"
  ADD CONSTRAINT "HospitalPatientIdentifierPolicy_changedById_fkey"
  FOREIGN KEY ("changedById") REFERENCES "User"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
