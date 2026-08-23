-- Record immutable case creation separately from the current assignee. This is
-- needed for the narrow Central withdraw/resend authority retained by a Member
-- after a case is transferred. It does not grant edit or general research
-- access.
ALTER TABLE "Case" ADD COLUMN "createdById" TEXT;

-- An accepted transfer is direct evidence of an earlier holder. With no
-- accepted transfer, the current assignee is the only available attribution.
UPDATE "Case" AS c
SET "createdById" = COALESCE(
  (
    SELECT t."fromUserId"
    FROM "CaseTransfer" AS t
    WHERE t."caseId" = c."id"
      AND t."status" = 'ACCEPTED'
    ORDER BY COALESCE(t."resolvedAt", t."createdAt") ASC,
             t."createdAt" ASC,
             t."id" ASC
    LIMIT 1
  ),
  c."userId"
);

ALTER TABLE "Case" ALTER COLUMN "createdById" SET NOT NULL;
CREATE INDEX "Case_createdById_createdAt_idx" ON "Case" ("createdById", "createdAt");

-- An offline draft id belongs to the immutable creator, not whichever account
-- currently has the case. Preserve every clinical record: if historical
-- transfers exposed a duplicate technical key, clear only the later duplicate
-- key before changing the uniqueness scope.
WITH ranked_creator_drafts AS (
  SELECT
    "id",
    row_number() OVER (
      PARTITION BY "createdById", "clientDraftId"
      ORDER BY "createdAt" ASC, "id" ASC
    ) AS occurrence
  FROM "Case"
  WHERE "clientDraftId" IS NOT NULL
)
UPDATE "Case" AS c
SET "clientDraftId" = NULL
FROM ranked_creator_drafts AS ranked
WHERE ranked."id" = c."id"
  AND ranked.occurrence > 1;

DROP INDEX "Case_userId_clientDraftId_key";
CREATE UNIQUE INDEX "Case_createdById_clientDraftId_key"
  ON "Case" ("createdById", "clientDraftId");

ALTER TABLE "Case"
  ADD CONSTRAINT "Case_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE FUNCTION "forbid_case_creator_change"()
RETURNS trigger AS $$
BEGIN
  IF NEW."createdById" IS DISTINCT FROM OLD."createdById" THEN
    RAISE EXCEPTION 'CASE_CREATOR_IMMUTABLE'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "Case_creator_immutable"
BEFORE UPDATE OF "createdById" ON "Case"
FOR EACH ROW EXECUTE FUNCTION "forbid_case_creator_change"();
