# Updates and compatibility

Hospital releases are immutable bundles with pinned upstream snapshots in
`UPSTREAM_VERSIONS.json`. Hospital-only commits never flow back into the public
serverless repositories automatically.

Update a staged release:

```sh
./scripts/update.sh
```

The script takes a backup, verifies pinned source and exchange-contract
metadata, runs tests supplied in the bundle, builds images, applies forward
database migrations, and performs health checks.

Database migrations must be backward compatible for the rollback window.
Never roll database schema backward with ad hoc SQL; restore the pre-update
backup if rollback is required.

The exchange manifest is explicitly versioned. Central advertises supported
versions and Hospital refuses an incompatible enrollment. Once a second
manifest version exists, Central should retain the previous production version
for at least 24 months or for the contractual hospital upgrade window,
whichever is longer. This is a support policy, not permission for silent data
conversion.
