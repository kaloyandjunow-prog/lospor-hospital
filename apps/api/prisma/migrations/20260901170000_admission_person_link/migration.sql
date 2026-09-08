-- Join an admission to the person it belongs to.
--
-- ИЗ № identifies an admission, not a patient: it restarts every January and a
-- new one is issued each time someone is admitted. The same person returning
-- next year is therefore a different link, and until now the two admissions
-- were two unrelated people in every export -- no repeat surgery, no
-- readmission, no longitudinal outcome could be seen even inside one hospital.
--
-- ЕГН is issued once for life and is what joins them. Both are kept: the record
-- number because it is what a clinician types and what distinguishes one
-- admission from the next, the national identifier because it is what makes
-- them the same person.

ALTER TABLE "PatientLink" ADD COLUMN "personLinkId" TEXT;

CREATE INDEX "PatientLink_personLinkId_idx" ON "PatientLink" ("personLinkId");

-- Losing the person must not delete the admissions or their cases.
ALTER TABLE "PatientLink"
  ADD CONSTRAINT "PatientLink_personLinkId_fkey"
  FOREIGN KEY ("personLinkId") REFERENCES "PatientLink"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Only an admission has a person. A national identifier is the person, so
-- pointing one at another would be a cycle with no meaning, and pointing a link
-- at itself would make an admission its own patient.
ALTER TABLE "PatientLink"
  ADD CONSTRAINT "PatientLink_person_is_admission_only"
  CHECK ("personLinkId" IS NULL OR ("identifierType" = 'IZ' AND "personLinkId" <> "id"));
