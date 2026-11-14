-- The lab scan's local settings (Hospital 1.9.1), set in Status.
--
-- The names this hospital's laboratory prints, each tied to a lab library
-- entry ([{ "printed": ..., "test": ... }]), and a short note. Both are added
-- after the released prompt; neither replaces it. Null is "nothing set": the
-- scan runs exactly as released.
ALTER TABLE "HospitalExternalAiPolicy"
  ADD COLUMN "labScanAliases" JSONB,
  ADD COLUMN "labScanInstructions" TEXT,
  ADD COLUMN "labScanChangedAt" TIMESTAMP(3);
