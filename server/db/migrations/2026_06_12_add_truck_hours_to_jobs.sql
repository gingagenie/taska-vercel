-- Add truck_hours (truck hour-meter reading) to jobs and completed_jobs.
-- Editable anytime on a live job; copied into completed_jobs at completion
-- so it appears on the completed job sheet PDF.

ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS truck_hours numeric(8,1);

ALTER TABLE completed_jobs
  ADD COLUMN IF NOT EXISTS truck_hours numeric(8,1);
