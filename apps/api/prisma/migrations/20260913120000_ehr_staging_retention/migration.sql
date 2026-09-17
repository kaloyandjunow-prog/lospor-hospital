-- How long staged EHR data is kept before it is actually deleted.
--
-- Imports always carried a 14-day expiry, but it only hid them from reads:
-- nothing deleted an expired import or its fields. The retention job now does,
-- and a site may shorten the window. The CHECK keeps the stored value inside
-- what the code accepts, whatever writes it.
ALTER TABLE "HospitalEhrTransportPolicy"
  ADD COLUMN "stagingRetentionDays" INTEGER NOT NULL DEFAULT 14,
  ADD COLUMN "stagingRetentionChangedAt" TIMESTAMP(3),
  ADD CONSTRAINT "HospitalEhrTransportPolicy_stagingRetentionDays_range"
    CHECK ("stagingRetentionDays" BETWEEN 1 AND 14);
