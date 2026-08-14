\set ON_ERROR_STOP on

-- PostgreSQL 17.11 restricts logical-decoding output plugins. Hospital does
-- not use logical decoding, so an existing logical slot or a locally-added
-- plugin is an unsupported site mutation. This runs before Prisma migrations
-- so no migration WAL is produced while that unsupported state exists.
DO $lospor$
DECLARE
  configured_plugin text;
BEGIN
  IF current_setting('server_version_num')::integer < 170011 THEN
    RAISE EXCEPTION 'Hospital requires PostgreSQL 17.11 or later before migrations';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_replication_slots
    WHERE slot_type = 'logical'
  ) THEN
    RAISE EXCEPTION 'Hospital does not support logical-decoding replication slots';
  END IF;

  FOR configured_plugin IN
    SELECT btrim(plugin)
    FROM unnest(string_to_array(current_setting('output_plugin_libraries'), ',')) AS plugins(plugin)
    WHERE btrim(plugin) <> ''
      AND btrim(plugin) NOT IN ('pgoutput', 'test_decoding')
  LOOP
    RAISE EXCEPTION 'Hospital does not permit custom logical-decoding output plugins';
  END LOOP;
END
$lospor$;
