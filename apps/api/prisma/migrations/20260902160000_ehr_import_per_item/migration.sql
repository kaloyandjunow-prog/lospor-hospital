-- Stage an import one reviewable item at a time, not one field at a time.
--
-- A clinician accepts one diagnosis from a list and refuses another, so the
-- field is the wrong grain to decide at. With the whole list in a single row,
-- refusing one item recorded a refusal against `diagnoses` — and because a
-- refusal is deliberately remembered across future messages, that silenced
-- every diagnosis this patient would ever be sent again.
--
-- `itemKey` is the key Core derives for an item, stable across the hospital
-- recoding or relabelling the same thing. For a scalar field it is just the
-- field name, so a scalar keeps exactly one row as before.
--
-- No data migration: these tables were added in the same unreleased release
-- and no appliance has ever written to them.

DELETE FROM "EhrImportField";

ALTER TABLE "EhrImportField" ADD COLUMN "itemKey" TEXT NOT NULL;

DROP INDEX "EhrImportField_importId_section_fieldKey_key";

CREATE UNIQUE INDEX "EhrImportField_importId_itemKey_key"
  ON "EhrImportField" ("importId", "itemKey");

CREATE INDEX "EhrImportField_importId_section_fieldKey_idx"
  ON "EhrImportField" ("importId", "section", "fieldKey");
