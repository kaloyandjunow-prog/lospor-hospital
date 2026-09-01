-- Remember which keys this database was built under.
--
-- The patient keys are generated once at install and never rotate. They live in
-- .env and in whatever the hospital escrowed; backups carry their fingerprints,
-- never the keys themselves. So a lost .env means every stored identifier is
-- undecryptable and every pseudonym already delivered to Central can never be
-- matched again.
--
-- The dangerous case is not losing them outright, which is at least obvious. It
-- is restoring a database without its secrets: the appliance starts, serves,
-- accepts cases, and writes into a parallel identity space, looking entirely
-- healthy while every new record is unrelatable to every old one.
--
-- Recording the fingerprints makes that detectable. No row means nothing has
-- been recorded yet -- a fresh install, or the first start after this shipped --
-- and whatever keys are loaded are then written down as correct. A fresh
-- install cannot be blocked by this, because there is nothing yet to disagree
-- with.

CREATE TABLE "HospitalKeyIdentity" (
  "id"                              TEXT NOT NULL DEFAULT 'local',
  "patientHmacKeyFingerprint"       TEXT NOT NULL,
  "patientEncryptionKeyFingerprint" TEXT NOT NULL,
  "exportPseudonymKeyFingerprint"   TEXT NOT NULL,
  "recordedAt"                      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  -- Set only when an operator has deliberately continued under different keys,
  -- accepting that identities written under the old ones are gone. A recovery
  -- choice, and one that carries a name and a reason.
  "overriddenAt"                    TIMESTAMP(3),
  "overriddenById"                  TEXT,
  "overrideReason"                  TEXT,
  "updatedAt"                       TIMESTAMP(3) NOT NULL,

  CONSTRAINT "HospitalKeyIdentity_pkey" PRIMARY KEY ("id")
);
