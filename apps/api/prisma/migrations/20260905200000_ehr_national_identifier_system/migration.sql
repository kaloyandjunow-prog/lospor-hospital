-- Which system this hospital's ЕГН values live in.
--
-- The record number's system was added for the inbound patient check: a search
-- on value alone can return one clean match belonging to a different numbering,
-- and the configured system is what that match is verified against.
--
-- The same question has an outbound answer, and it had been answered wrongly.
-- A delivered record labels its patient with `subject.identifier`, and the
-- receiving hospital matches that against namespaces it knows. LOSPOR was
-- sending its own private OIDs, which are meaningless to them -- the equivalent
-- of labelling a specimen with your own department's internal numbering. The
-- number is right and nobody can file it.
--
-- The record number's system is reused for ИЗ №, asked once and used both ways.
-- ЕГН needs its own, because a national register and a hospital's admission
-- numbering are different namespaces; a site holding only ИЗ № never sets it.
--
-- Nullable, and the LOSPOR fallbacks stay in place when it is unset, so an
-- appliance that has not been configured behaves exactly as it did before.
ALTER TABLE "HospitalEhrTransportPolicy"
  ADD COLUMN "nationalIdentifierSystem"            TEXT,
  ADD COLUMN "nationalIdentifierSystemChangedAt"   TIMESTAMP(3),
  ADD COLUMN "nationalIdentifierSystemChangedById" TEXT;
