-- Where the adapter sends.
--
-- Deliberately a plain column rather than part of the sealed credential. An
-- operator has to be able to see where clinical data is being sent without
-- unsealing anything — "which server is this appliance talking to" is the first
-- question anyone reviewing an integration asks, and it should not require the
-- seal key to answer. A destination is site configuration, not a secret.
--
-- Null for FOLDER, which has no endpoint, and for a site that has not
-- configured one yet.

ALTER TABLE "HospitalEhrTransportPolicy" ADD COLUMN "endpoint" TEXT;
ALTER TABLE "HospitalEhrTransportPolicy" ADD COLUMN "endpointChangedAt" TIMESTAMP(3);
ALTER TABLE "HospitalEhrTransportPolicy" ADD COLUMN "endpointChangedById" TEXT;
