-- Withdraw the timestamp-precision control that was never implemented.
--
-- includeExactTimes was accepted by the export policy route, persisted, and
-- audit-logged, and read by no code at any point. An administrator could switch
-- it off, watch it save, and every timestamp still left the hospital at full
-- precision.
--
-- It is removed rather than implemented. Blurring clock times in an anaesthesia
-- register destroys the intervals the register exists to record: two drugs
-- given at 14:05 and 14:50 both become 14:00 and read as simultaneous. If
-- calendar dates ever need protecting, the technique is date shifting agreed
-- with Central -- every date for a patient moved by the same random offset, so
-- intervals survive exactly -- and not a switch that coarsens them.
--
-- Dropping the column loses nothing: it never influenced an export, so no
-- stored value describes anything that happened.

ALTER TABLE "CentralExportPolicy" DROP COLUMN "includeExactTimes";
