\set ON_ERROR_STOP on

-- The database sorts text with the operating system's C library, and the
-- order it sorts in is baked into every btree index on a text column. When
-- the PostgreSQL image moves to a newer C library (Hospital 1.4.22: Debian 12
-- glibc 2.36 to Debian 13 glibc 2.41), the same bytes can sort differently,
-- an index built under the old order can then miss rows, and a unique index
-- can admit a duplicate. PostgreSQL detects this by comparing the version it
-- recorded at initdb with the version the library reports now.
--
-- This runs before migrations, so nothing writes through a stale index.
-- Rebuilding is skipped when the versions already agree, which is every update
-- that does not change the C library. Rollback restores the pre-update backup,
-- so an index rebuilt here is never opened by the older image.

-- REINDEX DATABASE cannot run inside a transaction block or DO statement, so
-- the statement is generated and executed by psql.
SELECT format('REINDEX DATABASE %I', datname)
FROM pg_database
WHERE datname = current_database()
  AND datcollversion IS DISTINCT FROM pg_database_collation_actual_version(oid)
\gexec

-- Record the new version for every database that accepts connections. The
-- template and maintenance databases hold no user indexes, and the system
-- catalogs sort with the "C" collation, which no C library update changes.
SELECT format('ALTER DATABASE %I REFRESH COLLATION VERSION', datname)
FROM pg_database
WHERE datallowconn
  AND datcollversion IS DISTINCT FROM pg_database_collation_actual_version(oid)
ORDER BY datname
\gexec

DO $lospor$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_database
    WHERE datallowconn
      AND datcollversion IS DISTINCT FROM pg_database_collation_actual_version(oid)
  ) THEN
    RAISE EXCEPTION 'Hospital could not reconcile the database collation version';
  END IF;
END
$lospor$;
