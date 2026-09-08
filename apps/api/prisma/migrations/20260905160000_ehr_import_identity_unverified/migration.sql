-- Whether the patient behind this import was matched on the record number alone.
--
-- A hospital numbers the same person several ways -- admission number, permanent
-- record number, ward number, visit number -- and those are separate namespaces
-- holding numbers of the same shape. A search on value alone can therefore
-- return exactly one match belonging to a different numbering, which is what a
-- wrong-patient import looks like from here: a clean single hit.
--
-- Once a site says which numbering its record numbers use, such a match is
-- refused. Until then the import proceeds, because a site cannot answer that
-- question before it has seen real traffic -- and this records that the identity
-- was never checked, so a clinician reviewing a proposed allergy list can see
-- how much the match is worth.
--
-- Stored rather than derived: review happens long after the pull, and by then
-- the search that produced the match is gone.
ALTER TABLE "EhrImport"
  ADD COLUMN "identityUnverified" BOOLEAN NOT NULL DEFAULT false;
