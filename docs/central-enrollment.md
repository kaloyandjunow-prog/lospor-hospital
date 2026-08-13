# Central enrollment

Enrollment is an explicit operation shared by the Hospital and Central
operators.

1. Hospital setup creates `secrets/api/site-client.csr`.
2. Central signs that CSR with its site-client CA:

   ```sh
   scripts/sign-site-csr.sh SITE_CODE hospital.csr hospital-cert.pem
   ```

3. Transfer `hospital-cert.pem` and Central's `site-client-ca.pem` through an
   approved secure channel. Install them as:
   - `secrets/api/site-client-cert.pem`
   - `secrets/api/central-ca.pem`
4. Central creates a one-use, 24-hour enrollment token:

   ```sh
   scripts/create-enrollment-token.sh "Hospital name"
   ```

5. Hospital completes enrollment. The script validates the certificate set,
   refreshes the API-only runtime secret volume, and safely restarts the API:

   ```sh
   scripts/enroll-central.sh \
     https://central.example.org \
     SITE_CODE \
     "Hospital name" \
     ONE_USE_TOKEN
   ```

6. Confirm site code, certificate fingerprint, signing-key ID, supported
   manifest version, and a signed test receipt on both sides.

Do not send private keys, patient keys, database credentials, or the raw
patient identifier to Central.
