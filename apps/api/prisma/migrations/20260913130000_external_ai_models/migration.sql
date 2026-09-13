-- Which pinned Mistral models external AI uses.
--
-- The routes hardcoded open-mistral-7b and pixtral-12b-2409, both retired by
-- Mistral, so every AI feature failed once a hospital added its key. Null keeps
-- the release default; Hospital controls chooses from the pinned list in code.
ALTER TABLE "HospitalExternalAiPolicy"
  ADD COLUMN "advisorModel" TEXT,
  ADD COLUMN "visionModel" TEXT,
  ADD COLUMN "modelsChangedAt" TIMESTAMP(3);
