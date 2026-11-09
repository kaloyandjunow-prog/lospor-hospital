-- Show the full ИЗ № while a case is open (hospital 1.8.0). On unless switched off in Status.
ALTER TABLE "HospitalPatientIdentifierPolicy" ADD COLUMN "admissionNumberVisible" BOOLEAN NOT NULL DEFAULT true;
