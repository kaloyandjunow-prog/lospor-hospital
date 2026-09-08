-- What one of this hospital's laboratory codes means.
--
-- Which code a hospital sends for a given test is a property of their
-- laboratory system rather than of any specification, and a hospital with five
-- analysers can have five codes for haemoglobin. The site says once, here, and
-- every later result is placed automatically.
--
-- The unique key is theirs, not ours: several of their codes may point at one
-- of our tests, and the reverse must not be possible. A blood-gas haemoglobin
-- and a main-laboratory one are separate tests in our library and stay
-- separately mapped.

CREATE TABLE "HospitalEhrLabCodeMap" (
    "id" TEXT NOT NULL,
    "system" TEXT NOT NULL DEFAULT '',
    "code" TEXT NOT NULL,
    "reportedLabel" TEXT,
    "test" TEXT NOT NULL,
    "assumedUnit" TEXT,
    "mappedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "mappedById" TEXT,
    "seenCount" INTEGER NOT NULL DEFAULT 0,
    "lastSeenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HospitalEhrLabCodeMap_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "HospitalEhrLabCodeMap_system_code_key"
    ON "HospitalEhrLabCodeMap"("system", "code");

-- Ranking the screen by how often a code has arrived, and finding every code a
-- given test is reached by, are the two questions this table is asked.
CREATE INDEX "HospitalEhrLabCodeMap_test_idx" ON "HospitalEhrLabCodeMap"("test");
CREATE INDEX "HospitalEhrLabCodeMap_lastSeenAt_idx" ON "HospitalEhrLabCodeMap"("lastSeenAt");

-- Restrict rather than cascade: a mapping is site configuration and outlives
-- the operator who entered it. Deleting the person must not delete what the
-- hospital's laboratory codes mean.
ALTER TABLE "HospitalEhrLabCodeMap"
    ADD CONSTRAINT "HospitalEhrLabCodeMap_mappedById_fkey"
    FOREIGN KEY ("mappedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
