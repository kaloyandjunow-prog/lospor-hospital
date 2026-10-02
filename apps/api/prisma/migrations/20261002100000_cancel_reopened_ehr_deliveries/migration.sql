-- A finalized case can be reopened during the undo window. Its unsent EHR
-- messages must become terminally cancelled rather than remaining eligible
-- for a later worker pass.
ALTER TYPE "EhrDeliveryStatus" ADD VALUE 'CANCELLED';
