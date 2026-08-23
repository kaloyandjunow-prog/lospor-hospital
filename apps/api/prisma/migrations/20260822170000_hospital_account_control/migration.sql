-- 1.2.0 Hospital-only account provisioning and mail-independent access links.
--
-- AccountKind is guarded because the deliberately staged shared 1.2.0 import
-- also introduces the same durable classification. This Hospital migration may
-- land on an appliance before that import is available. The later import must
-- reconcile its migration history rather than attempt CREATE TYPE a second
-- time; see docs/account-provisioning.md.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'AccountKind') THEN
    CREATE TYPE "AccountKind" AS ENUM ('CLINICAL', 'RESEARCH_ONLY');
  END IF;
END $$;

ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "accountKind" "AccountKind" NOT NULL DEFAULT 'CLINICAL';

-- Preserve the meaning of existing legacy research accounts during the staged
-- import. New Status-provisioned research accounts write both fields until the
-- pinned shared API is advanced.
UPDATE "User"
SET "accountKind" = 'RESEARCH_ONLY'
WHERE "role" = 'RESEARCHER';

CREATE TYPE "HospitalAccountTokenPurpose" AS ENUM ('ACTIVATION', 'RECOVERY');

CREATE TABLE "HospitalAccountAccessToken" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "purpose" "HospitalAccountTokenPurpose" NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "consumedAt" TIMESTAMP(3),
  "invalidatedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "HospitalAccountAccessToken_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "HospitalAccountAccessToken_tokenHash_format_check"
    CHECK ("tokenHash" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "HospitalAccountAccessToken_terminal_state_check"
    CHECK (NOT ("consumedAt" IS NOT NULL AND "invalidatedAt" IS NOT NULL))
);

CREATE UNIQUE INDEX "HospitalAccountAccessToken_tokenHash_key"
  ON "HospitalAccountAccessToken"("tokenHash");
CREATE INDEX "HospitalAccountAccessToken_userId_purpose_consumedAt_invalidatedAt_idx"
  ON "HospitalAccountAccessToken"("userId", "purpose", "consumedAt", "invalidatedAt");
CREATE INDEX "HospitalAccountAccessToken_expiresAt_idx"
  ON "HospitalAccountAccessToken"("expiresAt");

ALTER TABLE "HospitalAccountAccessToken"
  ADD CONSTRAINT "HospitalAccountAccessToken_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
