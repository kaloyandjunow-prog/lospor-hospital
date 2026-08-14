\set ON_ERROR_STOP on

-- Record that the published PostgreSQL 17.11 remediation is needed, without
-- hiding the condition. PostgreSQL explicitly directs affected sites to repair
-- bogus GIN-table estimates with ANALYZE; the strict postcondition below then
-- fails closed if that repair does not succeed.
DO $lospor$
DECLARE
  affected_count bigint;
BEGIN
  SELECT count(DISTINCT table_relation.oid)
  INTO affected_count
    FROM pg_index AS index_definition
    JOIN pg_class AS index_relation
      ON index_relation.oid = index_definition.indexrelid
    JOIN pg_am AS access_method
      ON access_method.oid = index_relation.relam
    JOIN pg_class AS table_relation
      ON table_relation.oid = index_definition.indrelid
    JOIN pg_namespace AS table_namespace
      ON table_namespace.oid = table_relation.relnamespace
    WHERE access_method.amname = 'gin'
      AND table_relation.relkind IN ('r', 'm', 'p')
      AND table_namespace.nspname NOT IN ('pg_catalog', 'information_schema')
      AND table_namespace.nspname !~ '^pg_toast'
      AND table_namespace.nspname !~ '^pg_temp_'
      AND (
        table_relation.reltuples::text IN ('NaN', 'Infinity', '-Infinity')
        OR table_relation.reltuples < -1
      );
  IF affected_count > 0 THEN
    RAISE NOTICE 'Hospital will repair invalid GIN-table statistics on % table(s) with ANALYZE', affected_count;
  END IF;
END
$lospor$;

-- Refresh every user table that owns a GIN index. Identifier quoting is done
-- by format(%I), and the distinct target list prevents redundant scans when a
-- table has more than one GIN index.
DO $lospor$
DECLARE
  target record;
BEGIN
  FOR target IN
    SELECT DISTINCT table_namespace.nspname, table_relation.relname
    FROM pg_index AS index_definition
    JOIN pg_class AS index_relation
      ON index_relation.oid = index_definition.indexrelid
    JOIN pg_am AS access_method
      ON access_method.oid = index_relation.relam
    JOIN pg_class AS table_relation
      ON table_relation.oid = index_definition.indrelid
    JOIN pg_namespace AS table_namespace
      ON table_namespace.oid = table_relation.relnamespace
    WHERE access_method.amname = 'gin'
      AND table_relation.relkind IN ('r', 'm', 'p')
      AND table_namespace.nspname NOT IN ('pg_catalog', 'information_schema')
      AND table_namespace.nspname !~ '^pg_toast'
      AND table_namespace.nspname !~ '^pg_temp_'
    ORDER BY table_namespace.nspname, table_relation.relname
  LOOP
    EXECUTE format('ANALYZE %I.%I', target.nspname, target.relname);
  END LOOP;
END
$lospor$;

-- ANALYZE must leave each selected table with a finite, non-negative estimate.
DO $lospor$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_index AS index_definition
    JOIN pg_class AS index_relation
      ON index_relation.oid = index_definition.indexrelid
    JOIN pg_am AS access_method
      ON access_method.oid = index_relation.relam
    JOIN pg_class AS table_relation
      ON table_relation.oid = index_definition.indrelid
    JOIN pg_namespace AS table_namespace
      ON table_namespace.oid = table_relation.relnamespace
    WHERE access_method.amname = 'gin'
      AND table_relation.relkind IN ('r', 'm', 'p')
      AND table_namespace.nspname NOT IN ('pg_catalog', 'information_schema')
      AND table_namespace.nspname !~ '^pg_toast'
      AND table_namespace.nspname !~ '^pg_temp_'
      AND (
        table_relation.reltuples::text IN ('NaN', 'Infinity', '-Infinity')
        OR table_relation.reltuples < 0
      )
  ) THEN
    RAISE EXCEPTION 'Hospital could not establish valid GIN-table statistics after ANALYZE';
  END IF;
END
$lospor$;
