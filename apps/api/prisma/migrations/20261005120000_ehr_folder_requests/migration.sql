-- Watched-folder sites can ask the hospital system for a patient (1.5.0).
-- Off by default: a request nobody answers only piles up in outbox/.
ALTER TABLE "HospitalEhrTransportPolicy"
  ADD COLUMN "folderRequestsEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "folderRequestsChangedAt" TIMESTAMP(3);
