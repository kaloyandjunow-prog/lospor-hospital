# Central enrollment

Enrollment is an explicit operation shared by the Hospital and Central
operators.

1. Hospital setup creates `secrets/site-client.csr`.
2. Central signs that CSR with its site-client CA:

   ```sh
   scripts/sign-site-csr.sh SITE_CODE hospital.csr hospital-cert.pem
   ```

3. Transfer `hospital-cert.pem` and Central's `site-client-ca.pem` through an
   approved secure channel. Install them as:
   - `secrets/site-client-cert.pem`
   - `secrets/central-ca.pem`
4. Restart the Hospital API.
5. Central creates a one-use, 24-hour enrollment token:

   ```sh
   scripts/create-enrollment-token.sh "Hospital name"
   ```

6. Hospital completes enrollment:

   ```sh
   scripts/enroll-central.sh \
     https://central.example.org \
     SITE_CODE \
     "Hospital name" \
     ONE_USE_TOKEN
   ```

7. Confirm site code, certificate fingerprint, signing-key ID, supported
   manifest version, and a signed test receipt on both sides.

Do not send private keys, patient keys, database credentials, or the raw
patient identifier to Central.
