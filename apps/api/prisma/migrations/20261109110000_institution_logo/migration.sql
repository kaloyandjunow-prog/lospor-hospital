-- The hospital logo printed at the top of the paper documents (hospital 1.8.0).
-- A small PNG or JPEG kept on the hospital server as a data URL; absent means no logo.
ALTER TABLE "Institution" ADD COLUMN "logoDataUrl" TEXT;
