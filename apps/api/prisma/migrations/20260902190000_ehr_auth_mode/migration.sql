-- How the adapter presents its credential.
--
-- A static bearer token is what a small site or a test server usually offers.
-- Most hospital FHIR servers use SMART-on-FHIR client credentials instead: a
-- client id and secret exchanged for a short-lived token. Supporting only one
-- would mean the appliance works against exactly the wrong half of the sites
-- that want it.
--
-- Only the secret is sealed. The token URL, the client id and the scope stay
-- readable, for the same reason the endpoint does: an operator has to be able
-- to see how this appliance presents itself, and to whom, without needing the
-- seal key to find out. A client id identifies; it does not authenticate.
--
-- Existing rows default to STATIC_BEARER, which is what they were already
-- doing.

CREATE TYPE "EhrAuthMode" AS ENUM ('STATIC_BEARER', 'OAUTH2_CLIENT_CREDENTIALS');

ALTER TABLE "HospitalEhrTransportPolicy"
  ADD COLUMN "authMode" "EhrAuthMode" NOT NULL DEFAULT 'STATIC_BEARER';
ALTER TABLE "HospitalEhrTransportPolicy" ADD COLUMN "tokenUrl" TEXT;
ALTER TABLE "HospitalEhrTransportPolicy" ADD COLUMN "clientId" TEXT;
ALTER TABLE "HospitalEhrTransportPolicy" ADD COLUMN "scope" TEXT;

-- Client credentials need somewhere to exchange them. A row that says OAuth2
-- with no token URL is a misconfiguration that would only surface as a failed
-- delivery hours later.
ALTER TABLE "HospitalEhrTransportPolicy"
  ADD CONSTRAINT "oauth_requires_token_url"
  CHECK ("authMode" <> 'OAUTH2_CLIENT_CREDENTIALS' OR "tokenUrl" IS NOT NULL);
