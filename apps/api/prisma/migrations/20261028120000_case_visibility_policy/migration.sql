CREATE TABLE "HospitalCaseVisibilityPolicy" (
    "id" TEXT NOT NULL DEFAULT 'local',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "changedAt" TIMESTAMP(3),
    "changedById" TEXT,
    "changeReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "HospitalCaseVisibilityPolicy_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "HospitalCaseVisibilityPolicy"
ADD CONSTRAINT "HospitalCaseVisibilityPolicy_changedById_fkey"
FOREIGN KEY ("changedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
