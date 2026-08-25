-- Hospital 1.2 uses a case-preserving username for authentication and keeps
-- email as an optional contact address. This appliance has not been deployed,
-- so the migration fails closed if a development database already contains
-- accounts: reset it and let guided installation provision every identity
-- explicitly. Never synthesize a login from an email address or internal ID.
ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "username" TEXT,
  ADD COLUMN IF NOT EXISTS "usernameCanonical" TEXT,
  ADD COLUMN IF NOT EXISTS "activatedAt" TIMESTAMP(3);

UPDATE "User"
SET "activatedAt" = "emailVerifiedAt"
WHERE "activatedAt" IS NULL
  AND "emailVerifiedAt" IS NOT NULL;

ALTER TABLE "User" ALTER COLUMN "email" DROP NOT NULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "User" WHERE "username" IS NULL OR "usernameCanonical" IS NULL) THEN
    RAISE EXCEPTION 'Hospital username migration requires an empty User table or explicit username migration';
  END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS "User_usernameCanonical_key"
  ON "User"("usernameCanonical");

ALTER TABLE "User"
  DROP CONSTRAINT IF EXISTS "User_login_identity_present",
  DROP CONSTRAINT IF EXISTS "User_username_pair",
  DROP CONSTRAINT IF EXISTS "User_username_format";

ALTER TABLE "User"
  ADD CONSTRAINT "User_login_identity_present"
    CHECK ("usernameCanonical" IS NOT NULL OR "deletedAt" IS NOT NULL),
  ADD CONSTRAINT "User_username_pair"
    CHECK (("username" IS NULL) = ("usernameCanonical" IS NULL)),
  ADD CONSTRAINT "User_username_format"
    CHECK (
      "username" IS NULL
      OR (
        char_length("username") BETWEEN 3 AND 64
        AND "username" ~ '^[A-Za-z][A-Za-z0-9._-]{2,63}$'
        AND lower("username") = "usernameCanonical"
      )
    );

CREATE TABLE "HospitalUsernameReservation" (
  "id" TEXT NOT NULL,
  "usernameCanonical" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "releasedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "HospitalUsernameReservation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "HospitalUsernameReservation_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "HospitalUsernameReservation_active_username_key"
  ON "HospitalUsernameReservation"("usernameCanonical")
  WHERE "releasedAt" IS NULL;
CREATE INDEX "HospitalUsernameReservation_userId_createdAt_idx"
  ON "HospitalUsernameReservation"("userId", "createdAt");
CREATE INDEX "HospitalUsernameReservation_usernameCanonical_createdAt_idx"
  ON "HospitalUsernameReservation"("usernameCanonical", "createdAt");

INSERT INTO "HospitalUsernameReservation" (
  "id", "usernameCanonical", "userId", "createdAt"
)
SELECT
  'migrated-' || md5("id" || ':' || "usernameCanonical"),
  "usernameCanonical",
  "id",
  CURRENT_TIMESTAMP
FROM "User"
WHERE "usernameCanonical" IS NOT NULL;
