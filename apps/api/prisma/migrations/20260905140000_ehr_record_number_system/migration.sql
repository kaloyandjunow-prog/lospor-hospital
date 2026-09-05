-- Which of the hospital's identifier systems the record number lives in.
--
-- A hospital numbers the same person several ways: an admission number, a
-- permanent record number, a ward number, a visit number. They are separate
-- namespaces holding numbers of the same shape and magnitude, and two
-- sequential counters reaching the same value is not exotic -- over a year of
-- admissions it is close to certain.
--
-- The patient search asks "who has identifier 12345?" without saying which kind
-- of 12345. Several matches are already refused as ambiguous. A single match
-- was accepted, even when it belonged to a different numbering -- and then a
-- stranger's diagnoses, allergies and medications are proposed onto this
-- patient's case, with nothing on the review screen to suggest anything went
-- wrong. An allergy list belonging to somebody else is the worst outcome
-- available here.
--
-- Nullable on purpose. A site has to be able to start before it has answered
-- this, so an unverifiable match is warned about rather than refused until the
-- system is set; once set, a mismatch is refused the way an ambiguous match is.
ALTER TABLE "HospitalEhrTransportPolicy"
  ADD COLUMN "recordNumberSystem"            TEXT,
  ADD COLUMN "recordNumberSystemChangedAt"   TIMESTAMP(3),
  ADD COLUMN "recordNumberSystemChangedById" TEXT;
