-- Link the independently authenticated Status service to one protected
-- clinical administrator. The credential generation is deliberately monotonic:
-- the host-side coordinator can resume a rotation after either service stops.
ALTER TABLE "HospitalInstallation"
  ADD COLUMN "applianceOperatorUserId" TEXT,
  ADD COLUMN "operatorCredentialGeneration" INTEGER NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX "HospitalInstallation_applianceOperatorUserId_key"
  ON "HospitalInstallation"("applianceOperatorUserId");

ALTER TABLE "HospitalInstallation"
  ADD CONSTRAINT "HospitalInstallation_applianceOperatorUserId_fkey"
  FOREIGN KEY ("applianceOperatorUserId") REFERENCES "User"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
